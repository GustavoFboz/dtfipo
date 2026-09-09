import { createFileRoute, redirect, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { resolveOfflineAuthUser } from "@/lib/desktop-identity";
import { finalizePendingOnboarding } from "@/lib/subscriptions";
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
import { DesktopLabHomeShortcut } from "@/components/DesktopLabHomeShortcut";
import { SubscriptionGate } from "@/components/SubscriptionGate";
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

    // If e-mail confirmation delayed the first authenticated session, complete
    // the pending company/member setup before billing/session entitlements load.
    if (!offlineProvision) {
      await finalizePendingOnboarding().catch(() => undefined);
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
    shell = (
      <>
        <ModuleEntryBridge />
        <CaseDialogSanitizer />
        <WorkflowLayoutStabilizer />
        <AppShell />
        <DesktopLabHomeShortcut />
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
      <SubscriptionGate>{shell}</SubscriptionGate>
    </>
  );
}
