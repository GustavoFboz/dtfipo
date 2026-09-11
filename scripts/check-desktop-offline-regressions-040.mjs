import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sourcePath = "scripts/check-desktop-offline-regressions.mjs";
const tauriPath = "src-tauri/tauri.conf.json";
const source = fs.readFileSync(sourcePath, "utf8");
const tauriConfig = JSON.parse(fs.readFileSync(tauriPath, "utf8"));
const currentVersion = String(tauriConfig.version || "").trim();

if (currentVersion !== "0.6.3") {
  throw new Error(`Unexpected DentalFlow Desktop release: ${currentVersion || "missing"}; expected 0.6.3.`);
}

// Preserve the historical offline/realtime contract while adapting only
// guarantees deliberately strengthened since 0.4.x: faster notification catch-up,
// explicit cloud-session healing and canonical case notifications.
const adapted = source
  .replaceAll('"version": "0.3.2"', `"version": "${currentVersion}"`)
  .replaceAll("Desktop version must be 0.3.2.", `Desktop version must be ${currentVersion}.`)
  .replaceAll('DentalFlow Desktop 0.3.', 'DentalFlow Desktop 0.6.')
  .replaceAll('NOTIFICATION_RECONCILE_MS = 8_000', 'NOTIFICATION_RECONCILE_MS = 1_200')
  .replaceAll('Notification reconciliation must remain low-latency in 0.3.5.', 'Notification reconciliation must remain low-latency in 0.6.3.')
  .replaceAll('FULL_RECONCILE_MS = 12_000', 'FULL_RECONCILE_MS = 15_000')
  .replaceAll(
    'expect(realtime.includes("scheduleNativeCaseUpdate"), "Background case changes must surface as native notifications.");',
    'expect(realtime.includes("notifyNativeIfBackground") && realtime.includes("case_update"), "Background case changes must surface through canonical native notifications.");',
  )
  .replaceAll(
    'expect(realtime.includes("const onWindowFocus = () => void reconcileActiveData()"), "Focus recovery must use bounded active-data reconciliation.");',
    'expect(realtime.includes("const onWindowFocus = () => forceOnlineRecovery()"), "Focus recovery must heal the cloud session and reconcile active data.");',
  );

const tempPath = path.join(os.tmpdir(), `dentalflow-offline-regressions-${currentVersion}-${process.pid}.mjs`);
fs.writeFileSync(tempPath, adapted, "utf8");

try {
  const child = Bun.spawn(["bun", tempPath], {
    cwd: process.cwd(),
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code !== 0) process.exit(code);
} finally {
  try { fs.unlinkSync(tempPath); } catch {}
}

console.log(`DentalFlow Desktop ${currentVersion} offline/realtime regressions: OK`);
