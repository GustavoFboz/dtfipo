import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const EXPECTED_CRITERIA = Object.freeze([
  '1.1','1.2','1.3','2.1','2.2','2.3','3.1','3.2','3.3',
  '4.1','4.2','4.3','5.1','5.2','5.3','6.1','6.2','6.3','6.4',
  '7.1','7.2','7.3','7.4',
]);
const unique = list => new Set(list).size === list.length;
const percent = value => Math.round(value * 10000) / 100;

export function summarizeImplementationProgress(ledger) {
  if (!ledger || ledger.schema !== 'dentalflow-saas-implementation-evidence-v1'
    || ledger.denominator !== EXPECTED_CRITERIA.length) throw new Error('PROGRESS_SCHEMA_INVALID');
  const accepted = ledger.official_acceptance?.accepted_ids;
  const remaining = ledger.remaining_ids;
  const partial = ledger.reviewed_partial_gates;
  if (!Array.isArray(accepted) || !Array.isArray(remaining) || !partial
    || Array.isArray(partial) || typeof partial !== 'object') throw new Error('PROGRESS_ITEMS_INVALID');
  const combined = [...accepted, ...remaining];
  if (combined.length !== EXPECTED_CRITERIA.length || !unique(combined)
    || EXPECTED_CRITERIA.some(id => !combined.includes(id))) throw new Error('PROGRESS_SCOPE_MISMATCH');
  let partialPoints = 0;
  for (const [criterion, gates] of Object.entries(partial)) {
    if (!remaining.includes(criterion) || !Array.isArray(gates) || gates.length < 2 || gates.length > 20)
      throw new Error('PROGRESS_GATES_INVALID');
    const ids = gates.map(g => g?.id);
    if (!ids.every(x => typeof x === 'string' && /^[a-z0-9-]+$/.test(x)) || !unique(ids))
      throw new Error('PROGRESS_GATE_DUPLICATE');
    let completed = 0;
    for (const gate of gates) {
      if (typeof gate.complete !== 'boolean' || typeof gate.description !== 'string' || !gate.description.trim())
        throw new Error('PROGRESS_GATE_INVALID');
      if (gate.complete) {
        if (typeof gate.evidence !== 'string' || !gate.evidence.trim()) throw new Error('PROGRESS_EVIDENCE_REQUIRED');
        completed++;
      }
    }
    // Formal acceptance is always the only way to score the last point.
    if (completed === gates.length) throw new Error('PROGRESS_UNACCEPTED_FULL_SCORE');
    partialPoints += completed / gates.length;
  }
  const acceptance = accepted.length / ledger.denominator;
  const technical = (accepted.length + partialPoints) / ledger.denominator;
  return {
    methodology: 'conservative-evidence-floor',
    accepted_items: accepted.length,
    total_items: ledger.denominator,
    remaining_items: remaining.length,
    official_acceptance_percent: percent(acceptance),
    engineering_evidence_percent: percent(technical),
    accepted_points: accepted.length,
    verified_partial_gate_points: Number(partialPoints.toFixed(6)),
    reviewed_partial_items: Object.keys(partial).sort(),
    unreviewed_remaining_items: remaining.filter(id => !(id in partial)),
    note: 'Technical evidence is not sales readiness, physical-device approval or formal acceptance; unreviewed items are not counted.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const ledger = JSON.parse(readFileSync(process.argv[2] ?? 'docs/saas/IMPLEMENTATION-PROGRESS.json', 'utf8'));
    process.stdout.write(JSON.stringify(summarizeImplementationProgress(ledger), null, 2) + '\n');
  } catch {
    // Keep status output deterministic, with no raw data or user paths in logs.
    console.error('PROGRESS_VALIDATION_FAILED');
    process.exitCode = 1;
  }
}
