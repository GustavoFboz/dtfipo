import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isDentalFlowDesktop, provisionDesktopIdentity } from "@/lib/desktop-local";
import { syncDesktopOfflineData } from "@/lib/desktop-sync";
import {
  prepareDesktopRecovery,
  protectCriticalCachesFromEmptyRegression,
} from "@/lib/desktop-recovery";

/**
 * Starts the local-first desktop layer only after the authenticated shell exists.
 * A real cloud session periodically renews the finite device provision. A
 * synthetic offline device session must never renew itself, otherwise a computer
 * could remain authorized forever without being revalidated by the server.
 */
export function DesktopOfflineBootstrap() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isDentalFlowDesktop()) return;

    let disposed = false;

    const run = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;
        const isOfflineDeviceSession = Boolean(user?.user_metadata?.dentalflow_offline_device);

        if (user && !isOfflineDeviceSession) {
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

        // Recovery runs before synchronization so a list accidentally emptied by
        // an older Desktop build can be reconstructed from its per-entity mirrors.
        const recovery = await prepareDesktopRecovery();
        const summary = await syncDesktopOfflineData();
        const protectedNamespaces = await protectCriticalCachesFromEmptyRegression(recovery.snapshot);

        if (disposed) return;

        // The authenticated shell can render before the recovery pass finishes.
        // Force every visible query to re-read the repaired SQLite snapshots so
        // restored patients/cases/clinic data appear immediately, without asking
        // the user to change pages or restart the program.
        await queryClient.invalidateQueries();
        if (disposed) return;

        window.dispatchEvent(
          new CustomEvent("dentalflow:desktop-sync-complete", {
            detail: {
              ...summary,
              recovery: {
                reconstructedNamespaces: recovery.reconstructedNamespaces,
                protectedNamespaces,
              },
            },
          }),
        );
      } catch (error) {
        if (disposed) return;
        console.error("[DentalFlow Desktop] Falha ao preparar dados offline", error);
      }
    };

    void run();

    return () => {
      disposed = true;
    };
  }, [queryClient]);

  return null;
}
