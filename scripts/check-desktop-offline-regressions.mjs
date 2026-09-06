import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const frame = read("src/components/DesktopNativeFrame.tsx");
const client = read("src/integrations/supabase/client.desktop.ts");
const identity = read("src/lib/desktop-identity.ts");
const patients = read("src/lib/patients-local-first.ts");
const apiDesktop = read("src/lib/api.desktop.ts");
const clinicDesktop = read("src/lib/clinic.desktop.ts");
const bootstrap = read("src/components/DesktopOfflineBootstrap.tsx");

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

expect(frame.includes("createPortal"), "Desktop native controls must be integrated into the existing app header.");
expect(frame.includes("data-dentalflow-window-controls"), "Desktop integrated window controls marker is missing.");
expect(!frame.includes("top-9 overflow-hidden"), "Standalone Desktop title strip must not return.");
expect(!frame.includes('>Desktop<'), "Standalone Desktop badge must not return to the native frame.");

expect(client.includes("usingOfflineDeviceSession"), "Cloud Login shim must track synthetic device sessions.");
expect(client.includes("requireRealCloudSession"), "Synthetic offline login must not issue cloud database reads.");
expect(client.includes("Failed to fetch: Cloud Login is offline"), "Offline cloud reads must fail into the local-first fallback path.");

expect(identity.includes("sessionIsDeviceOnly"), "Desktop identity must distinguish device and cloud sessions.");
expect(identity.includes('source: "device"'), "Device identity fallback is missing.");
expect(identity.includes("canUseDentalFlowCloud"), "Cloud availability helper is missing.");

expect(patients.includes("resolveDesktopOwnerId"), "Patient cache ownership must use the stable Desktop identity.");
expect(patients.includes("Resposta vazia de pacientes ignorada"), "Patient snapshots must be protected from ambiguous empty cloud responses.");
expect(apiDesktop.includes("recoverCaseMirror"), "Cases must recover their aggregate list from SQLite entity mirrors.");
expect(apiDesktop.includes('localCachePut(ownerId, "cases:v1", "all", recovered)'), "Recovered cases must repair the aggregate SQLite list.");
expect(clinicDesktop.includes('localCacheGet<ClinicContext>(ownerId, "clinic-context:v1", "current")'), "Clinic availability must fall back to the last verified local entitlement.");
expect(clinicDesktop.includes("resolveDesktopOwnerId"), "Clinic entitlement fallback must use the stable device owner.");
expect(bootstrap.includes("queryClient.invalidateQueries"), "UI queries must refresh after cache recovery.");

console.log("Desktop offline/native-shell regression checks passed.");
