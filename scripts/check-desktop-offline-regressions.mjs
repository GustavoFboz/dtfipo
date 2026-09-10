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
const patientsDesktop = read("src/lib/patients.desktop.ts");
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
const caseActivity = read("src/lib/case-activity.ts");
const caseProfessionals = read("src/components/CaseProfessionals.tsx");
const teamLocal = read("src/lib/team-local-first.ts");
const teamUi = read("src/components/EquipeManagement.tsx");
const storage = read("src/lib/storage.ts");
const uploadManager = read("src/lib/upload-manager.ts");
const uploadDock = read("src/components/UploadProgressDock.tsx");
const uploadPolicy = read("supabase/migrations/20260908234000_fix_authorized_case_file_uploads.sql");
const bootstrap = read("src/components/DesktopOfflineBootstrap.tsx");
const realtime = read("src/components/DesktopRealtimeSync.tsx");
const connectivity = read("src/components/ConnectivityLayer.tsx");
const transition = read("src/components/EnvironmentTransition.tsx");
const sessionLifecycle = read("src/hooks/use-session-lifecycle.ts");
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
expect(frame.includes("resolveCaptionBackground"), "Caption controls must derive their background from the active DentalFlow header.");
expect(frame.includes("ResizeObserver"), "Native header sizing must use ResizeObserver instead of global style polling.");
expect(!frame.includes('attributeFilter: ["class", "style"]'), "Never observe class/style mutations across the whole application tree.");
expect(desktopCss.includes('html[data-dentalflow-native-window="true"]'), "Desktop-only layout rules must remain scoped to native window.");
expect(desktopCss.includes(".df-notification-stack") && desktopCss.includes("right: 154px"), "Desktop notifications must reserve the Windows caption safe area.");
expect(tauri.includes('"version": "0.3.2"'), "Desktop version must be 0.3.2.");
expect(tauri.includes('"frontendDist": "../dist/client"'), "The complete compiled frontend must remain bundled inside the installer.");

// Tauri v2 camelCases top-level Rust command parameter names at the JS boundary.
expect(desktopLocal.includes('invokeDesktop<void>("local_cache_put", {\n    ownerId,'), "local_cache_put must pass ownerId to Tauri.");
expect(desktopLocal.includes('invokeDesktop<LocalCacheEntry<T> | null>("local_cache_get", {\n    ownerId,'), "local_cache_get must pass ownerId to Tauri.");
expect(desktopLocal.includes('invokeDesktop<Array<LocalCacheEntry<T>>>("local_cache_list", {\n    ownerId,'), "local_cache_list must pass ownerId to Tauri.");
expect(desktopLocal.includes('invokeDesktop<void>("local_cache_clear_owner", { ownerId })'), "local_cache_clear_owner must pass ownerId to Tauri.");
expect(desktopLocal.includes('invokeDesktop<Array<OutboxEntry<T>>>("outbox_pending", {\n    ownerId,'), "outbox_pending must pass ownerId to Tauri.");
expect(desktopLocal.includes("lastError,"), "outbox_mark must pass lastError to Tauri.");
expect(desktopLocal.includes("verifyDesktopLocalRuntime"), "Desktop must probe the real Tauri/SQLite command contract before syncing.");
expect(!desktopLocal.includes('invokeDesktop<void>("local_cache_put", {\n    owner_id: ownerId'), "Do not regress local_cache_put to snake_case top-level args.");
expect(!desktopLocal.includes('invokeDesktop<LocalCacheEntry<T> | null>("local_cache_get", {\n    owner_id: ownerId'), "Do not regress local_cache_get to snake_case top-level args.");

// Session recovery must distinguish a transient remote validation timeout from an
// actually missing JWT. Otherwise one timeout poisons all from()/rpc() calls.
expect(client.includes("usingOfflineDeviceSession"), "Cloud Login shim must track synthetic device sessions.");
expect(client.includes("validatedCloudSession"), "Persisted Cloud Login must be revalidated.");
expect(client.includes("recoverStoredCloudSession"), "Transient validation failures must recover a persisted genuine JWT.");
expect(client.includes("stored?.user"), "getUser must recover from the same genuine persisted session.");
expect(client.includes("Cloud Login requires revalidation"), "Device-only sessions must block protected Cloud reads.");
expect(!client.includes("if (!definitelyOffline) return;"), "Device-only protected reads must not be enabled merely because Windows is online.");

