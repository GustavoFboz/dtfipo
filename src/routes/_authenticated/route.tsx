import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { ModuleEntryBridge } from "@/components/ModuleEntryBridge";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) {
      throw redirect({
        to: "/auth",
        search: { invite: undefined, mode: undefined, returnTo: location.href },
      });
    }
    return { user };
  },
  component: AuthenticatedShell,
});

function AuthenticatedShell() {
  return <><ModuleEntryBridge /><AppShell /></>;
}
