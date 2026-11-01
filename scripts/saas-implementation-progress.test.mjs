import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { summarizeImplementationProgress } from './saas-implementation-progress.mjs';

const original = JSON.parse(readFileSync('docs/saas/IMPLEMENTATION-PROGRESS.json','utf8'));
const clone = () => structuredClone(original);

test('one unified protocol percentage represents accepted and verified partial work', () => {
  const result = summarizeImplementationProgress(clone());
  assert.equal(result.accepted_items,13);
  assert.equal(result.remaining_items,10);
  assert.equal(Object.hasOwn(result,'official_acceptance_percent'),false);
  assert.equal(result.overall_progress_percent,77.21);
  assert.equal(result.verified_partial_gate_points,4.758333);
  assert.deepEqual(result.reviewed_partial_items,['2.1','2.2','2.3','3.3','4.2','5.3','6.2','6.3','6.4','7.4']);
  assert.equal(result.unreviewed_remaining_items.length,0);
});

test('technical score changes with documented gate but formal count cannot change', () => {
  const data = clone();
  data.reviewed_partial_gates['2.3'][2].complete = false;
  const next = summarizeImplementationProgress(data);
  assert.equal(next.overall_progress_percent,76.34);
  assert.equal(next.accepted_items,13);
});

test('4.2 security gate cannot be promoted by report without a completed evidence receipt', () => {
  const data = clone();
  data.reviewed_partial_gates['4.2'][1].complete = false;
  const scored = summarizeImplementationProgress(data);
  assert.equal(scored.overall_progress_percent,76.67);
  assert.equal(scored.accepted_items,13);
});

test('new owner-cache milestone changes technical progress without crediting live acceptance', () => {
  const data = clone();
  data.reviewed_partial_gates['4.2'][3].complete = false;
  const scored = summarizeImplementationProgress(data);
  assert.equal(scored.overall_progress_percent,76.67);
  assert.equal(scored.accepted_items,13);
});

test('documented QA harness is technical progress, not real tenant isolation proof', () => {
  const data = clone();
  data.reviewed_partial_gates['4.2'][4].complete = false;
  const scored = summarizeImplementationProgress(data);
  assert.equal(scored.overall_progress_percent,76.67);
  assert.equal(scored.accepted_items,13);
});

test('disposable real-role SQL RLS milestone cannot be mistaken for live JWT acceptance', () => {
  const data=clone();
  data.reviewed_partial_gates['4.2'][5].complete=false;
  assert.equal(summarizeImplementationProgress(data).overall_progress_percent,76.67);
  assert.equal(summarizeImplementationProgress(data).accepted_items,13);
  assert.equal(data.reviewed_partial_gates['4.2'][6].complete,false);
});

test('all-volume archive SHA evidence is independent of missing historical Storage objects', () => {
  const data=clone();
  assert.equal(data.reviewed_partial_gates['6.2'][2].complete,true);
  assert.equal(data.reviewed_partial_gates['6.2'][3].complete,false);
  assert.equal(data.reviewed_partial_gates['6.2'][4].complete,false);
  assert.equal(data.reviewed_partial_gates['6.2'][5].complete,false);
  data.reviewed_partial_gates['6.2'][2].complete=false;
  assert.equal(summarizeImplementationProgress(data).overall_progress_percent,76.49);
  assert.equal(summarizeImplementationProgress(data).accepted_items,13);
});

test('financial historical proof is partial even with an audited provider transaction', () => {
  const data=clone();
  for (const id of ['2.1','2.2','5.3']) {
    assert.ok(data.remaining_ids.includes(id));
    assert.ok(data.reviewed_partial_gates[id].some(g=>g.complete));
    assert.ok(data.reviewed_partial_gates[id].some(g=>!g.complete));
  }
  data.reviewed_partial_gates['5.3'][2].complete=false;
  const next=summarizeImplementationProgress(data);
  assert.equal(next.overall_progress_percent,76.49);
  assert.equal(next.accepted_items,13);
});

