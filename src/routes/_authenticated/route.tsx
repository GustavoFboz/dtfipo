import { createFileRoute, redirect, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { ClinicShell } from "@/components/ClinicShell";
import { HubShell } from "@/components/HubShell";
import { ModuleEntryBridge } from "@/components/ModuleEntryBridge";
import { CaseDialogSanitizer } from "@/components/CaseDialogSanitizer";
import { WorkflowLayoutStabilizer } from "@/components/WorkflowLayoutStabilizer";
import { EnvironmentTransition } from "@/components/EnvironmentTransition";
import { ConnectivityLayer } from "@/components/ConnectivityLayer";
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

  let shell: React.ReactNode;

  if (pathname === "/hub") {
    shell = <HubShell />;
  } else if (pathname.startsWith("/clinica")) {
    shell = <ClinicShell />;
  } else {
    // O laboratório mantém seu próprio shell e seus próprios efeitos globais.
    // Clínica e Hub não montam nada do domínio laboratorial.
    shell = (
      <>
        <ModuleEntryBridge />
        <CaseDialogSanitizer />
        <WorkflowLayoutStabilizer />
        <AppShell />
      </>
    );
  }

  return (
    <>
      <ConnectivityLayer />
      <EnvironmentTransition />
      {shell}
    </>
  );
}
