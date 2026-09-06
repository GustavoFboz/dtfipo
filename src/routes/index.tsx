import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { resolveOfflineAuthUser } from "@/lib/desktop-identity";

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

    const offlineUser = await resolveOfflineAuthUser();
    if (offlineUser) throw redirect({ to: "/hub" as any });

    throw redirect({ to: "/lp" });
  },
});
