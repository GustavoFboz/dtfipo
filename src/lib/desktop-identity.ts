import { supabase } from "@/integrations/supabase/client";
import {
  getProvisionedDesktopIdentity,
  isDentalFlowDesktop,
  type DeviceIdentity,
} from "@/lib/desktop-local";

const OFFLINE_MARKER = "dentalflow_offline_device";
const LOCAL_ACCESS_TOKEN = "dentalflow-local-device-session";

export type EffectiveDesktopIdentity = {
  userId: string;
  source: "cloud" | "device";
  deviceIdentity: DeviceIdentity | null;
};

function sessionIsDeviceOnly(session: any) {
  return Boolean(
    session?.user?.user_metadata?.[OFFLINE_MARKER] ||
      session?.access_token === LOCAL_ACCESS_TOKEN,
  );
}

/**
 * Resolve the identity used by the local-first layer.
 *
 * A synthetic device session is intentionally NOT classified as a cloud session.
 * It can unlock SQLite after a previously verified login, but it is never proof
 * that PostgREST/RLS currently sees an authenticated user.
 */
export async function resolveDesktopIdentity(): Promise<EffectiveDesktopIdentity | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    const userId = session?.user?.id;
    if (userId && !sessionIsDeviceOnly(session)) {
      return { userId, source: "cloud", deviceIdentity: null };
    }
  } catch {
    // A real offline boot can make Cloud Login unreachable. Fall through to the
    // finite-lived device provision instead of treating the user as logged out.
  }

  if (!isDentalFlowDesktop()) return null;

  try {
    const identity = await getProvisionedDesktopIdentity();
    if (!identity || identity.valid_until <= Date.now()) return null;
    return { userId: identity.user_id, source: "device", deviceIdentity: identity };
  } catch {
    return null;
  }
}

/**
 * Resolve only the SQLite owner namespace. Local reads never need a network
 * round-trip. This identity does not authorize Cloud requests.
 */
export async function resolveDesktopOwnerId(): Promise<string | null> {
  if (isDentalFlowDesktop()) {
    try {
      const identity = await getProvisionedDesktopIdentity();
      if (identity && identity.valid_until > Date.now()) return identity.user_id;
    } catch {
      // Fall back to the validated cloud/device resolution below.
    }
  }
  return (await resolveDesktopIdentity())?.userId ?? null;
}

export async function requireDesktopOwnerId(): Promise<string> {
  const ownerId = await resolveDesktopOwnerId();
  if (!ownerId) {
    throw new Error(
      "Este computador ainda não possui uma sessão offline válida. Conecte-se uma vez para validar o dispositivo e sincronizar os dados.",
    );
  }
  return ownerId;
}

/**
 * A protected Lovable Cloud request is allowed only after a REAL Cloud Login has
 * been validated. A device provision is deliberately insufficient here.
 *
 * This closes the 0.2.6/0.2.7 failure mode where the Desktop was physically
 * online, attempted PostgREST with no valid JWT and RLS correctly returned HTTP
 * 200 + []. Those empty arrays were then indistinguishable from an empty clinic
 * and could contaminate the SQLite mirrors.
 */
export async function canUseDentalFlowCloud(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const identity = await resolveDesktopIdentity();
  return identity?.source === "cloud";
}

export async function resolveOfflineAuthUser() {
  const identity = await resolveDesktopIdentity();
  if (!identity || identity.source !== "device" || !identity.deviceIdentity) return null;
  const device = identity.deviceIdentity;
  return {
    id: device.user_id,
    email: device.email ?? undefined,
    user_metadata: {
      full_name: device.full_name ?? undefined,
      clinic_id: device.clinic_id ?? undefined,
      [OFFLINE_MARKER]: true,
    },
  };
}