// The 0.3.0 channel shim remains the transport hardening layer used by current Desktop releases.
expect(client030.includes("crypto.randomUUID()"), "Desktop Realtime transport must generate unique topics.");
expect(client030.includes('prop === "channel"'), "Desktop Realtime transport must wrap channel creation.");
expect(viteDesktop.includes("client.desktop.030.ts"), "Desktop Vite build must keep the Realtime-safe client shim.");
expect(viteDesktop.includes("patients.desktop.ts"), "Direct patient imports must use the Desktop cache-first facade.");

expect(identity.includes("sessionIsDeviceOnly"), "Desktop identity must distinguish device and Cloud sessions.");
expect(identity.includes('return identity?.source === "cloud"'), "Cloud access must require a validated real Cloud identity.");
expect(identity.includes("HTTP") || identity.includes("200 + []"), "Root-cause protection against ambiguous empty RLS responses must remain documented.");

// Readiness contract: only critical business mirrors block first readiness.
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
expect(proof.includes("version: 2"), "Desktop must keep the stricter authenticated sync proof generation.");

expect(primarySync.includes("inspectDesktopSyncReadiness"), "Primary readiness must depend on authenticated sync proof.");
expect(primarySync.includes("Revalide seu login para sincronizar"), "Expired/missing online login must be explicit instead of showing empty lists.");
expect(primarySync.includes("/reauth?returnTo="), "Desktop must provide a dedicated reauthentication path.");
expect(primarySync.includes("DentalFlow Desktop 0.3."), "Primary sync gate must identify the Desktop release family.");
expect(primarySync.includes("SYNC_GATE_WATCHDOG_MS"), "Full-screen sync state must have a watchdog.");
expect(primarySync.includes("if (!readiness.ready)"), "Reconnect must only block when no verified local snapshot exists.");
expect(primarySync.includes("listas auxiliares"), "Sync gate must communicate that auxiliary lists reconcile in background.");
expect(!primarySync.includes("Lovable Cloud"), "Infrastructure provider branding must never appear in the user-facing sync gate.");
expect(reauth.includes("signInWithPassword"), "Reauthentication screen must obtain a real online login.");
expect(reauth.includes("Validar e sincronizar"), "Reauthentication screen must clearly continue into synchronization.");
expect(authenticatedRoute.includes("<DesktopPrimarySyncGate />"), "Primary sync gate must be mounted in authenticated Desktop routes.");

expect(bootstrap.includes("verifyDesktopLocalRuntime"), "Bootstrap must verify the packaged Tauri/SQLite runtime.");
expect(bootstrap.includes("FULL_SYNC_TIMEOUT_MS"), "The complete Desktop synchronization needs a finite deadline.");
expect(bootstrap.includes('"sincronização integral do Desktop"'), "Full sync must be bounded as one operation.");
expect(bootstrap.includes("verifyAndStoreDesktopSyncProof"), "Bootstrap must verify remote-vs-SQLite datasets after warming.");
expect(bootstrap.includes("cloudValidated"), "Bootstrap must report whether a real online session was validated.");
expect(bootstrap.includes('schedule(3_000, "boot-retry"'), "Desktop must retain a delayed cold-boot retry when verification is still missing.");
expect(bootstrap.includes('schedule(10_000, "boot-finalize"'), "Desktop must retain a final cold-boot recovery pass when verification is still missing.");
expect(bootstrap.includes("RESUME_REFRESH_AFTER_MS"), "Idle resume must have an explicit refresh threshold.");
expect(bootstrap.includes('queryClient.refetchQueries({ type: "active" })'), "Idle resume and completed sync must refresh only currently mounted queries.");
expect(!bootstrap.includes("queryClient.invalidateQueries()"), "Desktop bootstrap must not globally invalidate the entire query cache after resume/sync.");
expect(!bootstrap.includes('event === "TOKEN_REFRESHED"'), "Routine token refresh must never trigger a complete Desktop synchronization.");

