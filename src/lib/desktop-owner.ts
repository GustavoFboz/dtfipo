import { supabase } from "@/integrations/supabase/client";
import { getProvisionedDesktopIdentity, isDentalFlowDesktop } from "./desktop-local";

/** Resolve the local data owner without making offline repositories depend on a
 * live network request. A valid Supabase session always wins. If it is absent,
 * only a finite-lived identity previously provisioned by an authenticated
 * Desktop session may be used. */
export async function resolveDesktopOwnerId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const id = data.session?.user?.id;
    if (id) return id;
  } catch {
    // Continue to the provisioned-device identity on Desktop.
  }

  if (!isDentalFlowDesktop()) return null;
  try {
    const identity = await getProvisionedDesktopIdentity();
    if (!identity || identity.valid_until <= Date.now()) return null;
    return identity.user_id;
  } catch {
    return null;
  }
}

export async function requireDesktopOwnerId(): Promise<string> {
  const id = await resolveDesktopOwnerId();
  if (!id) {
    throw new Error("A autorização offline deste computador não está disponível ou expirou. Reconecte o DentalFlow para revalidar o dispositivo.");
  }
  return id;
}
