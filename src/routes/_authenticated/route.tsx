import { createFileRoute, redirect, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getProvisionedDesktopIdentity, isDentalFlowDesktop } from "@/lib/desktop-local";
import { AppShell } from "@/components/AppShell";
import { ClinicShell } from "@/components/ClinicShell";
import { HubShell } from "@/components/HubShell";
import { ModuleEntryBridge } from "@/components/ModuleEntryBridge";
import { CaseDialogSanitizer } from "@/components/CaseDialogSanitizer";
import { WorkflowLayoutStabilizer } from "@/components/WorkflowLayoutStabilizer";
import { EnvironmentTransition } from "@/components/EnvironmentTransition";
import { ConnectivityLayer } from "@/components/ConnectivityLayer";
import { DesktopOfflineBootstrap } from "@/components/DesktopOfflineBootstrap";
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
    if (!user && isDentalFlowDesktop() && typeof navigator !== "undefined" && navigator.onLine === false) {
      const identity = await getProvisionedDesktopIdentity();
      if (identity && identity.valid_until > Date.now()) {
        // This is not an authentication bypass: the identity can only exist after
        // a prior successful online session and expires after a finite window.
        user = {
          id: identity.user_id,
          email: identity.email ?? undefined,
          user_metadata: { full_name: identity.full_name ?? undefined },
        };
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
      <ConnectivityLayer />
      <EnvironmentTransition />
      {shell}
    </>
  );
}
