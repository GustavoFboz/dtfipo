import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {summarizeImplementationProgress} from './saas-implementation-progress.mjs';

export function summarizeBetaImplementation(ledger,scope){
  const original=summarizeImplementationProgress(ledger); // validates all 23 criteria and existing evidence
  if(!scope || scope.schema!=='dentalflow-saas-beta-implementation-scope-v1' ||
    scope.denominator!==original.total_items || !scope.deferred_validation_gates ||
    Array.isArray(scope.deferred_validation_gates) || typeof scope.deferred_validation_gates!=='object' ||
    scope.manual_release_requires_all_formal_acceptances!==true ||
    scope.real_patient_data_beta_requires_signed_terms_and_lgpd_review!==true ||
    scope.commercial_release_blocked_until_explicit_approval!==true)
    throw Error('BETA_SCOPE_INVALID');
  let points=ledger.official_acceptance.accepted_ids.length;
  let deferredCount=0;
  const incomplete=[];
  for(const [id,entries] of Object.entries(scope.deferred_validation_gates)){
    if(!ledger.remaining_ids.includes(id)|| !Array.isArray(entries))throw Error('BETA_SCOPE_CRITERION_INVALID');
    const gates=ledger.reviewed_partial_gates[id]||[];
    const ids=entries.map(entry=>entry?.gate_id);
    if(new Set(ids).size!==ids.length)throw Error('BETA_SCOPE_DUPLICATE');
    for(const item of entries){
      if(!item || typeof item.reason!=='string'||!item.reason.trim()||
        !['external_or_beta_validation','external_approval_before_real_data_beta'].includes(item.category))throw Error('BETA_SCOPE_REASON_INVALID');
      const g=gates.find(g=>g.id===item.gate_id);
      if(!g || g.complete)throw Error('BETA_SCOPE_GATE_INVALID');
    }
    deferredCount+=entries.length;
  }
  for(const id of ledger.remaining_ids){
    const gates=ledger.reviewed_partial_gates[id];
    if(!gates?.length)throw Error('BETA_SCOPE_MISSING_GATESET');
    const deferred=new Set((scope.deferred_validation_gates[id]||[]).map(x=>x.gate_id));
    const implementation=gates.filter(g=>!deferred.has(g.id));
    if(!implementation.length)throw Error('BETA_SCOPE_ZERO_IMPLEMENTATION_GATE');
    const completed=implementation.filter(g=>g.complete).length;
    points+=completed/implementation.length;
    if(completed<implementation.length)incomplete.push({criterion:id,completed,total:implementation.length,missing:implementation.filter(g=>!g.complete).map(g=>g.id)});
  }
  const percentage=Math.round((points/original.total_items)*10000)/100;
  return {
    methodology:'beta-implementation-only-evidence-based',
    overall_progress_percent:percentage,
    completed_implementation_criteria:original.total_items-incomplete.length,
    total_items:original.total_items,
    remaining_implementation_criteria:incomplete.length,
    remaining_implementation_ids:incomplete.map(x=>x.criterion),
    missing_implementation_gates:incomplete,
    deferred_external_validation_gates:deferredCount,
    original_accepted_items:original.accepted_items,
    original_remaining_acceptance:original.remaining_items,
    note:'This is implementation-only readiness re-baselined to exclude external beta tests, provider timelines and legal signoff. It does not change historical acceptance, authorize commercial launch or guarantee operational readiness.',
  };
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const ledger=JSON.parse(readFileSync('docs/saas/IMPLEMENTATION-PROGRESS.json','utf8'));
 const scope=JSON.parse(readFileSync('docs/saas/BETA-IMPLEMENTATION-SCOPE.json','utf8'));
 try{console.log(JSON.stringify(summarizeBetaImplementation(ledger,scope),null,2))}
 catch{console.error('BETA_IMPLEMENTATION_INVALID');process.exitCode=1}
}