// Read models that visibly failed in the reported Windows build.
expect(patients.includes("Resposta vazia de pacientes ignorada"), "Patient snapshots must remain protected from ambiguous empty responses.");
expect(patientsDesktop.includes('const NS = "patients:v1"'), "Desktop Patients route must read the verified SQLite mirror.");
expect(patientsDesktop.includes("Return immediately for native UI responsiveness"), "Desktop patient list must be cache-first.");
expect(teamLocal.includes('const TEAM_NS = "team-members:v1"'), "Desktop team members need a durable SQLite read model.");
expect(teamLocal.includes("Never let a transient/ambiguous zero-row response erase a verified team"), "Verified team cache must resist ambiguous empty responses.");
expect(teamUi.includes("fetchTeamMembersLocalFirst"), "Team screen must not depend only on a web server function in Tauri.");
expect(teamUi.includes("if (desktop) return fetchTeamMembersLocalFirst()"), "Desktop team screen must select the native read model.");
expect(caseProfessionals.includes("case-professional-activity"), "Case professionals must include actual activity authors/mentions.");
expect(!caseProfessionals.includes("Protéticos cadastrados (sempre exibidos"), "Case professionals must not append every prosthetist globally.");
expect(storage.includes('const STORAGE_USAGE_NS = "storage-usage:v1"'), "Desktop storage usage must survive in SQLite.");
expect(storage.includes("cached ?? state.data ?? fallbackUsage()"), "Storage sidebar must never return to an empty dash state on transient errors.");
expect(sync.includes("warmTeamMembersLocalCache"), "Full Desktop sync must warm the team read model.");
expect(sync.includes("refreshStorageUsage"), "Full Desktop sync must warm storage usage.");

// Critical case-upload contract.
expect(uploadPolicy.includes("public.can_access_case"), "Case-file Storage writes must be based on case authorization.");
expect(!uploadPolicy.includes("is_staff(auth.uid())"), "CADISTA uploads must never regress to generic is_staff gating.");
expect(uploadManager.includes("MAX_AUTOMATIC_UPLOAD_ATTEMPTS = 3"), "Transient case uploads must retry automatically.");
expect(uploadManager.includes("uploadWithRecovery"), "Case uploads must use the recovery wrapper.");
expect(uploadManager.includes("showFinalUploadError"), "Final upload failures must remain visible and retryable.");
expect(uploadDock.includes("syncedSuccesses"), "Background upload success must trigger one attachment refresh.");
expect(uploadDock.includes('queryKey: ["case_attachments", task.caseId]'), "Successful background uploads must refresh the case attachment list.");

expect(apiDesktop.includes("recoverCaseMirror"), "Cases must recover aggregate lists from SQLite mirrors.");
expect(apiDesktop.includes("recoverAuthorizedCasesDirectly"), "Cases must retain an RLS-authorized recovery path.");
expect(clinicDesktop.includes("repairClinicContextFromVerifiedCloud"), "Clinic entitlement repair must remain verified.");
expect(clinicLocal.includes("Contexto vazio da Clínica ignorado"), "Clinic context must resist transient empty regressions.");
expect(clinicGuard.includes("Não foi possível validar a Clínica"), "Clinic validation errors must not be presented as plan denial.");

