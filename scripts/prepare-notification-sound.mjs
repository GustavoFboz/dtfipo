import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "mobile", "audio", "exact");
const prefix = "dentalflow_notification.mp3.b64.";
const expectedBytes = 28_416;
const expectedSha256 = "3ab06b76690800dee2c80b15f58583458d2973606dea0bdcbdae3806e99cb326";

const names = (await readdir(sourceDir))
  .filter((name) => name.startsWith(prefix))
  .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

if (!names.length) throw new Error("DentalFlow notification sound fragments were not found.");

const encoded = (
  await Promise.all(names.map((name) => readFile(join(sourceDir, name), "utf8")))
).join("").replace(/\s+/g, "");

const bytes = Buffer.from(encoded, "base64");
const sha256 = createHash("sha256").update(bytes).digest("hex");

if (bytes.length !== expectedBytes) {
  throw new Error(`Invalid DentalFlow sound byte length: ${bytes.length}; expected ${expectedBytes}`);
}
if (sha256 !== expectedSha256) {
  throw new Error(`Invalid DentalFlow sound SHA-256: ${sha256}`);
}

const targets = [
  join(root, "src-tauri", "resources", "dentalflow_notification.mp3"),
  join(root, "mobile", "generated", "dentalflow_notification.mp3"),
];

for (const target of targets) {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

console.log(`DentalFlow notification sound prepared: ${bytes.length} bytes · ${sha256}`);
