import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const text = fs.readFileSync(".github/workflows/saas-asaas-publication-probe.yml", "utf8");
const drill = text.split("  controlled-alert-drill:\n")[1];
assert(drill?.includes("if: github.event_name == 'workflow_dispatch' && github.ref_name == 'saas/production-alert-drill-20261019'"));
assert(drill.includes("needs: inspect"));
assert(!/secrets\.|curl|--request|BILLING_.*TOKEN|query_database|psql|cron\./.test(drill), "Drill must have no credentials, outbound request or database access.");
function script(name) {
  const part = text.split("      - name: ").find((s) => s.startsWith(name + "\n"));
  assert(part, name);
  const block = part.slice(part.indexOf("        run: |\n") + "        run: |\n".length);
  return block.split("\n").filter((s) => s.startsWith("          ")).map((s) => s.slice(10)).join("\n");
}
const live = script("Assess recorded worker execution");
const runDrill = script("Simulate a stale heartbeat in the downloaded copy only");
const liveGate = /! jq -e '([^']+)' publication-health.json/.exec(live)?.[1];
const drillGate = /if jq -e '([^']+)' production-alert-drill.json/.exec(runDrill)?.[1];
assert(liveGate && drillGate);
assert.equal(liveGate.replace(/\s+/g, " "), drillGate.replace(/\s+/g, " "), "Drill must exercise the same healthy/stale gate as the live monitor.");
assert.equal(spawnSync("bash", ["-n"], { input: runDrill }).status, 0);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dentalflow-alert-drill-"));
const snapshot = { available: true, contract: "dentalflow-worker-health-v1", environment: "production",
  checked_at: "2026-10-19T05:00:00Z", worker: { status: "ok", healthy_age_seconds: 10, started_age_seconds: 12 } };
try {
  const invoke = (input) => {
    fs.rmSync(path.join(dir, "production-alert-drill.json"), { force: true });
    fs.writeFileSync(path.join(dir, "publication-health.json"), JSON.stringify(input));
    const result = spawnSync("bash", ["-c", runDrill], { cwd: dir, encoding: "utf8", timeout: 5000 });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "publication-health.json"), "utf8")), input,
      "Input snapshot was modified.");
    return result;
  };
  const expected = invoke(snapshot);
  assert.equal(expected.status, 1);
  assert(expected.stdout.includes("CONTROLLED TEST"));
  const evidence = JSON.parse(fs.readFileSync(path.join(dir, "production-alert-drill.json"), "utf8"));
  assert.equal(evidence.worker.healthy_age_seconds, 901);
  assert.equal(evidence.actual_healthy_age_seconds, 10);
  assert.equal(evidence.live_data_modified, false);
  assert.equal(evidence.live_processing_paused, false);
  for (const change of [{ environment: "sandbox" }, { available: false }, { contract: "unknown" },
    { worker: null }, { worker: { ...snapshot.worker, status: "failed" } },
    { worker: { ...snapshot.worker, healthy_age_seconds: 900 } },
    { worker: { ...snapshot.worker, healthy_age_seconds: -1 } }]) {
    const refused = invoke({ ...snapshot, ...change });
    assert.equal(refused.status, 2, "Drill must refuse unhealthy or non-Production input.");
    assert(!fs.existsSync(path.join(dir, "production-alert-drill.json")));
  }
  console.log("Production alert drill: explicit manual branch only, no credentials/network/DB, shared monitor gate, isolated negative result and unchanged input passed.");
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
