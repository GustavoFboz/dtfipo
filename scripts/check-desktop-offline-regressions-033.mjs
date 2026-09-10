import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sourcePath = "scripts/check-desktop-offline-regressions.mjs";
const tauriPath = "src-tauri/tauri.conf.json";
const source = fs.readFileSync(sourcePath, "utf8");
const tauri = fs.readFileSync(tauriPath, "utf8");
const tauriConfig = JSON.parse(tauri);
const currentVersion = String(tauriConfig.version || "").trim();

if (!/^0\.[3-9]\.\d+$/.test(currentVersion)) {
  throw new Error(`Unexpected DentalFlow Desktop release version: ${currentVersion || "missing"}.`);
}

// Preserve the complete historical regression suite while allowing the desktop
// release train to advance without weakening the original offline contract.
const adapted = source
  .replaceAll('"version": "0.3.2"', `"version": "${currentVersion}"`)
  .replaceAll("Desktop version must be 0.3.2.", `Desktop version must be ${currentVersion}.`);

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

console.log(`DentalFlow Desktop ${currentVersion} historical offline regressions: OK`);
