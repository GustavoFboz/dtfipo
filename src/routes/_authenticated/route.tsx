import { createFileRoute, redirect, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { ClinicShell } from "@/components/ClinicShell";
import { HubShell } from "@/components/HubShell";
import { ModuleEntryBridge } from "@/components/ModuleEntryBridge";
import { CaseDialogSanitizer } from "@/components/CaseDialogSanitizer";
import { WorkflowLayoutStabilizer } from "@/components/WorkflowLayoutStabilizer";
import "@/workflow-layout.css";

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
  const { pathname } = useLocation();

  if (pathname === "/hub") {
    return <HubShell />;
  }

  if (pathname.startsWith("/clinica")) {
    return <ClinicShell />;
  }

  // O laboratório mantém seu próprio shell e seus próprios efeitos globais.
  // Clínica e Hub não montam nada do domínio laboratorial.
  return (
    <>
      <ModuleEntryBridge />
      <CaseDialogSanitizer />
      <WorkflowLayoutStabilizer />
      <AppShell />
    </>
  );
}
