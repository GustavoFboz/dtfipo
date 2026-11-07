import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {summarizeImplementationProgress} from './saas-implementation-progress.mjs';

export function releaseDecision(ledger) {
  const progress=summarizeImplementationProgress(ledger);
  const blockers=[...ledger.remaining_ids];
  if (progress.overall_progress_percent===100 && blockers.length) throw Error('RELEASE_GATE_CONFLICT');
  return {
    contract:'dentalflow-saas-sales-gate-v1',
    status:blockers.length===0 && progress.accepted_items===progress.total_items ? 'eligible_for_manual_release_review' : 'blocked',
    blocking_criteria:blockers,
    pending_criteria_count:blockers.length,
    release_authorized:false,
    // This checker must NEVER grant a production deploy, charge money,
    // enable feature flags or replace a human authorized release decision.
    mode:'read-only-audit',
    note:'Even after 23/23 signoffs a separate authorized publication review is required.',
  };
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const d=JSON.parse(readFileSync(process.argv[2]||'docs/saas/IMPLEMENTATION-PROGRESS.json','utf8'));
    const result=releaseDecision(d);
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(process.argv.includes('--require-eligible') && result.status!=='eligible_for_manual_release_review') process.exitCode=2;
  }catch{console.error('RELEASE_READINESS_AUDIT_INVALID');process.exitCode=1;}
}
