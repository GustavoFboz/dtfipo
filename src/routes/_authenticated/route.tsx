import { createFileRoute, redirect, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { resolveOfflineAuthUser } from "@/lib/desktop-identity";
import { AppShell } from "@/components/AppShell";
import { ClinicShell } from "@/components/ClinicShell";
import { HubShell } from "@/components/HubShell";
import { ModuleEntryBridge } from "@/components/ModuleEntryBridge";
import { CaseDialogSanitizer } from "@/components/CaseDialogSanitizer";
import { WorkflowLayoutStabilizer } from "@/components/WorkflowLayoutStabilizer";
import { EnvironmentTransition } from "@/components/EnvironmentTransition";
import { ConnectivityLayer } from "@/components/ConnectivityLayer";
import { DesktopOfflineBootstrap } from "@/components/DesktopOfflineBootstrap";
import { DesktopPrimarySyncGate } from "@/components/DesktopPrimarySyncGate";
import { DesktopRealtimeSync } from "@/components/DesktopRealtimeSync";
import "@/workflow-layout.css";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    let user: any = null;
    try {
      const { data } = await supabase.auth.getSession();
      user = data.session?.user ?? null;
    } catch {
      // A cloud session may be temporarily unavailable during a real offline boot.
    }

    let offlineProvision = false;
    if (!user) {
      const offlineUser = await resolveOfflineAuthUser();
      if (offlineUser) {
        user = offlineUser;
        offlineProvision = true;
      }
    }

    if (!user) {
      throw redirect({
        to: "/auth",
        search: { invite: undefined, mode: undefined, returnTo: location.href },
      });
    }
    return { user, offlineProvision };
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
      <DesktopOfflineBootstrap />
      <DesktopPrimarySyncGate />
      <DesktopRealtimeSync />
      <ConnectivityLayer />
      <EnvironmentTransition />
      {shell}
    </>
  );
}
