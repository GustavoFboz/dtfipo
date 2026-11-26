import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {releaseDecision} from './saas-sales-release-gate.mjs';
const ledger=JSON.parse(readFileSync('docs/saas/IMPLEMENTATION-PROGRESS.json','utf8'));
test('blocks all sales at any incomplete protocol percentage without production action',()=>{
 const result=releaseDecision(structuredClone(ledger));
 assert.equal(result.status,'blocked');
 assert.equal(result.release_authorized,false);
 assert.equal(result.mode,'read-only-audit');
 assert.equal(result.pending_criteria_count,10);
 assert.deepEqual(result.blocking_criteria,ledger.remaining_ids);
});
test('cannot promote sale readiness from completed technical gates or a high partial score',()=>{
 const data=structuredClone(ledger);
 for(const gates of Object.values(data.reviewed_partial_gates)){
   for(const gate of gates.slice(0,-1)){gate.complete=true;gate.evidence=gate.evidence??'internal://mock-evidence';}
   gates[gates.length-1].complete=false;
 }
 const result=releaseDecision(data);
 assert.equal(result.status,'blocked');
 assert.equal(result.release_authorized,false);
});
test('all formal acceptances permit only review, not public sale or deploy',()=>{
 const data=structuredClone(ledger);
 data.official_acceptance.accepted_ids=[...data.official_acceptance.accepted_ids,...data.remaining_ids];
 data.remaining_ids=[];data.reviewed_partial_gates={};
 const result=releaseDecision(data);
 assert.equal(result.status,'eligible_for_manual_release_review');
 assert.equal(result.release_authorized,false);
});
test('rejects unsupported schema changes and forged formal acceptances',()=>{
 const a=structuredClone(ledger);a.denominator=999;
 assert.throws(()=>releaseDecision(a),/PROGRESS_SCHEMA_INVALID/);
 const b=structuredClone(ledger);b.official_acceptance.accepted_ids.push('7.4');
 assert.throws(()=>releaseDecision(b),/PROGRESS_SCOPE_MISMATCH/);
});
