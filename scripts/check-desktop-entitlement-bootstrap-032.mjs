import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const subscriptions = read("src/lib/subscriptions.desktop.ts");
const bootstrap = read("src/components/DesktopOfflineBootstrap.tsx");
const gate = read("src/components/DesktopPrimarySyncGate.tsx");
const sync = read("src/lib/desktop-sync.ts");
const vite = read("vite.desktop.config.ts");
const tauri = read("src-tauri/tauri.conf.json");
const tauriConfig = JSON.parse(tauri);
const currentVersion = String(tauriConfig.version || "").trim();

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

expect(currentVersion === "0.6.4", `Unexpected DentalFlow Desktop release version: ${currentVersion || "missing"}.`);
expect(vite.includes("subscriptions.desktop.ts"), "Desktop build must route subscriptions through its local-first facade.");
expect(subscriptions.includes('const SUBSCRIPTION_CACHE_NAMESPACE = "subscription-context:v2"'), "Desktop entitlement must use the durable subscription cache.");
expect(subscriptions.includes("locallySafeContext"), "Cached subscription access must be normalized before offline use.");
expect(subscriptions.includes("current_period_end"), "Offline paid access must remain bounded by the server-verified billing period.");
expect(subscriptions.includes('identity.source !== "cloud"'), "A fresh entitlement snapshot must require a real validated online identity.");
expect(subscriptions.includes("fetchVerifiedCloudContext"), "Desktop entitlement needs a strict server verification path.");
expect(subscriptions.includes('cached?.effective_access === "full"'), "A still-valid verified entitlement should render immediately from SQLite.");
expect(subscriptions.includes("refreshInBackground"), "Cached entitlement must reconcile with the server without blocking the Hub.");
expect(!subscriptions.includes("company_advanced\"" + " as"), "Desktop must never invent a paid plan locally.");

const authIndex = bootstrap.indexOf('"sessão inicial do Desktop"');
const subscriptionIndex = bootstrap.indexOf('"assinatura e ambientes da empresa"');
const criticalIndex = bootstrap.indexOf('"sincronização crítica do Desktop"');
const proofIndex = bootstrap.indexOf("const syncProof = await verifyAndStoreDesktopSyncProof");
const auxiliaryCallIndex = bootstrap.lastIndexOf("syncDesktopAuxiliaryData()");
expect(authIndex >= 0 && subscriptionIndex > authIndex, "Desktop must validate auth before subscription/session entitlement.");
expect(criticalIndex > subscriptionIndex, "Desktop must cache entitlement before critical business mirrors start.");
expect(proofIndex > criticalIndex, "Desktop readiness proof must happen after critical patient/case synchronization.");
expect(auxiliaryCallIndex > proofIndex, "Auxiliary warm-up must only start after the critical proof phase.");
expect(bootstrap.includes("if (!cloudValidated || !user)"), "Online startup must not launch protected reads before real auth is validated.");
expect(bootstrap.includes('queryClient.setQueryData(["subscription_context"]'), "Bootstrap must seed React Query with the verified subscription context.");
expect(bootstrap.includes('queryClient.setQueryData(["clinic_context"]'), "Bootstrap must seed the verified Clinic context before releasing the Hub.");
expect(bootstrap.includes("subscriptionCached: true"), "Successful preflight must report a durable subscription snapshot.");

expect(gate.includes('"subscription-context:v2"'), "Desktop readiness must require the verified subscription snapshot.");
expect(gate.includes("subscriptionCached"), "Desktop readiness diagnostics must track subscription cache readiness.");
expect(gate.includes("verified && profileReady && clinicCached && subscriptionCached"), "First offline readiness must include profile, Clinic and paid entitlement.");
expect(gate.includes("DentalFlow"), "The visible readiness gate must remain branded as DentalFlow.");
expect(gate.includes("DentalFlow Desktop 0.6.4"), "The readiness UI must identify the 0.6.4 release.");

expect(sync.includes("syncDesktopCriticalData"), "Desktop sync must expose a critical first-install phase.");
expect(sync.includes("syncDesktopAuxiliaryData"), "Desktop sync must expose a non-blocking auxiliary phase.");
expect(sync.includes("Cache crítico de pacientes") && sync.includes("Cache crítico de casos"), "Patients and cases must remain in the critical phase.");
expect(sync.includes("Cache da equipe") && sync.includes("Uso de armazenamento"), "Team/storage must still warm after the first-install gate.");
expect(sync.indexOf("Cache da equipe") > sync.indexOf("runAuxiliarySync"), "Team cache must not block critical first readiness.");
expect(tauri.includes(`"version": "${currentVersion}"`), `Tauri release metadata must identify ${currentVersion}.`);

console.log(`DentalFlow Desktop ${currentVersion} entitlement/bootstrap regressions: OK`);