// Notification + Realtime reliability.
expect(notificationPanel.includes('id="notification-trigger"'), "Notification center trigger must remain wired.");
expect(notificationPanel.includes("openNotification"), "Notification panel must delegate to internal notification navigation.");
expect(notificationPanel.includes("df-notification-stack"), "Notification stack must keep the Desktop safe-area hook.");
expect(notificationPopups.includes("useNavigate"), "Notification clicks must use TanStack Router.");
expect(!notificationPopups.includes("window.location.assign(`/casos"), "Notification clicks must never reload the Cases page.");
expect(notificationPopups.includes('filter: `recipient_id=eq.${user.id}`'), "Notification Realtime must be recipient scoped.");
expect(notificationsLocal.includes('const NS = "notifications:v1"'), "Notifications must remain durable locally.");
expect(notificationsLocal.includes('"cloud login"'), "Cloud Login revalidation gaps must be queueable notification failures.");
expect(caseActivity.includes("sendInternalNotificationLocalFirst"), "Case chat alerts must use the durable Desktop notification outbox.");
expect(realtime.includes('table: "notifications"'), "Desktop Realtime bridge must subscribe to notifications.");
expect(realtime.includes('table: "case_activity"'), "Desktop Realtime bridge must subscribe to case activity.");
expect(realtime.includes('event: "UPDATE", schema: "public", table: "cases"'), "Desktop must observe authorized case updates.");
expect(realtime.includes("scheduleNativeCaseUpdate"), "Background case changes must surface as native notifications.");
expect(realtime.includes("NOTIFICATION_RECONCILE_MS = 8_000"), "Notification reconciliation must remain low-latency in 0.3.5.");
expect(realtime.includes("FULL_RECONCILE_MS = 12_000"), "Active Desktop data must retain a bounded periodic reconciliation safety net.");
expect(realtime.includes("NOTIFICATION_CURSOR_OVERLAP_MS"), "Notification catch-up must overlap its cursor to avoid token/channel transition gaps.");
expect(realtime.includes("NOTIFICATION_STARTUP_LOOKBACK_MS"), "Notification catch-up must cover the startup/reconnect race window.");
expect(realtime.includes("getProvisionedDesktopIdentity"), "A transient device-only startup must preserve recipient identity for self-healing.");
expect(realtime.includes("queueReconnect();\n          return;"), "Realtime must retry after a transient device-only startup instead of dying silently.");
expect(realtime.includes("ENTITY_INVALIDATION_DEBOUNCE_MS"), "Realtime entity invalidations must be coalesced.");
expect(realtime.includes('queryKey: ["case-professional-activity", id]'), "Case mentions/professionals must refresh after new activity.");
expect(realtime.includes('window.addEventListener("focus", onWindowFocus)'), "Desktop focus recovery must reconcile only active data.");
expect(realtime.includes("const onWindowFocus = () => void reconcileActiveData()"), "Focus recovery must use bounded active-data reconciliation.");
expect(!realtime.includes("syncDesktopOfflineData"), "Realtime events or focus recovery must never launch a complete offline mirror synchronization.");
expect(!connectivity.includes("syncDesktopOfflineData"), "Connectivity indicator must not own a second full-sync pipeline.");
expect(!connectivity.includes("queryClient.invalidateQueries"), "Connectivity indicator must not globally invalidate React Query.");
expect(!connectivity.includes('className="fixed inset-0 z-[9998]'), "Reconnect must never cover and block the whole application.");
expect(transition.includes("useIsFetching"), "Environment transition must still observe query readiness.");
expect(router.includes("desktop ? 5 * 60_000"), "Desktop query data must stay warm between modules.");
expect(router.includes('refetchOnReconnect: desktop ? false : "always"'), "React Query must not duplicate the Desktop reconnect coordinator.");
expect(sessionLifecycle.includes("SESSION_REVALIDATE_COOLDOWN_MS"), "Session resume checks must have a cooldown.");
expect(sessionLifecycle.includes("activeValidation"), "Session revalidation must be single-flight.");
expect(sync.includes("Promise.all(["), "Independent reconnect domains must run concurrently.");
expect(sync.indexOf("syncPendingCaseChanges") < sync.indexOf("syncPendingNotificationChanges"), "Queued cases must replay before their notifications.");
expect(cloud.includes("DesktopCloudTimeoutError"), "Remote operations must stay bounded by a timeout.");
expect(contract.includes("Regra de ouro"), "Cross-platform/offline contract must remain documented.");

console.log("Desktop historical native read-model recovery, authenticated sync, resilient uploads, realtime notifications and Windows regressions passed.");
