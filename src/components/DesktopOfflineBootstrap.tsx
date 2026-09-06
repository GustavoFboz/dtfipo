import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isDentalFlowDesktop, provisionDesktopIdentity } from "@/lib/desktop-local";
import { syncDesktopOfflineData } from "@/lib/desktop-sync";

/**
 * Starts the local-first desktop layer only after the authenticated shell exists.
 * While online, the current cloud identity is provisioned on this Windows device
 * before the datasets are warmed. That provision is finite-lived and exists so a
 * previously validated device can later restart without a network dependency.
 */
export function DesktopOfflineBootstrap() {
  useEffect(() => {
    if (!isDentalFlowDesktop()) return;

    let disposed = false;

    const run = async () => {
      try {
        if (typeof navigator === "undefined" || navigator.onLine !== false) {
          const { data } = await supabase.auth.getSession();
          const user = data.session?.user;
          if (user) {
            let fullName: string | null = null;
            let clinicId: string | null = null;
            try {
              const { data: profile } = await supabase
                .from("profiles")
                .select("full_name,clinic_id")
                .eq("id", user.id)
                .maybeSingle();
              fullName = profile?.full_name ?? null;
              clinicId = profile?.clinic_id ?? null;
            } catch {
              // Identity provisioning can still proceed with the authenticated id.
            }
            await provisionDesktopIdentity({
              userId: user.id,
              email: user.email ?? null,
              fullName,
              clinicId,
            });
          }
        }

        const summary = await syncDesktopOfflineData();
        if (disposed) return;
        window.dispatchEvent(new CustomEvent("dentalflow:desktop-sync-complete", { detail: summary }));
      } catch (error) {
        if (disposed) return;
        console.error("[DentalFlow Desktop] Falha ao preparar dados offline", error);
      }
    };

    void run();

    return () => {
      disposed = true;
    };
  }, []);

  return null;
}
