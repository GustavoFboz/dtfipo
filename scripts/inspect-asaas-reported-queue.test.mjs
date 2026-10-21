import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectReportedQueue, projectQueueDiagnostic } from './inspect-asaas-reported-queue.mjs';

const source = { BILLING_ENVIRONMENT: 'production', BILLING_PRODUCTION_ENABLED: 'true',
  BILLING_PRODUCTION_WORKER_TOKEN: 'fixture-production-worker-token-not-a-secret-0123456789' };
const own = { enabled: true, interrupted: false, targets_dentalflow: true,
  api_version: 3, send_type: 'SEQUENTIALLY', event_count: 13 };
const reported = { ...own, interrupted: true, targets_dentalflow: false };
const payload = { available: true, contract: 'dentalflow-production-queue-alert-v1', environment: 'production',
  checked_at: '2026-10-21T14:00:00Z', listing_complete: true, total_webhooks: 2,
  correlation: 'different_queue', dentalflow: [own], reported_test_queue: [reported],
  delivery_logs_checked: false, webhook_configuration_changed: false, financial_processing_invoked: false };
const success = async () => Response.json(payload);

test('rejects absent Production opt-in or credentials before network access', async () => {
  for (const override of [{ BILLING_ENVIRONMENT: 'sandbox' }, { BILLING_PRODUCTION_ENABLED: 'false' },
    { BILLING_PRODUCTION_WORKER_TOKEN: '' }, { BILLING_PRODUCTION_WORKER_TOKEN: 'x'.repeat(256) },
    { BILLING_PRODUCTION_WORKER_TOKEN: 'a'.repeat(40) + '\n' },
    { BILLING_PRODUCTION_WORKER_TOKEN: '$aact_prd_' + 'a'.repeat(40) }]) {
    let called = false;
    await assert.rejects(inspectReportedQueue({ ...source, ...override }, async () => { called = true; return success(); }));
    assert.equal(called, false);
  }
});

test('uses only the fixed authenticated GET and never follows redirects', async () => {
  let calls = 0;
  const result = await inspectReportedQueue({ ...source, URL: 'https://untrusted.invalid' }, async (url, init) => {
    calls++;
    assert.equal(url, 'https://dtfipo.lovable.app/api/billing/asaas-worker?check=production-queue-alert');
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'manual'); assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.Authorization, `Bearer ${source.BILLING_PRODUCTION_WORKER_TOKEN}`);
    assert.equal(init.headers['X-Billing-Environment'], 'production'); assert(init.signal instanceof AbortSignal);
    return success();
  });
  assert.equal(calls, 1); assert.equal(result.conclusion, 'reported_queue_targets_other_endpoint');
  assert.equal(result.reported_test_queue[0].interrupted, true);
});

test('omits provider identifiers, endpoints, contacts and unknown fields', () => {
  const privateValue = 'PRIVATE_PROVIDER_DATA';
  const result = projectQueueDiagnostic({ ...payload, token: privateValue,
    dentalflow: [{ ...own, id: privateValue, url: privateValue }],
    reported_test_queue: [{ ...reported, email: privateValue, name: privateValue }] });
  assert(!JSON.stringify(result).includes(privateValue));
});

test('identifies the same queue only with matching metadata', () => {
  const result = projectQueueDiagnostic({ ...payload, total_webhooks: 1, correlation: 'same_queue', reported_test_queue: [own] });
  assert.equal(result.conclusion, 'reported_queue_targets_dentalflow');
  assert.throws(() => projectQueueDiagnostic({ ...payload, correlation: 'same_queue' }));
  assert.throws(() => projectQueueDiagnostic({ ...payload, correlation: 'same_queue', reported_test_queue: [{ ...own, interrupted: true }] }));
});

test('incomplete, absent and ambiguous configurations remain inconclusive', () => {
  for (const fields of [
    { listing_complete: false, correlation: 'incomplete_listing' },
    { reported_test_queue: [], correlation: 'reported_queue_not_found' },
    { dentalflow: [], correlation: 'dentalflow_queue_not_found' },
    { dentalflow: [own, own], correlation: 'ambiguous' },
  ]) assert.equal(projectQueueDiagnostic({ ...payload, ...fields }).conclusion, 'inconclusive');
});

test('rejects unsafe contracts and inconsistent metadata without copying provider data', () => {
  for (const fields of [
    { contract: 'old-health-contract' }, { environment: 'sandbox' }, { checked_at: 'PRIVATE_PROVIDER_DATA' },
    { available: false }, { financial_processing_invoked: true }, { delivery_logs_checked: true },
    { webhook_configuration_changed: true }, { total_webhooks: 0 }, { listing_complete: 'true' },
    { correlation: 'PRIVATE_PROVIDER_DATA' }, { dentalflow: [reported] },
    { dentalflow: [{ ...own, send_type: 'PRIVATE_PROVIDER_DATA' }] },
    { dentalflow: [{ ...own, event_count: -1 }] }, { dentalflow: [{ ...own, api_version: 0 }] },
  ]) assert.throws(() => projectQueueDiagnostic({ ...payload, ...fields }), /^Error: QUEUE_DIAGNOSTIC_CONTRACT_INVALID$/);
  for (const value of [null, [], 'PRIVATE_PROVIDER_DATA']) assert.throws(() => projectQueueDiagnostic(value));
});

test('HTTP failures and redirects make one attempt and never expose their bodies', async () => {
  for (const status of [302, 401, 403, 404, 502, 503]) {
    let calls = 0;
    await assert.rejects(inspectReportedQueue(source, async () => {
      calls++; return new Response('PRIVATE_PROVIDER_DATA', { status, headers: { Location: 'https://untrusted.invalid' } });
    }), new RegExp(`^Error: QUEUE_DIAGNOSTIC_HTTP_${status}$`));
    assert.equal(calls, 1);
  }
});

test('invalid and oversized bodies fail with safe codes', async () => {
  await assert.rejects(inspectReportedQueue(source, async () => new Response('PRIVATE_PROVIDER_DATA')),
    /^Error: QUEUE_DIAGNOSTIC_BODY_INVALID$/);
  await assert.rejects(inspectReportedQueue(source, async () => new Response('x'.repeat(32_769))),
    /^Error: QUEUE_DIAGNOSTIC_BODY_TOO_LARGE$/);
});

test('network errors return no raw URLs or credentials', async () => {
  await assert.rejects(inspectReportedQueue(source, async () => { throw new Error('PRIVATE_PROVIDER_DATA'); }),
    /^Error: QUEUE_DIAGNOSTIC_TRANSPORT_FAILED$/);
});
