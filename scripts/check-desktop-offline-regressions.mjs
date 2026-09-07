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
expect(frame.includes('className="fixed inset-0 z-[1]'), "Desktop native frame must fill the complete Tauri client area.");
expect(!frame.includes("createPortal"), "Windows controls must not be appended after a full-height header child.");
expect(frame.includes("Minimizar") && frame.includes("Maximizar") && frame.includes("Fechar"), "Standard window actions must always be rendered.");
expect(frame.includes("dataset.dentalflowNativeRoute"), "Desktop shell must expose the current SPA route for native-only page styling.");
expect(desktopCss.includes('header[data-dentalflow-native-header="true"]'), "App headers must reserve the Windows caption-button area.");
expect(desktopCss.includes("inset: 0 !important"), "Windowed Desktop must not keep an invisible six-pixel outer gutter.");
expect(desktopCss.includes('[data-dentalflow-native-route="casos"]'), "Cases reference layout must remain scoped to the native /casos route.");
expect(desktopCss.includes("flex-direction: column-reverse !important"), "Native Cases actions must preserve the reference stacked order.");
expect(desktopCss.includes('html[data-dentalflow-native-window="true"]'), "Desktop-only layout rules must remain gated by the native-window marker.");
expect(tauri.includes('"transparent": false'), "Windows app must use an opaque client surface instead of invisible transparent borders.");
expect(tauri.includes('"version": "0.2.5"'), "Desktop version must be 0.2.5 for this cases/readiness build.");

expect(client.includes("usingOfflineDeviceSession"), "Cloud Login shim must track synthetic device sessions.");
expect(client.includes("requireRealCloudSession"), "Synthetic offline login must not issue cloud database reads.");
expect(client.includes("validatedCloudSession"), "Persisted WebView sessions must be revalidated by Cloud Login.");
expect(client.includes("withDesktopCloudTimeout"), "Cloud Login validation must have a finite deadline.");
expect(client.includes("CLOUD_VALIDATION_TTL_MS"), "Concurrent dashboard reads must share a short-lived validated Cloud Login result.");
expect(client.includes("validatedCloudInFlight"), "Concurrent Cloud Login validation must be coalesced instead of duplicated.");
expect(client.includes("desktop-account-changed"), "A valid Cloud Login account change must trigger re-provisioning instead of mixing caches.");
expect(!client.includes("desktop-account-mismatch"), "A valid cloud account must no longer be forcibly logged out because an older device cache exists.");
expect(client.includes("Failed to fetch: Cloud Login is offline"), "Offline cloud reads must fail into the local-first fallback path.");

expect(identity.includes("sessionIsDeviceOnly"), "Desktop identity must distinguish device and cloud sessions.");
expect(identity.includes('source: "device"'), "Device identity fallback is missing.");
expect(identity.includes("canUseDentalFlowCloud"), "Cloud availability helper is missing.");
expect(identity.includes("Local reads must not wait for a Cloud Login round-trip"), "SQLite owner resolution must stay local-first.");
expect(identity.includes("identity.valid_until > Date.now()"), "SQLite owner access must remain bounded by the provisioned device lifetime.");

expect(patients.includes("resolveDesktopOwnerId"), "Patient cache ownership must use the stable Desktop identity.");
expect(patients.includes("Resposta vazia de pacientes ignorada"), "Patient snapshots must be protected from ambiguous empty cloud responses.");
expect(apiDesktop.includes("recoverCaseMirror"), "Cases must recover their aggregate list from SQLite entity mirrors.");
expect(apiDesktop.includes("writeCaseSnapshot(ownerId, recovered)"), "Recovered cases must repair the aggregate SQLite list.");
expect(apiDesktop.includes("recoverAuthorizedCasesDirectly"), "A valid Cloud Login must have an RLS-authorized case recovery path when profile hydration returns empty.");
expect(apiDesktop.includes('supabase.from("cases").select("*")'), "Direct case recovery must still rely on database RLS rather than bypassing authorization.");
expect(apiDesktop.includes("Promise.race([primaryPromise, directPromise])"), "Cold case loading must race the rich query with the RLS recovery path.");
expect(apiDesktop.includes('localCacheGet<Patient[]>(ownerId, "patients:v1", "all")'), "Desktop patient screens must render the SQLite snapshot before a cloud refresh.");
expect(apiDesktop.includes("withDesktopCloudTimeout"), "Desktop screen reads must not display infinite skeletons on stalled cloud requests.");
expect(apiDesktop.includes('localCacheGet<Notification[]>(ownerId, "notifications:v1", "all")'), "Notification history must be cache-first on Desktop.");

