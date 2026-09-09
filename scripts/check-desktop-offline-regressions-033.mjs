import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sourcePath = "scripts/check-desktop-offline-regressions.mjs";
const tauriPath = "src-tauri/tauri.conf.json";
const source = fs.readFileSync(sourcePath, "utf8");
const tauri = fs.readFileSync(tauriPath, "utf8");

if (!tauri.includes('"version": "0.3.3"')) {
  throw new Error("DentalFlow Desktop release must be 0.3.3.");
}

// Preserve the complete historical regression suite while advancing the formal
// release marker. The legacy script intentionally remains untouched so older
// maintenance branches can still execute it against their original release.
const adapted = source
  .replaceAll('"version": "0.3.2"', '"version": "0.3.3"')
  .replaceAll("Desktop version must be 0.3.2.", "Desktop version must be 0.3.3.");

const tempPath = path.join(os.tmpdir(), `dentalflow-offline-regressions-033-${process.pid}.mjs`);
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

console.log("DentalFlow Desktop 0.3.3 historical offline regressions: OK");
