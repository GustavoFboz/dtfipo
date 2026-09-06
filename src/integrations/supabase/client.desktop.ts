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

const auth = new Proxy(cloudSupabase.auth, {
  get(target, prop, receiver) {
    if (prop === "getSession") {
      return async () => {
        try {
          const result = await target.getSession();
          if (result.data.session) return result;
        } catch {
          // A disconnected Windows device can fail before auth storage resolves.
        }

        const identity = await getProvisionedDesktopIdentity();
        const session = makeOfflineSession(identity);
        return { data: { session }, error: null };
      };
    }
    return Reflect.get(target, prop, receiver);
  },
});

/**
 * Desktop-only Supabase facade.
 *
 * Network operations still go to the real Supabase client. Only getSession()
 * gains a finite-lived device fallback so local-first repositories can resolve
 * the same owner id after Windows restarts without internet.
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
