import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";

const expectedCodes = Object.freeze([
  "source-baseline",
  "independent-backup-path",
  "recover-and-restore",
  "clinical-tenant-security",
  "asaas-critical-lifecycle",
  "legal-privacy-beta-ops",
  "staging-deploy-rollback",
  "paid-beta-publication",
]);

/** Status/report only: NEVER a permission to deploy, charge, or publish. */
export function assessBetaExecutionPlan(plan, readiness) {
  if (!plan || plan.schema !== "dentalflow-beta-eight-executions-v1" ||
      plan.target !== "web-paid-invite-only" ||
      !Array.isArray(plan.steps) || plan.steps.length !== 8 ||
      !["not_published","published"].includes(plan.release_state) ||
      !["pending","approved"].includes(plan.beta_approval_status)) {
    throw new Error("BETA_EXECUTIONS_SCHEMA_INVALID");
  }

  let completed=0;
  for(let i=0;i<expectedCodes.length;i++){
    const step=plan.steps[i];
    if (!step || step.id!==i+1 || step.code!==expectedCodes[i] ||
        typeof step.name!=="string" || !step.name.trim() ||
        typeof step.owner_action!=="string" || !step.owner_action.trim() ||
        typeof step.definition_of_done!=="string" || !step.definition_of_done.trim() ||
        !["done","pending","blocked"].includes(step.status) ||
        !Array.isArray(step.evidence) ||
        step.evidence.some(e => typeof e!=="string" || !/^https:\/\//.test(e))) {
      throw new Error("BETA_EXECUTIONS_STEP_INVALID");
    }
    if(step.status==="done") {
      if(step.evidence.length===0) throw new Error("BETA_EXECUTIONS_UNSUPPORTED_COMPLETE");
      completed++;
    }
  }

  const last=plan.steps[7];
  if(last.status!=="done" && (plan.release_state==="published" || plan.release_url !== null))
    throw new Error("BETA_EXECUTIONS_FALSE_PUBLICATION");

  if(last.status==="done") {
    // Independent evidence may close steps 4-7 in any order. Publication is
    // fundamentally different: it cannot occur while ANY prerequisite is open.
    if(completed!==8) throw new Error("BETA_EXECUTIONS_RELEASE_GATE_BLOCKED");
    if(plan.release_state!=="published" || plan.beta_approval_status!=="approved" ||
        typeof plan.release_url!=="string" ||
        !/^https:\/\//.test(plan.release_url) ||
        !readiness || !Array.isArray(readiness.checks) ||
        readiness.checks.length!==8 ||
        readiness.checks.some(x => x.status!=="verified" || !Array.isArray(x.evidence) || x.evidence.length<1)) {
      throw new Error("BETA_EXECUTIONS_RELEASE_GATE_BLOCKED");
    }
  }

  return {
    schema:"dentalflow-beta-eight-executions-status-v1",
    completed,
    total:8,
    completed_label:`${completed}/8`,
    percent:Number((completed/8*100).toFixed(2)),
    // First still-incomplete step, not an index derived from completed count.
    next_step:plan.steps.find(x=>x.status!=="done")?.id ?? null,
    next_status:plan.steps.find(x=>x.status!=="done")?.status ?? null,
    release_state:plan.release_state,
    release_authorized_by_this_script:false,
    commercial_payments_authorized_by_this_script:false
  };
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try {
    const plan=JSON.parse(readFileSync("docs/saas/BETA-RELEASE-8-EXECUTIONS.json","utf8"));
    const readiness=JSON.parse(readFileSync("docs/saas/PAID-BETA-READINESS.json","utf8"));
    console.log(JSON.stringify(assessBetaExecutionPlan(plan,readiness),null,2));
  } catch {
    console.error("BETA_EXECUTIONS_AUDIT_FAILED");
    process.exitCode=1;
  }
}
