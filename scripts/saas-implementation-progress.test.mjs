import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { summarizeImplementationProgress } from './saas-implementation-progress.mjs';

const original = JSON.parse(readFileSync('docs/saas/IMPLEMENTATION-PROGRESS.json','utf8'));
const clone = () => structuredClone(original);

test('formal acceptance stays at 13/23 while independently verified engineering gates move', () => {
  const result = summarizeImplementationProgress(clone());
  assert.equal(result.accepted_items,13);
  assert.equal(result.remaining_items,10);
  assert.equal(result.official_acceptance_percent,56.52);
  assert.equal(result.engineering_evidence_percent,60.87);
  assert.equal(result.verified_partial_gate_points,1);
  assert.deepEqual(result.reviewed_partial_items,['2.3','6.2']);
  assert.equal(result.unreviewed_remaining_items.length,8);
});

test('technical score changes with documented gate but formal count cannot change', () => {
  const data = clone();
  data.reviewed_partial_gates['2.3'][2].complete = false;
  const next = summarizeImplementationProgress(data);
  assert.equal(next.engineering_evidence_percent,60);
  assert.equal(next.official_acceptance_percent,56.52);
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