expect(clinicDesktop.includes('localCacheGet<ClinicContext>(ownerId, CONTEXT_NS, CONTEXT_KEY)'), "Clinic availability must read the last verified local entitlement first.");
expect(clinicDesktop.includes("repairClinicContextFromVerifiedCloud"), "Desktop must repair stale negative Clinic entitlements from verified Cloud data.");
expect(clinicDesktop.includes('supabase.from("clinics")') || clinicDesktop.includes('.from("clinics")'), "Clinic repair must verify the actual clinic module list.");
expect(clinicDesktop.includes('localCachePut(ownerId, CONTEXT_NS, CONTEXT_KEY, repaired)'), "A verified repaired Clinic entitlement must be durable offline.");
expect(clinicDesktop.includes('localCacheGet<Appointment[]>(ownerId, "clinic-appointments:v1", "all")'), "Clinic agenda must be able to render from SQLite immediately.");
expect(clinicLocal.includes("canUseDentalFlowCloud"), "Clinic local-first reads must distinguish actual Cloud access from navigator online state.");
expect(clinicLocal.includes("Contexto vazio da Clínica ignorado"), "A transient empty Clinic context must not erase a verified entitlement.");

expect(notificationPanel.includes('id="notification-trigger"'), "Notification center trigger must remain wired in the UI.");
expect(notificationsLocal.includes('const NS = "notifications:v1"'), "Desktop notifications must have a durable local cache.");
expect(bootstrap.includes('schedule(2_000, "boot-retry")'), "Desktop must retry hydration after Cloud Login/profile settles.");
expect(bootstrap.includes('schedule(8_000, "boot-finalize")'), "Desktop must run a final cold-boot hydration pass.");
expect(bootstrap.includes("FOCUS_REFRESH_AFTER_MS"), "Window focus refreshes must have an inactivity threshold.");
expect(bootstrap.includes("validação do ambiente Clínica"), "Cold boot must proactively revalidate Clinic entitlement.");
expect(bootstrap.includes("queryClient.invalidateQueries"), "UI queries must refresh even after partial cache recovery.");
expect(!realtime.includes('window.addEventListener("focus"'), "Realtime mirror must not perform a full sync on every Alt+Tab/window focus.");
expect(!connectivity.includes('passiveSync ? "Atualizando"'), "Passive background refresh must not show a distracting Atualizando status.");

expect(transition.includes("useIsFetching"), "Environment transition must observe visual query readiness.");
expect(transition.includes("WARM_MEMORY_TTL_MS"), "Environment transition must keep a temporary warm-memory window.");
expect(transition.includes("{progress}%"), "Environment spinner must show the current readiness percentage.");
expect(transition.includes("READY_QUIET_MS"), "Environment overlay must wait for a short visual quiet period before revealing the page.");
expect(router.includes("desktop ? 5 * 60_000"), "Desktop query data must stay warm long enough to avoid re-buffering between modules.");

expect(sync.includes("não bloqueou o restante da sincronização"), "One failing sync domain must not abort every other Desktop dataset.");
expect(sync.includes("Promise.all(["), "Independent read-model warmups should proceed concurrently.");
expect(cloud.includes("DesktopCloudTimeoutError"), "Bounded cloud helper is required for installed clients.");
expect(contract.includes("Regra de ouro"), "Cross-platform/offline contract must remain documented.");

console.log("Desktop 0.2.5 Cases/local-first/native-layout regression checks passed.");
