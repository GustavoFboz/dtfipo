import { supabase } from "@/integrations/supabase/client";
import {
  getProvisionedDesktopIdentity,
  isDentalFlowDesktop,
  type DeviceIdentity,
} from "@/lib/desktop-local";

export type EffectiveDesktopIdentity = {
  userId: string;
  source: "cloud" | "device";
  deviceIdentity: DeviceIdentity | null;
};

/**
 * Resolve the identity used by the local-first layer.
 *
 * Supabase remains authoritative while a cloud session is available. When the
 * Windows app is offline (or the browser reports a network that cannot actually
 * reach Supabase), a previously provisioned device identity becomes the owner of
 * the local SQLite cache. This is what lets the same cached rows remain visible
 * after restarting Windows with no internet connection.
 */
export async function resolveDesktopIdentity(): Promise<EffectiveDesktopIdentity | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (userId) {
      return { userId, source: "cloud", deviceIdentity: null };
    }
  } catch {
    // The cloud auth client can fail during a real offline boot. Fall through to
    // the device provision instead of treating this as a logged-out state.
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

export async function resolveDesktopOwnerId(): Promise<string | null> {
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

export async function resolveOfflineAuthUser() {
  const identity = await resolveDesktopIdentity();
  if (!identity || identity.source !== "device" || !identity.deviceIdentity) return null;
  const device = identity.deviceIdentity;
  return {
    id: device.user_id,
    email: device.email ?? undefined,
    user_metadata: { full_name: device.full_name ?? undefined },
  };
}
