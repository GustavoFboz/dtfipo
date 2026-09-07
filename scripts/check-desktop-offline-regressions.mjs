import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const frame = read("src/components/DesktopNativeFrame.tsx");
const desktopCss = read("src/desktop-native.css");
const client = read("src/integrations/supabase/client.desktop.ts");
const client030 = read("src/integrations/supabase/client.desktop.030.ts");
const viteDesktop = read("vite.desktop.config.ts");
const identity = read("src/lib/desktop-identity.ts");
const desktopLocal = read("src/lib/desktop-local.ts");
const patients = read("src/lib/patients-local-first.ts");
const apiDesktop = read("src/lib/api.desktop.ts");
const clinicDesktop = read("src/lib/clinic.desktop.ts");
const clinicLocal = read("src/lib/clinic-local-first.ts");
const clinicGuard = read("src/components/ClinicPageGuard.tsx");
const primarySync = read("src/components/DesktopPrimarySyncGate.tsx");
const authenticatedRoute = read("src/routes/_authenticated/route.tsx");
const reauth = read("src/routes/reauth.tsx");
const proof = read("src/lib/desktop-sync-proof.ts");
const notificationPanel = read("src/components/NotificationPanel.tsx");
const notificationPopups = read("src/hooks/use-notification-popups.ts");
const notificationsLocal = read("src/lib/notifications-local-first.ts");
const bootstrap = read("src/components/DesktopOfflineBootstrap.tsx");
const realtime = read("src/components/DesktopRealtimeSync.tsx");
const connectivity = read("src/components/ConnectivityLayer.tsx");
const transition = read("src/components/EnvironmentTransition.tsx");
const router = read("src/router.tsx");
const sync = read("src/lib/desktop-sync.ts");
const cloud = read("src/lib/desktop-cloud.ts");
const tauri = read("src-tauri/tauri.conf.json");
const contract = read("docs/CROSS_PLATFORM_OFFLINE_CONTRACT.md");

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

// Native frame / caption contract.
expect(frame.includes("data-dentalflow-window-controls"), "Desktop Windows controls marker is missing.");
expect(frame.includes("Minimizar") && frame.includes("Maximizar") && frame.includes("Fechar"), "Standard window actions must remain rendered.");
expect(frame.includes("createPortal") && frame.includes("document.body"), "Caption controls must escape the app stacking context via a body portal.");
expect(frame.includes("2147483646"), "Caption controls must stay above application overlays.");
expect(desktopCss.includes('html[data-dentalflow-native-window="true"]'), "Desktop-only layout rules must remain scoped to native window.");
expect(desktopCss.includes(".df-notification-stack") && desktopCss.includes("right: 154px"), "Desktop notifications must reserve the Windows caption safe area.");
expect(tauri.includes('"version": "0.3.0"'), "Desktop version must be 0.3.0.");
expect(tauri.includes('"frontendDist": "../dist/client"'), "The complete compiled frontend must remain bundled inside the installer.");

// Tauri v2 camelCases top-level Rust command parameter names at the JS boundary.
// This exact contract was the production root cause of the 0.2.8 empty Desktop.
expect(desktopLocal.includes('invokeDesktop<void>("local_cache_put", {\n    ownerId,'), "local_cache_put must pass ownerId to Tauri.");
expect(desktopLocal.includes('invokeDesktop<LocalCacheEntry<T> | null>("local_cache_get", {\n    ownerId,'), "local_cache_get must pass ownerId to Tauri.");
expect(desktopLocal.includes('invokeDesktop<Array<LocalCacheEntry<T>>>("local_cache_list", {\n    ownerId,'), "local_cache_list must pass ownerId to Tauri.");
expect(desktopLocal.includes('invokeDesktop<void>("local_cache_clear_owner", { ownerId })'), "local_cache_clear_owner must pass ownerId to Tauri.");
expect(desktopLocal.includes('invokeDesktop<Array<OutboxEntry<T>>>("outbox_pending", {\n    ownerId,'), "outbox_pending must pass ownerId to Tauri.");
expect(desktopLocal.includes("lastError,"), "outbox_mark must pass lastError to Tauri.");
expect(desktopLocal.includes("verifyDesktopLocalRuntime"), "Desktop must probe the real Tauri/SQLite command contract before syncing.");
expect(!desktopLocal.includes('invokeDesktop<void>("local_cache_put", {\n    owner_id: ownerId'), "Do not regress local_cache_put to snake_case top-level args.");
expect(!desktopLocal.includes('invokeDesktop<LocalCacheEntry<T> | null>("local_cache_get", {\n    owner_id: ownerId'), "Do not regress local_cache_get to snake_case top-level args.");

