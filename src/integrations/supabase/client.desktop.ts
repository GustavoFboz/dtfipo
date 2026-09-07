import type { Session, User } from "@supabase/supabase-js";
import { supabase as cloudSupabase } from "./client";
import {
  clearProvisionedDesktopIdentity,
  getProvisionedDesktopIdentity,
} from "@/lib/desktop-local";
import {
  DESKTOP_AUTH_TIMEOUT_MS,
  withDesktopCloudTimeout,
} from "@/lib/desktop-cloud";

const OFFLINE_MARKER = "dentalflow_offline_device";
const LOCAL_ACCESS_TOKEN = "dentalflow-local-device-session";
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
    access_token: LOCAL_ACCESS_TOKEN,
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

function emitAccountChanged(deviceUserId: string, cloudUserId: string) {
  if (typeof window === "undefined" || deviceUserId === cloudUserId) return;
  window.dispatchEvent(
    new CustomEvent("dentalflow:desktop-account-changed", {
      detail: { previousDeviceUserId: deviceUserId, cloudUserId },
    }),
  );
}

/**
 * WebView2 persists the Cloud Login storage between installer upgrades. A stored
 * token is not considered cloud-authoritative until Cloud Login validates it.
 *
 * A valid cloud login is always the current account. If it differs from an old
 * device provision we DO NOT log the user out: SQLite is already namespaced by
 * owner id, so the old cache remains isolated and the bootstrap provisions the
 * newly authenticated account. The previous implementation signed out on this
 * mismatch and was capable of sending a perfectly valid user back to the login
 * screen after an update.
 */
async function validatedCloudSession(target: typeof cloudSupabase.auth) {
  const sessionResult = await withDesktopCloudTimeout(
    "Cloud Login (sessão)",
    () => target.getSession(),
    DESKTOP_AUTH_TIMEOUT_MS,
  );
  const session = sessionResult.data.session;
  if (!session || session.access_token === LOCAL_ACCESS_TOKEN) {
    return { session: null, user: null };
  }

  const userResult = await withDesktopCloudTimeout(
    "Cloud Login (usuário)",
    () => target.getUser(),
    DESKTOP_AUTH_TIMEOUT_MS,
  );
  const user = userResult.data.user;
  if (!user || user.id !== session.user.id) return { session: null, user: null };

  const deviceIdentity = await getProvisionedDesktopIdentity().catch(() => null);
  if (deviceIdentity && deviceIdentity.valid_until > Date.now() && deviceIdentity.user_id !== user.id) {
    emitAccountChanged(deviceIdentity.user_id, user.id);
  }

  usingOfflineDeviceSession = false;
  return { session: { ...session, user } as Session, user };
}

async function forceLocalCloudLoginSignOut(target: typeof cloudSupabase.auth) {
  try {
    await withDesktopCloudTimeout(
      "Cloud Login (logout)",
      () => target.signOut({ scope: "local" }),
      DESKTOP_AUTH_TIMEOUT_MS,
    );
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
            if (validated.session) return { data: { session: validated.session }, error: null };
          } catch {
            // Physical connectivity does not guarantee Cloud Login connectivity.
          }
        }

        const { session } = await localCloudLoginFallback();
        return { data: { session }, error: null };
      };
    }

    if (prop === "getUser") {
      return async (...args: unknown[]) => {
        if (args.length > 0) {
          return withDesktopCloudTimeout(
            "Cloud Login (usuário)",
            () => (target.getUser as any)(...args),
            DESKTOP_AUTH_TIMEOUT_MS,
          );
        }

        const definitelyOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (!definitelyOffline) {
          try {
            const validated = await validatedCloudSession(target);
            if (validated.user) return { data: { user: validated.user }, error: null };
          } catch {
            // Use the finite local device identity below.
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
            const result = await withDesktopCloudTimeout(
              "Cloud Login (logout)",
              () => (target.signOut as any)(...args),
              DESKTOP_AUTH_TIMEOUT_MS,
            );
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
 * A finite-lived device session can unlock SQLite, but never authorizes protected
 * cloud reads. Every stored cloud session is bounded and server-revalidated.
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
  return Boolean(
    session?.user?.user_metadata?.[OFFLINE_MARKER] ||
      session?.access_token === LOCAL_ACCESS_TOKEN,
  );
}
