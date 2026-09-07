import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const frame = read("src/components/DesktopNativeFrame.tsx");
const desktopCss = read("src/desktop-native.css");
const client = read("src/integrations/supabase/client.desktop.ts");
const identity = read("src/lib/desktop-identity.ts");
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

expect(frame.includes("data-dentalflow-window-controls"), "Desktop Windows controls marker is missing.");
expect(frame.includes("Minimizar") && frame.includes("Maximizar") && frame.includes("Fechar"), "Standard window actions must remain rendered.");
expect(desktopCss.includes('html[data-dentalflow-native-window="true"]'), "Desktop-only layout rules must remain scoped to native window.");
expect(tauri.includes('"version": "0.2.8"'), "Desktop version must be 0.2.8.");
expect(tauri.includes('"frontendDist": "../dist/client"'), "The complete compiled frontend must remain bundled inside the installer.");

expect(client.includes("usingOfflineDeviceSession"), "Cloud Login shim must track synthetic device sessions.");
expect(client.includes("validatedCloudSession"), "Persisted Cloud Login must be revalidated.");
expect(client.includes("Cloud Login requires revalidation"), "Device-only sessions must block protected Cloud reads in 0.2.8.");
expect(!client.includes("if (!definitelyOffline) return;"), "0.2.8 must not allow device-only protected reads merely because Windows is online.");

expect(identity.includes("sessionIsDeviceOnly"), "Desktop identity must distinguish device and Cloud sessions.");
expect(identity.includes('return identity?.source === "cloud"'), "Cloud access must require a validated real Cloud identity.");
expect(identity.includes("HTTP") || identity.includes("200 + []"), "Root-cause protection against ambiguous empty RLS responses must remain documented.");

expect(proof.includes('const NS = "desktop-sync-proof:v1"'), "Authenticated sync proof namespace is missing.");
expect(proof.includes('remoteCount("patients")'), "Sync proof must verify patients.");
expect(proof.includes('remoteCount("cases")'), "Sync proof must verify cases.");
expect(proof.includes('remoteCount("case_types")'), "Sync proof must verify case types.");
expect(proof.includes('remoteCount("stages")'), "Sync proof must verify stages.");
expect(proof.includes('remoteCount("phases")'), "Sync proof must verify phases.");
expect(proof.includes('remoteCount("component_categories")'), "Sync proof must verify stock categories.");
expect(proof.includes('remoteCount("stock_items")'), "Sync proof must verify stock items.");
expect(proof.includes("localCoversRemote"), "A local cache must cover the authenticated RLS dataset before readiness is stored.");

expect(primarySync.includes("inspectDesktopSyncReadiness"), "Primary readiness must depend on authenticated sync proof.");
expect(primarySync.includes("Revalide seu login para sincronizar"), "Expired/missing Cloud Login must be explicit instead of showing empty lists.");
expect(primarySync.includes("/reauth?returnTo="), "Desktop must provide a dedicated Cloud reauthentication path.");
expect(primarySync.includes("DentalFlow Desktop 0.2.8"), "Primary sync gate must identify the 0.2.8 recovery build.");
expect(reauth.includes("signInWithPassword"), "Reauthentication screen must obtain a real Cloud Login.");
expect(reauth.includes("Validar e sincronizar"), "Reauthentication screen must clearly continue into synchronization.");
expect(authenticatedRoute.includes("<DesktopPrimarySyncGate />"), "Primary sync gate must be mounted in authenticated Desktop routes.");

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

expect(notificationPanel.includes('id="notification-trigger"'), "Notification center trigger must remain wired.");
expect(notificationsLocal.includes('const NS = "notifications:v1"'), "Notifications must remain durable locally.");
expect(!realtime.includes('window.addEventListener("focus"'), "Realtime mirror must not full-sync on every Alt+Tab.");
expect(!connectivity.includes('passiveSync ? "Atualizando"'), "Passive refresh must remain visually quiet.");
expect(transition.includes("useIsFetching"), "Environment transition must still observe query readiness.");
expect(router.includes("desktop ? 5 * 60_000"), "Desktop query data must stay warm between modules.");
expect(sync.includes("não bloqueou o restante da sincronização"), "One failing domain must not abort every other dataset.");
expect(cloud.includes("DesktopCloudTimeoutError"), "Cloud operations must stay bounded by a timeout.");
expect(contract.includes("Regra de ouro"), "Cross-platform/offline contract must remain documented.");

console.log("Desktop 0.2.8 authenticated sync-proof regression checks passed.");
