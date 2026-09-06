import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getProvisionedDesktopIdentity, isDentalFlowDesktop } from "@/lib/desktop-local";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) throw redirect({ to: "/hub" as any });
    } catch (error) {
      // Preserve TanStack redirects; only network/auth lookup failures fall through.
      if ((error as any)?.isRedirect || (error as any)?.statusCode === 307) throw error;
    }

    if (isDentalFlowDesktop() && typeof navigator !== "undefined" && navigator.onLine === false) {
      const identity = await getProvisionedDesktopIdentity();
      if (identity && identity.valid_until > Date.now()) {
        throw redirect({ to: "/hub" as any });
      }
    }

    throw redirect({ to: "/lp" });
  },
});
