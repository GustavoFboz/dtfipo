import { describe, expect, it } from 'vitest';
import { exerciseFixtureActivityReadPrivacy } from './fixture-activity-reads.server';
import type { FixtureSession } from './fixture-sessions.server';

const ownerId = 'ee083f63-1621-4b82-b7a4-fd13427c0b14';
const foreignId = '24e7cdf9-457e-4af2-b1cb-cf366abbddb0';
const jobId = '8a0cbd19-6b52-4db9-991b-66711337e61b';
const caseId = '72200000-0000-4000-8000-000000000012';
type Row = Record<string, any>;
type Fault = 'exposed' | 'invisible_insert' | 'foreign_update' | 'foreign_delete'
  | 'reassign' | 'master' | 'lost_response' | 'cleanup';

// Fault injection verifies that the runner detects a broken backend contract
// and bounds cleanup. Actual policy semantics run separately in restored SQL
// and with the published, unprivileged Auth fixtures.
function environment(fault?: Fault) {
  const activities = new Map<string, Row>(), receipts = new Map<string, Row>();
  const calls: Row[] = [];
  const result = (data: unknown, error: any = null) => ({ data: structuredClone(data), error });
  const denied = () => result(null, { code: '42501', message: 'RLS refused' });
  const client = (actor: string) => ({
    auth: { mfa: { getAuthenticatorAssuranceLevel: async () => result({ currentLevel: 'aal1' }) } },
    rpc: async (name: string, args: Row) => {
      calls.push({ actor, rpc: name, args });
      if (fault === 'master') return result({ unsafe: true });
      return result(null, { message: 'PLATFORM_MASTER_FORBIDDEN' });
    },
    from(table: string) {
      if (!['case_activity', 'case_activity_reads'].includes(table)) throw Error('Unexpected table');
      let op = 'select', values: Row | undefined, single = false;
      const filters: Row = {};
      const q: any = {
        insert(row: Row) { op = 'insert'; values = row; return q; },
        upsert(row: Row, options: Row) { op = 'upsert'; values = row; expect(options.onConflict).toBe('activity_id,user_id'); return q; },
        update(row: Row) { op = 'update'; values = row; return q; },
        delete() { op = 'delete'; return q; },
        select() { return q; }, eq(k: string, v: unknown) { filters[k] = v; return q; },
        single() { single = true; return q; },
        then(resolve: any, reject: any) { return Promise.resolve().then(() => {
          calls.push({ actor, table, op, values: values ? { ...values } : undefined, filters: { ...filters } });
          const rows = table === 'case_activity' ? activities : receipts;
          if (actor === foreignId && op === 'insert' && fault !== 'invisible_insert') return denied();
          if (op === 'update' && values?.user_id === foreignId && fault !== 'reassign') return denied();
          const matched = [...rows.values()].filter(row => Object.entries(filters).every(([k, v]) => row[k] === v));
          const visible = matched.filter(() => actor === ownerId || (table === 'case_activity_reads' && fault === 'exposed'));
          if (op === 'select') return single
            ? (visible[0] ? result(visible[0]) : result(null, { message: 'Missing row' })) : result(visible);
          if (op === 'insert') {
            const row: Row = { created_at: '2026-10-22T00:00:00Z', ...values };
            rows.set(row.id, row);
            if (fault === 'lost_response' && table === 'case_activity') throw Error('Response lost after commit');
            return result(single ? row : null);
          }
          if (op === 'upsert') {
            const row = [...rows.values()].find(row => row.activity_id === values?.activity_id && row.user_id === values?.user_id);
            if (!row) throw Error('Missing receipt');
            Object.assign(row, values); return result(row);
          }
          if (op === 'update') {
            if (actor === ownerId || fault === 'foreign_update') matched.forEach(row => Object.assign(row, values));
            return result(null);
          }
          if (op === 'delete') {
            if (fault === 'cleanup' && table === 'case_activity') return result(null, { message: 'Delete unavailable' });
            if (actor === ownerId || fault === 'foreign_delete') {
              for (const row of matched) {
                rows.delete(row.id);
                if (table === 'case_activity') for (const receipt of receipts.values())
                  if (receipt.activity_id === row.id) receipts.delete(receipt.id);
              }
            }
            return result(null);
          }
          throw Error('Unexpected operation');
        }).then(resolve, reject); },
      };
      return q;
    },
  });
  const fixture = { user_id: ownerId, client: client(ownerId) } as unknown as FixtureSession;
  const foreign = { user_id: foreignId, client: client(foreignId) } as unknown as FixtureSession;
  return { fixture, foreign, activities, receipts, calls };
}

