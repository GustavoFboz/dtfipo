import type { Session, User } from "@supabase/supabase-js";
import { supabase as cloudSupabase } from "./client";
import { getProvisionedDesktopIdentity } from "@/lib/desktop-local";

const OFFLINE_MARKER = "dentalflow_offline_device";

function makeOfflineUser(identity: Awaited<ReturnType<typeof getProvisionedDesktopIdentity>>): User | null {
  if (!identity) return null;
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
  return {
    identity,
    user: makeOfflineUser(identity),
    session: makeOfflineSession(identity),
  };
}

const auth = new Proxy(cloudSupabase.auth, {
  get(target, prop, receiver) {
    if (prop === "getSession") {
      return async () => {
        const definitelyOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (!definitelyOffline) {
          try {
            const result = await target.getSession();
            if (result.data.session) return result;
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
        // Explicit access-token validation must remain a real Cloud Login operation.
        if (args.length > 0) return (target.getUser as any)(...args);

        const definitelyOffline = typeof navigator !== "undefined" && navigator.onLine === false;
        if (!definitelyOffline) {
          try {
            const result = await target.getUser();
            if (result.data.user) return result;
          } catch {
            // When Cloud Login is unavailable, keep the installed Windows app usable.
          }
        }

        const { user } = await localCloudLoginFallback();
        return { data: { user }, error: null };
      };
    }

    return Reflect.get(target, prop, receiver);
  },
});

/**
 * Desktop-only authentication facade for Lovable Cloud Login.
 *
 * The normal online login continues to be validated by Lovable Cloud Login. The
 * current application reaches that service through the generated Supabase auth
 * SDK, but this file does not change database tables, RLS, users or Cloud Login
 * configuration. It only gives the installed Windows client a finite-lived local
 * device session for getSession()/getUser() after a previous successful online
 * login, allowing the already-synchronized SQLite data to remain accessible when
 * there is no internet connection.
 */
export const supabase = new Proxy(cloudSupabase, {
  get(target, prop, receiver) {
    if (prop === "auth") return auth;
    return Reflect.get(target, prop, receiver);
  },
});

export function isOfflineDeviceSession(session: Session | null | undefined) {
  return Boolean(session?.user?.user_metadata?.[OFFLINE_MARKER]);
}
