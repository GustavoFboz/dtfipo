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
            const result = await target.getSession();
            if (result.data.session) {
              usingOfflineDeviceSession = false;
              return result;
            }
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
            const result = await target.getUser();
            if (result.data.user) {
              usingOfflineDeviceSession = false;
              return result;
            }
          } catch {
            // When Cloud Login is unavailable, keep the installed Windows app usable.
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
  // Use a network-shaped message so every local-first adapter takes its SQLite
  // fallback instead of interpreting unauthenticated RLS zero rows as truth.
  throw new TypeError(`Failed to fetch: Cloud Login is offline (${operation})`);
}

/**
 * Desktop-only authentication facade for Lovable Cloud Login.
 *
 * A finite-lived local device session unlocks SQLite after a previously valid
 * online login. Crucially, that synthetic session is never allowed to issue
 * database/RPC reads as though it were a real Cloud Login token. This prevents
 * protected queries from returning deceptive empty arrays and erasing good local
 * snapshots while Windows is offline or Cloud Login is temporarily unavailable.
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