expect(client.includes("usingOfflineDeviceSession"), "Cloud Login shim must track synthetic device sessions.");
expect(client.includes("validatedCloudSession"), "Persisted Cloud Login must be revalidated.");
expect(client.includes("Cloud Login requires revalidation"), "Device-only sessions must block protected Cloud reads.");
expect(!client.includes("if (!definitelyOffline) return;"), "Device-only protected reads must not be enabled merely because Windows is online.");

// 0.3.0 channel safety: every Desktop channel transport topic is unique before
// any callbacks are registered, so remount cleanup cannot reuse a subscribed topic.
expect(client030.includes("crypto.randomUUID()"), "Desktop 0.3.0 must generate unique Realtime topics.");
expect(client030.includes('prop === "channel"'), "Desktop 0.3.0 must wrap channel creation.");
expect(viteDesktop.includes("client.desktop.030.ts"), "Desktop Vite build must use the 0.3.0 Realtime-safe client.");

expect(identity.includes("sessionIsDeviceOnly"), "Desktop identity must distinguish device and Cloud sessions.");
expect(identity.includes('return identity?.source === "cloud"'), "Cloud access must require a validated real Cloud identity.");
expect(identity.includes("HTTP") || identity.includes("200 + []"), "Root-cause protection against ambiguous empty RLS responses must remain documented.");

// 0.3.0 readiness contract: only critical business mirrors block first readiness.
expect(proof.includes('const NS = "desktop-sync-proof:v1"'), "Authenticated sync proof namespace is missing.");
expect(proof.includes('remoteCount("patients")'), "Sync proof must verify patients.");
expect(proof.includes('remoteCount("cases")'), "Sync proof must verify cases.");
expect(proof.includes('remoteCountOptional("case_types")'), "Case types must remain an auxiliary diagnostic.");
expect(proof.includes('remoteCountOptional("stages")'), "Stages must remain an auxiliary diagnostic.");
expect(proof.includes('remoteCountOptional("phases")'), "Phases must remain an auxiliary diagnostic.");
expect(proof.includes('remoteCountOptional("component_categories")'), "Stock categories must remain an auxiliary diagnostic.");
expect(proof.includes('remoteCountOptional("stock_items")'), "Stock items must remain an auxiliary diagnostic.");
expect(proof.includes("criticalReadModelsCoverRemote"), "Critical readiness must be based on patients + cases.");
expect(proof.includes("local.patients >= remote.patients && local.cases >= remote.cases"), "Auxiliary datasets must not lock the whole Desktop application.");
expect(proof.includes("auxiliaryMismatches"), "Auxiliary mismatches must remain observable for background reconciliation.");
expect(proof.includes("version: 2"), "Desktop 0.3.0 must invalidate the older over-strict sync proof.");

expect(primarySync.includes("inspectDesktopSyncReadiness"), "Primary readiness must depend on authenticated sync proof.");
expect(primarySync.includes("Revalide seu login para sincronizar"), "Expired/missing Cloud Login must be explicit instead of showing empty lists.");
expect(primarySync.includes("/reauth?returnTo="), "Desktop must provide a dedicated Cloud reauthentication path.");
expect(primarySync.includes("DentalFlow Desktop 0.3.0"), "Primary sync gate must identify the 0.3.0 recovery build.");
expect(primarySync.includes("SYNC_GATE_WATCHDOG_MS"), "Full-screen sync state must have a watchdog.");
expect(primarySync.includes("if (!readiness.ready)"), "Reconnect must only block when no verified local snapshot exists.");
expect(primarySync.includes("listas auxiliares"), "Sync gate must communicate that auxiliary lists reconcile in background.");
expect(reauth.includes("signInWithPassword"), "Reauthentication screen must obtain a real Cloud Login.");
expect(reauth.includes("Validar e sincronizar"), "Reauthentication screen must clearly continue into synchronization.");
expect(authenticatedRoute.includes("<DesktopPrimarySyncGate />"), "Primary sync gate must be mounted in authenticated Desktop routes.");

