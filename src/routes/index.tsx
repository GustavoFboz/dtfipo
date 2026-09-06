import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getProvisionedDesktopIdentity, isDentalFlowDesktop } from "@/lib/desktop-local";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    let session: any = null;
    try {
      const result = await supabase.auth.getSession();
      session = result.data.session;
    } catch {
      // A real offline boot may not be able to refresh the cloud session.
    }

    if (session) throw redirect({ to: "/hub" as any });

    if (isDentalFlowDesktop() && typeof navigator !== "undefined" && navigator.onLine === false) {
      const identity = await getProvisionedDesktopIdentity();
      if (identity && identity.valid_until > Date.now()) {
        throw redirect({ to: "/hub" as any });
      }
    }

    throw redirect({ to: "/lp" });
  },
});
