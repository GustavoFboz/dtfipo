import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const workflow = fs.readFileSync(".github/workflows/saas-asaas-production-preflight.yml", "utf8");
assert(!/^  schedule:/m.test(workflow) && !workflow.includes("--request POST"));
assert(!workflow.includes("ASAAS_PRODUCTION_API_KEY") && !workflow.includes("api.asaas.com"));
const firstStep = workflow.split("      - name: ")[1];
const block = firstStep.slice(firstStep.indexOf("        run: |\n") + "        run: |\n".length);
const script = block.split("\n").filter((line) => line.startsWith("          ")).map((line) => line.slice(10)).join("\n");
assert.equal(spawnSync("bash", ["-n"], { input: script }).status, 0, "Preflight Bash syntax is invalid.");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dentalflow-production-preflight-"));
try {
  const bin = path.join(tmp, "bin"); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "curl"), `#!${process.execPath}
const fs=require('node:fs'),a=process.argv.slice(2);
if(a[a.indexOf('--request')+1]!=='GET')process.exit(42);
if(a.at(-1)!=='https://dtfipo.lovable.app/api/billing/asaas-worker?check=production-setup')process.exit(43);
if(a[a.indexOf('--header')+1]!=='@-' || a.some(x=>x.includes(process.env.BILLING_PRODUCTION_WORKER_TOKEN)))process.exit(44);
if(fs.readFileSync(0,'utf8')!=='Authorization: Bearer '+process.env.BILLING_PRODUCTION_WORKER_TOKEN+'\\n')process.exit(45);
fs.writeFileSync(a[a.indexOf('--output')+1],process.env.FIXTURE_BODY);
process.stdout.write(process.env.FIXTURE_STATUS);
`); fs.chmodSync(path.join(bin, "curl"), 0o700);
  fs.writeFileSync(path.join(bin, "sleep"), "#!/bin/sh\nexit 0\n"); fs.chmodSync(path.join(bin, "sleep"), 0o700);
  const account = { general: "APPROVED", commercialInfo: "APPROVED", bankAccountInfo: "APPROVED", documentation: "APPROVED" };
  const healthy = { available: true, contract: "dentalflow-production-preflight-v1", environment: "production",
    checked_at: "2026-10-05T05:00:00Z", configuration_valid: true, credentials_valid: true, account,
    account_approved: true, runtime_environment: "sandbox", production_enabled: false,
    webhook_delivery_verified: false, financial_processing_invoked: false };
  const run = (body, status = "200") => spawnSync("bash", ["-c", script], { cwd: tmp, encoding: "utf8", timeout: 15_000,
    env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH,
      BILLING_PRODUCTION_WORKER_TOKEN: "fake-production-worker-fixture-not-a-real-secret-0123456789",
      FIXTURE_BODY: JSON.stringify(body), FIXTURE_STATUS: status } });
  assert.equal(run(healthy).status, 0, "Readonly Production credential verification failed.");
  assert.equal(run({ ...healthy, private: "PRIVATE_ERROR_MARKER", account: { ...account, private: "APPROVED" } }).status, 0);
  assert(!fs.readFileSync(path.join(tmp, "production-preflight.json"), "utf8").includes("PRIVATE_ERROR_MARKER"));
  assert(!fs.readFileSync(path.join(tmp, "production-preflight.json"), "utf8").includes('"private"'));
  assert.notEqual(run({ ...healthy, account_approved: false, account: { ...account, documentation: "PENDING" } }).status, 0,
    "Valid key with a pending account was accepted.");
  for (const body of [
    { ...healthy, environment: "sandbox" }, { ...healthy, credentials_valid: false },
    { ...healthy, account_approved: true, account: { ...account, commercialInfo: "EXPIRED" } },
    { ...healthy, checked_at: "PRIVATE_ERROR_MARKER" }, { ...healthy, financial_processing_invoked: true },
    { ...healthy, account: { ...account, documentation: "private status" } },
  ]) {
    const result = run(body); assert.notEqual(result.status, 0, "Invalid or financial preflight payload was accepted.");
    assert(!`${result.stdout}${result.stderr}`.includes("PRIVATE_ERROR_MARKER"));
  }
  for (const status of ["401", "404", "502", "503"]) {
    const result = run({ error: "PRIVATE_ERROR_MARKER" }, status);
    assert.notEqual(result.status, 0); assert(!`${result.stdout}${result.stderr}`.includes("PRIVATE_ERROR_MARKER"));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp, "production-preflight.json"), "utf8")),
      { available: false, http_status: status, code: "UNCLASSIFIED", financial_processing_invoked: false,
        provider_http_status: null, transport_code: null });
  }
  for (const code of ["PRODUCTION_CONFIGURATION_FAILED", "PRODUCTION_CREDENTIAL_REFUSED",
    "PRODUCTION_PROVIDER_UNAVAILABLE", "PRODUCTION_STATUS_INVALID", "PRODUCTION_PREFLIGHT_TIMEOUT"]) {
    const result = run({ available: false, code, private: "PRIVATE_ERROR_MARKER" }, "502");
    assert.notEqual(result.status, 0); assert(result.stdout.includes(`code ${code}.`));
    assert(!`${result.stdout}${result.stderr}`.includes("PRIVATE_ERROR_MARKER"));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp, "production-preflight.json"), "utf8")),
      { available: false, http_status: "502", code, financial_processing_invoked: false,
        provider_http_status: null, transport_code: null });
  }
  for (const body of [{ code: "PRIVATE_ERROR_MARKER" }, ["PRODUCTION_CREDENTIAL_REFUSED"], null]) {
    const result = run(body, "502"); assert.notEqual(result.status, 0);
    assert(result.stdout.includes("code UNCLASSIFIED."));
    assert(!`${result.stdout}${result.stderr}`.includes("PRIVATE_ERROR_MARKER"));
    assert(!fs.readFileSync(path.join(tmp, "production-preflight.json"), "utf8").includes("PRIVATE_ERROR_MARKER"));
  }
  for (const provider_http_status of [200, 400, 429, 503]) {
    const result = run({ code: "PRODUCTION_PROVIDER_UNAVAILABLE", provider_http_status,
      transport_code: "PRIVATE_ERROR_MARKER", error: "PRIVATE_ERROR_MARKER" }, "502");
    assert.notEqual(result.status, 0); assert(result.stdout.includes(`Provider HTTP ${provider_http_status}, transport NONE.`));
    assert(!`${result.stdout}${result.stderr}`.includes("PRIVATE_ERROR_MARKER"));
    assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, "production-preflight.json"), "utf8")).provider_http_status,
      provider_http_status);
  }
  for (const provider_http_status of ["PRIVATE_ERROR_MARKER", 429.5, 0, 600]) {
    const result = run({ code: "PRODUCTION_PROVIDER_UNAVAILABLE", provider_http_status,
      transport_code: "ENOTFOUND", error: "PRIVATE_ERROR_MARKER" }, "502");
    assert.notEqual(result.status, 0); assert(result.stdout.includes("Provider HTTP NONE, transport ENOTFOUND."));
    assert(!`${result.stdout}${result.stderr}`.includes("PRIVATE_ERROR_MARKER"));
    assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, "production-preflight.json"), "utf8")).provider_http_status, null);
  }
  console.log("Production preflight workflow: fixed private GET, secret via stdin, safe evidence, pending-account and financial guards passed (fake HTTP).");
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
