import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {test} from "node:test";

const read = relative => readFileSync(new URL(relative, import.meta.url), "utf8");
const sql = read("../docs/saas/sql/stage-05-lifecycle-rehearsal.sql");
const checkout = read("../src/lib/billing/asaas-checkout.server.ts");
const worker = read("../src/lib/billing/asaas-webhook.server.ts");

test("financial stage5 negative controls run only in a rolled-back disposable transaction",()=>{
  assert.match(sql,/^\s*begin;\s*do \${2}/i);
  assert.match(sql,/\bBETA_STAGE5_NEGATIVE_PRICE_ENVIRONMENT_LEDGER_PASSED\b/);
  assert.match(sql,/\bBILLING_LIFECYCLE_PLAN_MISMATCH\b/);
  assert.match(sql,/\bBILLING_LIFECYCLE_OWNERSHIP_MISMATCH\b/);
  assert.match(sql,/provider_environment='production'/);
  assert.match(sql,/provider_environment='production'[\s\S]+?BILLING_LIFECYCLE_OWNERSHIP_MISMATCH/);
  assert.match(sql,/Rejected overdue price changed entitlement or ledger/);
  assert.match(sql,/Rejected paid price changed suspended entitlement/);
  assert.match(sql,/Cross-environment invoice changed entitlement or ledger/);
  assert.match(sql,/rollback;\s*$/i);
  assert.doesNotMatch(sql,/\b(drop\s+table|truncate\s+table|copy\s+\S+\s+to\s+program)\b/i);
});

test("the Asaas checkout is ask-payer mode, not guaranteed card auto-debit",()=>{
  // The provider may charge automatically IF the payer has chosen stored
  // credit-card billing; the initial checkout alone cannot prove that.
  assert.match(checkout,/billingType:\s*"UNDEFINED"/);
  assert.doesNotMatch(checkout,/billingType:\s*"CREDIT_CARD"/);
});

test("worker verifies payment status from provider before paid access",()=>{
  assert.match(worker,/getPayment:\s*\(id\)\s*=>\s*client\.getPayment\(id\)/);
  assert.match(worker,/getSubscription:\s*\(id\)\s*=>\s*client\.getSubscription\(id\)/);
  assert.match(worker,/const requestedEnvironment\s*=\s*request\.headers\.get\("x-billing-environment"\)/);
  assert.match(worker,/requestedEnvironment\s*!==\s*deps\.environment/);
  assert.match(worker,/EVENT_PROCESSING_INCOMPLETE/);
});

test("no concrete Asaas Production credentials or live charge actions in test source",()=>{
  assert.doesNotMatch(sql,/https?:\/\/|[\$]aact_(?:hmlg|prod)_/);
  assert.doesNotMatch(sql,/\b(connect|dblink|postgres_fdw)\s*\(/i);
  assert.doesNotMatch(sql,/\bset\s+role\s+authenticated\b/i);
});