expect(bootstrap.includes("verifyDesktopLocalRuntime"), "Bootstrap must verify the packaged Tauri/SQLite runtime.");
expect(bootstrap.includes("FULL_SYNC_TIMEOUT_MS"), "The complete Desktop synchronization needs a finite deadline.");
expect(bootstrap.includes('"sincronização integral do Desktop"'), "Full sync must be bounded as one operation.");
expect(bootstrap.includes("verifyAndStoreDesktopSyncProof"), "Bootstrap must verify Cloud-vs-SQLite datasets after warming.");
expect(bootstrap.includes("cloudValidated"), "Bootstrap must report whether a real Cloud session was validated.");
expect(bootstrap.includes('schedule(2_000, "boot-retry")'), "Desktop must retry cold-boot hydration.");
expect(bootstrap.includes('schedule(8_000, "boot-finalize")'), "Desktop must run final cold-boot hydration.");
expect(bootstrap.includes("queryClient.invalidateQueries"), "Visible queries must refresh after sync/recovery.");

expect(patients.includes("Resposta vazia de pacientes ignorada"), "Patient snapshots must remain protected from ambiguous empty responses.");
expect(apiDesktop.includes("recoverCaseMirror"), "Cases must recover aggregate lists from SQLite mirrors.");
expect(apiDesktop.includes("recoverAuthorizedCasesDirectly"), "Cases must retain an RLS-authorized recovery path.");
expect(clinicDesktop.includes("repairClinicContextFromVerifiedCloud"), "Clinic entitlement repair must remain Cloud-verified.");
expect(clinicLocal.includes("Contexto vazio da Clínica ignorado"), "Clinic context must resist transient empty regressions.");
expect(clinicGuard.includes("Não foi possível validar a Clínica"), "Clinic validation errors must not be presented as plan denial.");

// Notification + Realtime regressions reported in 0.2.9.
expect(notificationPanel.includes('id="notification-trigger"'), "Notification center trigger must remain wired.");
expect(notificationPanel.includes("openNotification"), "Notification panel must delegate to internal notification navigation.");
expect(notificationPanel.includes("df-notification-stack"), "Notification stack must keep the Desktop safe-area hook.");
expect(notificationPopups.includes("useNavigate"), "Notification clicks must use TanStack Router.");
expect(!notificationPopups.includes("window.location.assign(`/casos"), "Notification clicks must never reload the Cases page.");
expect(notificationPopups.includes('filter: `recipient_id=eq.${user.id}`'), "Notification Realtime must be recipient scoped.");
expect(notificationsLocal.includes('const NS = "notifications:v1"'), "Notifications must remain durable locally.");
expect(realtime.includes('table: "notifications"'), "Desktop Realtime bridge must subscribe to notifications.");
expect(realtime.includes('table: "case_activity"'), "Desktop Realtime bridge must subscribe to case activity.");
expect(!realtime.includes('window.addEventListener("focus"'), "Realtime mirror must not full-sync on every Alt+Tab.");
expect(!connectivity.includes('passiveSync ? "Atualizando"'), "Passive refresh must remain visually quiet.");
expect(transition.includes("useIsFetching"), "Environment transition must still observe query readiness.");
expect(router.includes("desktop ? 5 * 60_000"), "Desktop query data must stay warm between modules.");
expect(sync.includes("Promise.all(["), "Independent reconnect domains must run concurrently.");
expect(sync.indexOf("syncPendingCaseChanges") < sync.indexOf("syncPendingNotificationChanges"), "Queued cases must replay before their notifications.");
expect(cloud.includes("DesktopCloudTimeoutError"), "Cloud operations must stay bounded by a timeout.");
expect(contract.includes("Regra de ouro"), "Cross-platform/offline contract must remain documented.");

console.log("Desktop 0.3.0 Tauri/SQLite, authenticated sync, realtime, notifications and native-window regression checks passed.");
