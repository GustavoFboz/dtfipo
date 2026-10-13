import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const migrationName = "20261005190000_saas_database_scheduler_stage09.sql";
assert.equal(fs.readFileSync(`supabase/migrations/${migrationName}`, "utf8"), fs.readFileSync(`public/restore/migrations/${migrationName}`, "utf8"));
assert(JSON.parse(fs.readFileSync("public/restore/migrations.json", "utf8")).includes(migrationName));
const workflow = fs.readFileSync(".github/workflows/saas-database-scheduler-bootstrap.yml", "utf8");
assert(!workflow.includes("ASAAS_PRODUCTION_API_KEY") && !/^  schedule:/m.test(workflow));
const step = workflow.split("      - name: ").find((part) => part.startsWith("Confirm private contract before configuring the Sandbox schedule\n"));
assert(step);
const script = step.slice(step.indexOf("        run: |\n") + "        run: |\n".length).split("\n")
  .filter((line) => line.startsWith("          ")).map((line) => line.slice(10)).join("\n");
assert.equal(spawnSync("bash", ["-n"], { input: script }).status, 0);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dentalflow-database-scheduler-"));
try {
  const bin = path.join(tmp, "bin"); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "sleep"), "#!/bin/sh\nexit 0\n"); fs.chmodSync(path.join(bin, "sleep"), 0o700);
  fs.writeFileSync(path.join(bin, "curl"), `#!${process.execPath}
const fs=require('node:fs'), a=process.argv.slice(2), method=a[a.indexOf('--request')+1];
if(a.at(-1)!=='https://dtfipo.lovable.app/api/billing/asaas-worker?check=database-scheduler')process.exit(42);
if(!['GET','POST'].includes(method)||a[a.indexOf('--header')+1]!=='@-'||a.some(x=>x.includes(process.env.BILLING_PRODUCTION_WORKER_TOKEN)))process.exit(43);
const headers=fs.readFileSync(0,'utf8'), expected='Authorization: Bearer '+process.env.BILLING_PRODUCTION_WORKER_TOKEN+'\\n';
if(headers!==expected+(method==='POST'?'Content-Type: application/json\\n':''))process.exit(44);
if(method==='POST'&&a[a.indexOf('--data')+1]!=='{"expected_environment":"sandbox"}')process.exit(45);
fs.appendFileSync('calls.log',method+'\\n');
fs.writeFileSync(a[a.indexOf('--output')+1],process.env[method+'_BODY']);process.stdout.write(process.env[method+'_STATUS']);
`); fs.chmodSync(path.join(bin, "curl"), 0o700);
  const base = { available: true, contract: "dentalflow-database-scheduler-v1", environment: "sandbox",
    checked_at: "2026-10-05T19:00:00Z", immediate_worker_invoked: false };
  const unconfigured = { ...base, scheduler: null };
  const registered = { ...base, api_isolation_verified: true, scheduler: { provider_environment: "sandbox", scheduled: true, cron_job_id: 1, schedule: "1-59/5 * * * *" } };
  const active = { ...base, scheduler: { provider_environment: "sandbox", enabled: true, cron_active: true, cron_job_id: 1,
    schedule: "1-59/5 * * * *", configured_at: base.checked_at, last_dispatched_at: null,
    last_response_http_status: null, last_response_timed_out: null } };
  const run = (get, post = registered, getStatus = "200", postStatus = "200") => {
    fs.writeFileSync(path.join(tmp, "calls.log"), "");
    const result = spawnSync("bash", ["-c", script], { cwd: tmp, encoding: "utf8", timeout: 15_000, env: { ...process.env,
      PATH: bin + path.delimiter + process.env.PATH, BILLING_PRODUCTION_WORKER_TOKEN: "fake-private-operator-not-a-real-secret-0123456789",
      GET_BODY: JSON.stringify(get), POST_BODY: JSON.stringify(post), GET_STATUS: getStatus, POST_STATUS: postStatus } });
    return { ...result, calls: fs.readFileSync(path.join(tmp, "calls.log"), "utf8").trim().split("\n").filter(Boolean) };
  };
  const initialized = run(unconfigured, { ...registered, token: "PRIVATE_MARKER", private: "PRIVATE_MARKER" });
  assert.equal(initialized.status, 0); assert.deepEqual(initialized.calls, ["GET", "POST"]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp, "database-scheduler.json"), "utf8")), registered);
  const preserved = run({ ...active, scheduler: { ...active.scheduler, worker_secret_id: "PRIVATE_MARKER" } });
  assert.equal(preserved.status, 0); assert.deepEqual(preserved.calls, ["GET"]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp, "database-scheduler.json"), "utf8")), active);
  const rotated = run({ ...active, scheduler: { ...active.scheduler, last_response_http_status: 401 } });
  assert.equal(rotated.status, 0); assert.deepEqual(rotated.calls, ["GET", "POST"], "Rejected stored worker credential was not refreshed from the backend.");
  for (const get of [{ ...unconfigured, contract: "dentalflow-worker-health-v1" }, { ...unconfigured, environment: "production" },
    { ...unconfigured, immediate_worker_invoked: true }, { ...unconfigured, checked_at: "PRIVATE_MARKER" }, { error: "PRIVATE_MARKER" }]) {
    const result = run(get); assert.notEqual(result.status, 0); assert(!result.calls.includes("POST"), "Legacy/drifted GET led to an unsafe POST.");
    assert(!`${result.stdout}${result.stderr}`.includes("PRIVATE_MARKER"));
  }
  const refused = run({ error: "PRIVATE_MARKER" }, registered, "401");
  assert.notEqual(refused.status, 0); assert(!refused.calls.includes("POST"));
  for (const post of [{ ...registered, environment: "production" }, { ...registered, immediate_worker_invoked: true },
    { ...registered, api_isolation_verified: false }, { ...registered, scheduler: { ...registered.scheduler, scheduled: false } }, { error: "PRIVATE_MARKER" }]) {
    const result = run(unconfigured, post); assert.notEqual(result.status, 0); assert(!`${result.stdout}${result.stderr}`.includes("PRIVATE_MARKER"));
  }
  console.log("Database scheduler bootstrap: private GET handshake, Sandbox drift refusal, fixed configuration POST, idempotent preservation and evidence redaction passed (fake HTTP).");
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
