import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) {
      throw redirect({ to: "/auth", search: { invite: undefined, mode: undefined } });
    }

    // Multi-tenant clinic gate is disabled until the clinic/membership schema
    // is restored. Any authenticated user goes straight to the app.
    return { user };
  },
  component: AppShell,
});
