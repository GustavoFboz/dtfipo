import type { Session, User } from "@supabase/supabase-js";
import { supabase as cloudSupabase } from "./client";
import {
  clearProvisionedDesktopIdentity,
  getProvisionedDesktopIdentity,
} from "@/lib/desktop-local";

const OFFLINE_MARKER = "dentalflow_offline_device";
let usingOfflineDeviceSession = false;

function makeOfflineUser(identity: Awaited<ReturnType<typeof getProvisionedDesktopIdentity>>): User | null {
  if (!identity || identity.valid_until <= Date.now()) return null;
  const createdAt = new Date(identity.validated_at).toISOString();
  return {
    id: identity.user_id,
    aud: "authenticated",
    role: "authenticated",
    email: identity.email ?? undefined,
    phone: "",
    app_metadata: {},
    user_metadata: {
      full_name: identity.full_name ?? undefined,
      clinic_id: identity.clinic_id ?? undefined,
      [OFFLINE_MARKER]: true,
    },
    identities: [],
    created_at: createdAt,
    updated_at: createdAt,
    is_anonymous: false,
  } as User;
}

function makeOfflineSession(identity: Awaited<ReturnType<typeof getProvisionedDesktopIdentity>>): Session | null {
  const user = makeOfflineUser(identity);
  if (!identity || !user) return null;
  const expiresIn = Math.max(0, Math.floor((identity.valid_until - Date.now()) / 1000));
  if (expiresIn <= 0) return null;
  return {
    access_token: "dentalflow-local-device-session",
    refresh_token: "",
    expires_in: expiresIn,
    expires_at: Math.floor(identity.valid_until / 1000),
    token_type: "bearer",
    user,
  } as Session;
}

async function localCloudLoginFallback() {
  const identity = await getProvisionedDesktopIdentity();
  const user = makeOfflineUser(identity);
  const session = makeOfflineSession(identity);
  usingOfflineDeviceSession = Boolean(session && user);
  return { identity, user, session };
}

function emitAccountMismatch(deviceUserId: string, cloudUserId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("dentalflow:desktop-account-mismatch", {
      detail: { deviceUserId, cloudUserId },
    }),
  );
}

/**
 * A persisted browser session is not enough proof that the Desktop can query the
 * cloud. WebView2 can keep old auth storage across installer upgrades, so the
 * session must be revalidated against Cloud Login before it is classified as a
 * real cloud identity. This prevents a stale account from making every RLS query
 * look legitimately empty.
 */
async function validatedCloudSession(target: typeof cloudSupabase.auth) {
  const sessionResult = await target.getSession();
  const session = sessionResult.data.session;
  if (!session) return { session: null, user: null, mismatch: false };

  const userResult = await target.getUser();
  const user = userResult.data.user;
  if (!user || user.id !== session.user.id) {
    return { session: null, user: null, mismatch: false };
  }

  const deviceIdentity = await getProvisionedDesktopIdentity().catch(() => null);
  if (
    deviceIdentity &&
    deviceIdentity.valid_until > Date.now() &&
    deviceIdentity.user_id !== user.id
  ) {
    // Never silently switch the owner of a clinical SQLite cache. A stale WebView
    // login must be explicitly re-authenticated instead of overwriting the
    // previously validated device identity with a different account.
    await target.signOut({ scope: "local" }).catch(() => undefined);
    await clearProvisionedDesktopIdentity().catch(() => undefined);
    usingOfflineDeviceSession = false;
    emitAccountMismatch(deviceIdentity.user_id, user.id);
    return { session: null, user: null, mismatch: true };
  }

  usingOfflineDeviceSession = false;
  return { session: { ...session, user } as Session, user, mismatch: false };
}

async function forceLocalCloudLoginSignOut(target: typeof cloudSupabase.auth) {
  try {
    await target.signOut({ scope: "local" });
  } catch {
    // The device authorization below is the authoritative offline gate.
  }
  try {
    await clearProvisionedDesktopIdentity();
  } catch (error) {
    console.warn("[DentalFlow Desktop] Não foi possível revogar a autorização offline local", error);
  }
  usingOfflineDeviceSession = false;
}

const auth = new Proxy(cloudSupabase.auth, {
  get(target, prop, receiver) {
    if (prop === "getSession") {
      return async () => {
        const definitelyOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (!definitelyOffline) {
          try {
            const validated = await validatedCloudSession(target);
            if (validated.session) {
              return { data: { session: validated.session }, error: null };
            }
            if (validated.mismatch) return { data: { session: null }, error: null };
          } catch {
            // Cloud Login can be temporarily unreachable; use the validated device session below.
          }
        }

        const { session } = await localCloudLoginFallback();
        return { data: { session }, error: null };
      };
    }

    if (prop === "getUser") {
      return async (...args: unknown[]) => {
        if (args.length > 0) return (target.getUser as any)(...args);

        const definitelyOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (!definitelyOffline) {
          try {
            const validated = await validatedCloudSession(target);
            if (validated.user) {
              return { data: { user: validated.user }, error: null };
            }
            if (validated.mismatch) return { data: { user: null }, error: null };
          } catch {
            // When Cloud Login is unavailable, keep the installed app usable.
          }
        }

        const { user } = await localCloudLoginFallback();
        return { data: { user }, error: null };
      };
    }

    if (prop === "signOut") {
      return async (...args: unknown[]) => {
        const definitelyOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (!definitelyOffline) {
          try {
            const result = await (target.signOut as any)(...args);
            await clearProvisionedDesktopIdentity().catch(() => undefined);
            usingOfflineDeviceSession = false;
            return result;
          } catch {
            // Even if the server cannot be reached, manual logout revokes this device locally.
          }
        }

        await forceLocalCloudLoginSignOut(target);
        return { error: null };
      };
    }

    return Reflect.get(target, prop, receiver);
  },
});

function requireRealCloudSession(operation: string) {
  if (!usingOfflineDeviceSession) return;
  throw new TypeError(`Failed to fetch: Cloud Login is offline (${operation})`);
}

/**
 * Desktop-only authentication facade for Lovable Cloud Login.
 *
 * A finite-lived local device session unlocks SQLite after a previously valid
 * online login. A persisted WebView session is server-validated before any cloud
 * access, and a synthetic device session is never allowed to issue database/RPC
 * requests. This keeps account ownership and offline clinical caches isolated.
 */
export const supabase = new Proxy(cloudSupabase, {
  get(target, prop, receiver) {
    if (prop === "auth") return auth;
    if (prop === "from") {
      return (...args: unknown[]) => {
        requireRealCloudSession("database");
        return (target.from as any)(...args);
      };
    }
    if (prop === "rpc") {
      return (...args: unknown[]) => {
        requireRealCloudSession("rpc");
        return (target.rpc as any)(...args);
      };
    }
    return Reflect.get(target, prop, receiver);
  },
});

export function isOfflineDeviceSession(session: Session | null | undefined) {
  return Boolean(session?.user?.user_metadata?.[OFFLINE_MARKER]);
}
