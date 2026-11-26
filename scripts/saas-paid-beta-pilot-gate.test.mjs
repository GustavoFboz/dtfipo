import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessPaidBetaPilot, REQUIRED_BETA_CHECKS} from "./saas-paid-beta-pilot-gate.mjs";
const source = JSON.parse(readFileSync("docs/saas/PAID-BETA-READINESS.json", "utf8"));
const clone = data => structuredClone(data);

test("real readiness remains blocked and requires each essential check", () => {
  const result = assessPaidBetaPilot(source);
  assert.equal(result.status, "blocked");
  assert.equal(result.validated_count, 0);
  assert.equal(result.incomplete.length, REQUIRED_BETA_CHECKS.length);
  assert.equal(result.release_authorized, false);
  assert.equal(result.commercial_payments_authorized, false);
});
test("23 formal acceptances are not used to falsely block an independently verified beta", () => {
  const mock = clone(source);
  for (const check of mock.checks) { check.status = "verified"; check.evidence = ["https://example.invalid/evidence"]; }
  const result = assessPaidBetaPilot(mock);
  assert.equal(result.status, "eligible_for_manual_review");
  assert.equal(result.release_authorized, false);
  assert.equal(result.commercial_payments_authorized, false);
});
test("missing, duplicated, unknown, malformed or unevidenced gates fail closed", () => {
  const variants = [
    d => d.checks.pop(),
    d => d.checks[1].id = d.checks[0].id,
    d => d.checks[0].id = "bypass",
    d => d.checks[0].status = "approved",
    d => d.checks[0].status = "verified",
    d => d.checks[0].evidence = ["abc"],
    d => d.production_changes_authorized = true,
    d => d.formal_acceptances_remain_separate = false
  ];
  for (const mutate of variants) {
    const fixture = clone(source);
    mutate(fixture);
    assert.throws(() => assessPaidBetaPilot(fixture));
  }
});
