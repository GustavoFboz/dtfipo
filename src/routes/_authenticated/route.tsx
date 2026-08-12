import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) {
      throw redirect({ to: "/auth", search: { invite: undefined, mode: undefined } });
    }
    
    // Persist current path for refresh recovery
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("last_path", location.href);
      } catch (e) {
        // ignore
      }
    }

    return { user };
  },
  component: AppShell,
});