describe('activity read privacy runner', () => {
  it('uses only the two USER clients, a non-notifying fixture activity and nonexistent replay target', async () => {
    const env = environment();
    env.activities.set('preexisting', { id: 'preexisting', case_id: 'other-case', user_id: ownerId });
    env.receipts.set('preexisting-read', { id: 'preexisting-read', activity_id: 'preexisting', user_id: ownerId });
    const checks = await exerciseFixtureActivityReadPrivacy(env.fixture, env.foreign, jobId, caseId);
    expect(checks).toHaveLength(14); expect(checks.every(c => c.passed)).toBe(true);
    expect([...env.activities.keys()]).toEqual(['preexisting']);
    expect([...env.receipts.keys()]).toEqual(['preexisting-read']);
    const created = env.calls.find(c => c.table === 'case_activity' && c.op === 'insert')!;
    expect(created.values).toMatchObject({ case_id: caseId, user_id: ownerId, kind: 'qa_read_boundary' });
    expect(created.values.mentions).toBeUndefined();
    expect(env.calls.find(c => c.rpc === 'platform_master_replay_asaas_event')?.args).toMatchObject({
      p_environment: 'sandbox', p_event_id: `qa-nonexistent-${jobId}`,
    });
    expect(env.calls.filter(c => c.table === 'case_activity' && c.op === 'delete')[0].filters)
      .toEqual({ id: created.values.id, case_id: caseId, user_id: ownerId });
  });
  it.each([
    ['exposed', 'foreign_receipt_not_visible'],
    ['invisible_insert', 'invisible_activity_receipt_denied'],
    ['foreign_update', 'foreign_receipt_update_preserved'],
    ['foreign_delete', 'activity_read_privacy_flow'],
    ['reassign', 'read_receipt_user_reassignment_denied'],
    ['master', 'non_operator_master_dashboard_denied'],
  ] as const)('detects the broken %s contract and removes only its disposable activity', async (fault, check) => {
    const env = environment(fault);
    const checks = await exerciseFixtureActivityReadPrivacy(env.fixture, env.foreign, jobId, caseId);
    expect(checks).toContainEqual(expect.objectContaining({ check, passed: false }));
    expect(env.activities.size).toBe(0); expect(env.receipts.size).toBe(0);
  });
  it('cleans an exact known UUID after the insert commits but its response is lost', async () => {
    const env = environment('lost_response');
    const checks = await exerciseFixtureActivityReadPrivacy(env.fixture, env.foreign, jobId, caseId);
    expect(checks).toContainEqual(expect.objectContaining({ check: 'activity_read_privacy_flow', passed: false }));
    expect(checks).toContainEqual({ check: 'activity_read_fixture_cleanup', passed: true });
    expect(env.activities.size).toBe(0);
  });
  it('does not claim cleanup when the API refuses deletion', async () => {
    const env = environment('cleanup');
    const checks = await exerciseFixtureActivityReadPrivacy(env.fixture, env.foreign, jobId, caseId);
    expect(checks).toContainEqual(expect.objectContaining({ check: 'activity_read_fixture_cleanup', passed: false }));
    expect(env.activities.size).toBe(1);
  });
});
