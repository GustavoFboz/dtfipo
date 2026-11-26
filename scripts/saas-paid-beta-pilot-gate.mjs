import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";

export const REQUIRED_BETA_CHECKS = Object.freeze([
  "production-billing-lifecycle",
  "clinical-case-and-tenant-safety",
  "recoverable-backup-and-rollback",
  "approved-contract-and-versioned-consent",
  "deployment-source-and-environment-parity",
  "privacy-safe-beta-observability",
  "support-invitations-and-emergency-stop",
  "owner-authorized-paid-pilot"
]);

/**
 * Read-only: allows beta readiness REVIEW even when physical 23-item
 * acceptance is incomplete. It never grants launch authority or changes
 * payment, database, storage, deployment or release flags.
 */
export function assessPaidBetaPilot(document) {
  if (!document || document.schema !== "dentalflow-paid-beta-prelaunch-evidence-v1" ||
      document.target !== "paid-web-beta-invitations-only" ||
      document.not_general_release !== true ||
      document.formal_acceptances_remain_separate !== true ||
      document.production_changes_authorized !== false ||
      !Array.isArray(document.checks) || document.checks.length !== REQUIRED_BETA_CHECKS.length)
    throw new Error("BETA_READINESS_SCHEMA_INVALID");
  const expected = new Set(REQUIRED_BETA_CHECKS);
  const found = new Set();
  for (const check of document.checks) {
    if (!check || !expected.has(check.id) || found.has(check.id) ||
        !["pending","verified"].includes(check.status) ||
        !Array.isArray(check.evidence) ||
        check.evidence.some(value => typeof value !== "string" || !/^https:\/\//.test(value)) ||
        (check.status === "verified" && check.evidence.length === 0))
      throw new Error("BETA_READINESS_EVIDENCE_INVALID");
    found.add(check.id);
  }
  const incomplete = document.checks.filter(x => x.status !== "verified").map(x => x.id);
  return {
    schema: "dentalflow-paid-beta-decision-v1",
    status: incomplete.length ? "blocked" : "eligible_for_manual_review",
    incomplete,
    validated_count: REQUIRED_BETA_CHECKS.length - incomplete.length,
    required_count: REQUIRED_BETA_CHECKS.length,
    release_authorized: false,
    commercial_payments_authorized: false,
    mode: "read-only-audit",
    note: "This beta-only gate does not waive 23 formal acceptances. Evidence links require independent review; even an eligible result never publishes or enables charges.",
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const input = JSON.parse(readFileSync(process.argv[2] || "docs/saas/PAID-BETA-READINESS.json", "utf8"));
    process.stdout.write(JSON.stringify(assessPaidBetaPilot(input), null, 2) + "\n");
    if (process.argv.includes("--require-review-eligible") &&
        assessPaidBetaPilot(input).status !== "eligible_for_manual_review") process.exitCode = 2;
  } catch {
    console.error("BETA_READINESS_INVALID");
    process.exitCode = 1;
  }
}