test('legal draft and loopback probe do not count as reviewed contracts or actual capacity', () => {
 const data=clone();
 for(const id of ['6.3','6.4']){
  assert.ok(data.reviewed_partial_gates[id].some(g=>g.complete));
  assert.ok(data.reviewed_partial_gates[id].some(g=>!g.complete));
 }
 data.reviewed_partial_gates['6.3'][0].complete=false;
 assert.equal(summarizeImplementationProgress(data).overall_progress_percent,76.49);
 assert.equal(summarizeImplementationProgress(data).accepted_items,13);
});
test('legal signoff cannot be inferred from unapproved draft', () => {
 const data=clone();data.reviewed_partial_gates['6.4'][1].complete=false;
 assert.equal(summarizeImplementationProgress(data).overall_progress_percent,76.34);
});
test('Storage and commercial readiness milestones never imply physical approval or sales release', () => {
  const d=clone();
  for(const id of ['3.3','7.4']){
    assert.ok(d.reviewed_partial_gates[id].some(g=>g.complete));
    assert.ok(d.reviewed_partial_gates[id].some(g=>!g.complete));
    assert.ok(d.remaining_ids.includes(id));
  }
  d.reviewed_partial_gates['3.3'][2].complete=false;
  assert.equal(summarizeImplementationProgress(d).overall_progress_percent,76.49);
  assert.equal(summarizeImplementationProgress(d).accepted_items,13);
});
test('read-only DB snapshot is not equal to a validated Realtime capacity baseline', () => {
  const d=clone();
  assert.equal(d.reviewed_partial_gates['6.3'][1].complete,true);
  assert.equal(d.reviewed_partial_gates['6.3'][3].complete,false);
  d.reviewed_partial_gates['6.3'][1].complete=false;
  assert.equal(summarizeImplementationProgress(d).overall_progress_percent,76.49);
});

test('the unified percentage is the ONLY percentage field, and 100% requires 23 accepted items', () => {
  const result = summarizeImplementationProgress(clone());
  assert.deepEqual(Object.keys(result).filter(key => key.endsWith('_percent')), ['overall_progress_percent']);
  assert.equal(result.overall_progress_percent,77.21);
  const complete=clone();complete.official_acceptance.accepted_ids=[...complete.official_acceptance.accepted_ids,...complete.remaining_ids];
  complete.remaining_ids=[];
  complete.reviewed_partial_gates={};
  const done=summarizeImplementationProgress(complete);
  assert.equal(done.overall_progress_percent,100);
  assert.equal(done.accepted_items,23);
});

test('rejects duplicated accepted items, changed denominator and invented criteria', () => {
  const a = clone();a.official_acceptance.accepted_ids[0] = a.official_acceptance.accepted_ids[1];
  assert.throws(()=>summarizeImplementationProgress(a),/PROGRESS_SCOPE_MISMATCH/);
  const b = clone();b.denominator=24;
  assert.throws(()=>summarizeImplementationProgress(b),/PROGRESS_SCHEMA_INVALID/);
  const c = clone();c.remaining_ids[0]='9.9';
  assert.throws(()=>summarizeImplementationProgress(c),/PROGRESS_SCOPE_MISMATCH/);
});

test('rejects undocumented completed gates and scoring all gates without acceptance', () => {
  const a = clone(); delete a.reviewed_partial_gates['2.3'][0].evidence;
  assert.throws(()=>summarizeImplementationProgress(a),/PROGRESS_EVIDENCE_REQUIRED/);
  const b = clone();b.reviewed_partial_gates['2.3'].forEach(g=>{g.complete=true;g.evidence='https://example.test/check';});
  assert.throws(()=>summarizeImplementationProgress(b),/PROGRESS_UNACCEPTED_FULL_SCORE/);
});

test('rejects duplicate gates and attempting to re-score already accepted criterion', () => {
  const a = clone();a.reviewed_partial_gates['2.3'][0].id=a.reviewed_partial_gates['2.3'][1].id;
  assert.throws(()=>summarizeImplementationProgress(a),/PROGRESS_GATE_DUPLICATE/);
  const b = clone();b.reviewed_partial_gates['5.2']=structuredClone(b.reviewed_partial_gates['2.3']);
  assert.throws(()=>summarizeImplementationProgress(b),/PROGRESS_GATES_INVALID/);
});
