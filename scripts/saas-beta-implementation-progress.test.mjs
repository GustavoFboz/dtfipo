import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {summarizeBetaImplementation} from './saas-beta-implementation-progress.mjs';
import {releaseDecision} from './saas-sales-release-gate.mjs';
const ledger=JSON.parse(readFileSync('docs/saas/IMPLEMENTATION-PROGRESS.json','utf8'));
const policy=JSON.parse(readFileSync('docs/saas/BETA-IMPLEMENTATION-SCOPE.json','utf8'));
const clone=x=>structuredClone(x);

test('only one beta implementation percentage covers all original 23 criteria',()=>{
 const r=summarizeBetaImplementation(clone(ledger),clone(policy));
 assert.equal(r.overall_progress_percent,93.48);
 assert.equal(r.completed_implementation_criteria,18);
 assert.equal(r.total_items,23);
 assert.deepEqual(r.remaining_implementation_ids,['2.3','6.2','4.2','6.3','6.4','7.4'].filter(x=>x!=='2.3').sort((a,b)=>a.localeCompare(b))); // canonical remaining ledger order
 assert.equal(r.deferred_external_validation_gates,20);
 assert.equal(r.original_accepted_items,13);
 assert.equal(r.original_remaining_acceptance,10);
});
test('rebaseline never changes formal acceptance or authorizes real-patient beta and sales',()=>{
 const r=summarizeBetaImplementation(clone(ledger),clone(policy));
 const launch=releaseDecision(clone(ledger));
 assert.equal(r.overall_progress_percent,93.48);
 assert.equal(launch.status,'blocked');
 assert.equal(launch.release_authorized,false);
 assert.equal(policy.real_patient_data_beta_requires_signed_terms_and_lgpd_review,true);
 assert.equal(policy.commercial_release_blocked_until_explicit_approval,true);
});
test('forbid moving missing historical bytes or legacy patient provenance into future beta',()=>{
 for(const [id,gate] of [['6.2','storage-full-copy'],['4.2','unowned-patient-attribution'],['6.3','database-realtime-baseline'],['6.4','published-versioned-terms-acceptance'],['7.4','production-release-candidate-verified']]){
   const s=clone(policy);s.deferred_validation_gates[id]??=[];
   s.deferred_validation_gates[id].push({gate_id:gate,category:'external_or_beta_validation',reason:'forged'});
   assert.throws(()=>summarizeBetaImplementation(clone(ledger),s),/BETA_SCOPE_ALLOWLIST_CHANGED/);
 }
});
test('reject tampered acceptance ledger and made-up implementation evidence',()=>{
 const d=clone(ledger);d.reviewed_partial_gates['6.2'][3].complete=true;
 assert.throws(()=>summarizeBetaImplementation(d,policy),/PROGRESS_EVIDENCE_REQUIRED/);
 const changed=clone(policy);changed.denominator=24;
 assert.throws(()=>summarizeBetaImplementation(ledger,changed),/BETA_SCOPE_INVALID/);
});
test('100 implementation possible without provider future date but only after every technical gate has evidence',()=>{
 const d=clone(ledger);
 for(const [id,gates] of Object.entries(d.reviewed_partial_gates)){
   const excluded=new Set((policy.deferred_validation_gates[id]??[]).map(x=>x.gate_id));
   for(const g of gates)if(!excluded.has(g.id) && !g.complete){g.complete=true;g.evidence='internal://test-only-candidate';}
 }
 // Original completion guard forbids scoring all unaccepted gates and keeps real tests deferred.
 const r=summarizeBetaImplementation(d,policy);
 assert.equal(r.overall_progress_percent,100);
 assert.equal(releaseDecision(d).release_authorized,false);
});
test('patient audit query cannot enumerate sensitive identities, medical content or mutate',()=>{
 const script=readFileSync('docs/saas/sql/unassigned-patients-readonly-summary.sql','utf8');
 const sql=script.split('\n').filter(x=>!x.trim().startsWith('--')).join('\n');
 const st=sql.split(';').map(x=>x.trim()).filter(Boolean);
 assert.equal(st.length,3);
 for(const line of st){
  assert.match(line,/^SELECT\s/i);
  assert.doesNotMatch(line,/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|COPY|CALL|PERFORM|pg_sleep)\b/i);
  assert.doesNotMatch(line,/\b(name|email|phone|cpf|rg|notes|allergies|medical_history|photo_url|birth_date)\b/i);
 }
});
