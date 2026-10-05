import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const workflow = fs.readFileSync(".github/workflows/saas-asaas-production-preflight.yml", "utf8");
assert(!/^  schedule:/m.test(workflow) && !workflow.includes("--request POST"));
assert(!workflow.includes("ASAAS_PRODUCTION_API_KEY") && !workflow.includes("api.asaas.com"));
const extract = (name) => {
  const step = workflow.split("      - name: ").find((part) => part.startsWith(name + "\n"));
  assert(step, `Missing readonly step: ${name}`);
  const block = step.slice(step.indexOf("        run: |\n") + "        run: |\n".length);
  const script = block.split("\n").filter((line) => line.startsWith("          ")).map((line) => line.slice(10)).join("\n");
  assert.equal(spawnSync("bash", ["-n"], { input: script }).status, 0, "Preflight Bash syntax is invalid.");
  return script;
};
const script = extract("Read staged Production credentials and account status");
const webhookScript = extract("Read staged Production webhook configuration");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dentalflow-production-preflight-"));
try {
  const bin = path.join(tmp, "bin"); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "curl"), `#!${process.execPath}
const fs=require('node:fs'),a=process.argv.slice(2);
if(a[a.indexOf('--request')+1]!=='GET')process.exit(42);
if(a.at(-1)!==process.env.FIXTURE_ENDPOINT)process.exit(43);
if(a[a.indexOf('--header')+1]!=='@-' || a.some(x=>x.includes(process.env.BILLING_PRODUCTION_WORKER_TOKEN)))process.exit(44);
if(fs.readFileSync(0,'utf8')!=='Authorization: Bearer '+process.env.BILLING_PRODUCTION_WORKER_TOKEN+'\\n')process.exit(45);
fs.writeFileSync(a[a.indexOf('--output')+1],process.env.FIXTURE_BODY);
process.stdout.write(process.env.FIXTURE_STATUS);
`); fs.chmodSync(path.join(bin, "curl"), 0o700);
  fs.writeFileSync(path.join(bin, "sleep"), "#!/bin/sh\nexit 0\n"); fs.chmodSync(path.join(bin, "sleep"), 0o700);
  const account = { general: "APPROVED", commercialInfo: "APPROVED", bankAccountInfo: "APPROVED", documentation: "APPROVED" };
  const healthy = { available: true, contract: "dentalflow-production-preflight-v2", environment: "production",
    checked_at: "2026-10-05T05:00:00Z", configuration_valid: true, credentials_valid: true, account,
    account_approved: true, account_setup_complete: true, runtime_environment: "sandbox", production_enabled: false,
    webhook_delivery_verified: false, financial_processing_invoked: false };
  const run = (body, status = "200") => spawnSync("bash", ["-c", script], { cwd: tmp, encoding: "utf8", timeout: 15_000,
    env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH,
      BILLING_PRODUCTION_WORKER_TOKEN: "fake-production-worker-fixture-not-a-real-secret-0123456789",
      FIXTURE_BODY: JSON.stringify(body), FIXTURE_STATUS: status,
      FIXTURE_ENDPOINT: "https://dtfipo.lovable.app/api/billing/asaas-worker?check=production-setup" } });
  assert.equal(run(healthy).status, 0, "Readonly Production credential verification failed.");
  assert.equal(run({ ...healthy, private: "PRIVATE_ERROR_MARKER", account: { ...account, private: "APPROVED" } }).status, 0);
  assert(!fs.readFileSync(path.join(tmp, "production-preflight.json"), "utf8").includes("PRIVATE_ERROR_MARKER"));
  assert(!fs.readFileSync(path.join(tmp, "production-preflight.json"), "utf8").includes('"private"'));
  assert.equal(run({ ...healthy, account_setup_complete: false, account: { ...account, bankAccountInfo: "PENDING" } }).status, 0,
    "General approval was incorrectly rejected for pending banking information.");
  assert.notEqual(run({ ...healthy, account_approved: false, account_setup_complete: false,
    account: { ...account, general: "PENDING" } }).status, 0, "Valid key with pending general approval was accepted.");
  for (const body of [
    { ...healthy, environment: "sandbox" }, { ...healthy, credentials_valid: false },
    { ...healthy, contract: "dentalflow-production-preflight-v1" },
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
  const automated = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_REFUNDED",
    "SUBSCRIPTION_CREATED", "SUBSCRIPTION_UPDATED", "SUBSCRIPTION_INACTIVATED"];
  const review = ["PAYMENT_PARTIALLY_REFUNDED", "PAYMENT_REFUND_IN_PROGRESS", "PAYMENT_CHARGEBACK_REQUESTED",
    "PAYMENT_CHARGEBACK_DISPUTE", "PAYMENT_AWAITING_CHARGEBACK_REVERSAL", "SUBSCRIPTION_DELETED"];
  const webhook = { id: "whk_fixture", enabled: false, interrupted: false, api_version: 3,
    send_type: "SEQUENTIALLY", token_matches: true, configured_events: [...automated, ...review],
    missing_automated_events: [], missing_review_events: [], unknown_events_count: 0 };
  const webhookHealthy = { available: true, contract: "dentalflow-production-webhook-preflight-v1", environment: "production",
    checked_at: healthy.checked_at, configuration_valid: true, credentials_valid: true, listing_complete: true,
    matching_webhooks: 1, webhook_prepared: true, webhooks: [webhook],
    webhook_delivery_verified: false, financial_processing_invoked: false };
  const runWebhook = (body, status = "200") => spawnSync("bash", ["-c", webhookScript], { cwd: tmp, encoding: "utf8", timeout: 15_000,
    env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH,
      BILLING_PRODUCTION_WORKER_TOKEN: "fake-production-worker-fixture-not-a-real-secret-0123456789",
      FIXTURE_BODY: JSON.stringify(body), FIXTURE_STATUS: status,
      FIXTURE_ENDPOINT: "https://dtfipo.lovable.app/api/billing/asaas-worker?check=production-webhook" } });
  assert.equal(runWebhook(webhookHealthy).status, 0, "Disabled webhook configuration was not confirmed.");
  assert.equal(runWebhook({ ...webhookHealthy, private: "PRIVATE_ERROR_MARKER", webhooks: [{ ...webhook,
    authToken: "PRIVATE_ERROR_MARKER", email: "PRIVATE_ERROR_MARKER", url: "PRIVATE_ERROR_MARKER" }] }).status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp, "production-webhook-preflight.json"), "utf8")), webhookHealthy);
  for (const fields of [{ enabled: true }, { interrupted: true }, { api_version: 2 }, { send_type: "NON_SEQUENTIALLY" },
    { token_matches: false }, { token_matches: null }, { unknown_events_count: 1 },
    { configured_events: [...automated.slice(1), ...review], missing_automated_events: [automated[0]] }]) {
    const body = { ...webhookHealthy, webhook_prepared: false, webhooks: [{ ...webhook, ...fields }] };
    assert.notEqual(runWebhook(body).status, 0, "Unprepared webhook was accepted.");
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp, "production-webhook-preflight.json"), "utf8")), body,
      "Valid configuration finding was not preserved for review.");
  }
  for (const body of [
    { ...webhookHealthy, listing_complete: false, webhook_prepared: false },
    { ...webhookHealthy, matching_webhooks: 0, webhooks: [], webhook_prepared: false },
    { ...webhookHealthy, matching_webhooks: 2, webhooks: [webhook, webhook], webhook_prepared: false },
  ]) assert.notEqual(runWebhook(body).status, 0, "Incomplete or ambiguous webhook configuration was accepted.");
  for (const body of [
    { ...webhookHealthy, financial_processing_invoked: true },
    { ...webhookHealthy, matching_webhooks: 99 },
    { ...webhookHealthy, webhooks: [{ ...webhook, enabled: true }] },
    { ...webhookHealthy, webhooks: [{ ...webhook, token_matches: "PRIVATE_ERROR_MARKER" }] },
    { ...webhookHealthy, webhooks: [{ ...webhook, configured_events: ["PRIVATE_ERROR_MARKER"] }] },
    { ...webhookHealthy, webhooks: [{ ...webhook, id: "PRIVATE_ERROR_MARKER" }] },
    { ...webhookHealthy, webhooks: [{ ...webhook, missing_review_events: [review[0]] }] },
  ]) {
    const result = runWebhook(body); assert.notEqual(result.status, 0, "Invalid or financial webhook payload was accepted.");
    assert(!`${result.stdout}${result.stderr}`.includes("PRIVATE_ERROR_MARKER"));
    assert(!fs.readFileSync(path.join(tmp, "production-webhook-preflight.json"), "utf8").includes("PRIVATE_ERROR_MARKER"));
  }
  for (const body of [{ code: "PRODUCTION_WEBHOOK_STATUS_INVALID", provider_http_status: 200 },
    { code: "PRODUCTION_PROVIDER_UNAVAILABLE", transport_code: "ENOTFOUND" },
    { code: "PRIVATE_ERROR_MARKER", provider_http_status: "PRIVATE_ERROR_MARKER", transport_code: "PRIVATE_ERROR_MARKER" }, null]) {
    const result = runWebhook(body, "502"); assert.notEqual(result.status, 0);
    assert(!`${result.stdout}${result.stderr}`.includes("PRIVATE_ERROR_MARKER"));
    assert(!fs.readFileSync(path.join(tmp, "production-webhook-preflight.json"), "utf8").includes("PRIVATE_ERROR_MARKER"));
  }
  console.log("Production preflight workflow: fixed private GETs, secrets via stdin, safe evidence, independent general approval, disabled webhook configuration and financial guards passed (fake HTTP).");
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
