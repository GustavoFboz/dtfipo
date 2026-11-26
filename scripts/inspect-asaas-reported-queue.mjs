import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const endpoint = 'https://dtfipo.lovable.app/api/billing/asaas-worker?check=production-queue-alert';
const contract = 'dentalflow-production-queue-alert-v1';
const limit = 32_768;
class DiagnosticFailure extends Error {}
const fail = code => { throw new DiagnosticFailure(code); };
const integer = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Whitelist the server's operational metadata. Provider IDs, endpoints,
 * contacts and unknown fields are never copied into the Actions artifact. */
export function projectQueueDiagnostic(value) {
  if (!object(value) || value.available !== true || value.contract !== contract || value.environment !== 'production'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.checked_at)
    || !Number.isFinite(Date.parse(value.checked_at)) || typeof value.listing_complete !== 'boolean'
    || !integer(value.total_webhooks, 100) || value.delivery_logs_checked !== false
    || value.webhook_configuration_changed !== false || value.financial_processing_invoked !== false)
    fail('QUEUE_DIAGNOSTIC_CONTRACT_INVALID');
  const entries = list => {
    if (!Array.isArray(list) || list.length > value.total_webhooks) fail('QUEUE_DIAGNOSTIC_CONTRACT_INVALID');
    return list.map(row => {
      if (!object(row) || typeof row.enabled !== 'boolean' || typeof row.interrupted !== 'boolean'
        || typeof row.targets_dentalflow !== 'boolean' || !integer(row.api_version, 99) || row.api_version < 1
        || ![null, 'SEQUENTIALLY', 'NON_SEQUENTIALLY'].includes(row.send_type) || !integer(row.event_count, 300))
        fail('QUEUE_DIAGNOSTIC_CONTRACT_INVALID');
      return { enabled: row.enabled, interrupted: row.interrupted, targets_dentalflow: row.targets_dentalflow,
        api_version: row.api_version, send_type: row.send_type, event_count: row.event_count };
    });
  };
  const dentalflow = entries(value.dentalflow), reported = entries(value.reported_test_queue);
  if (dentalflow.some(row => !row.targets_dentalflow)
    || (reported.some(row => row.targets_dentalflow) && dentalflow.length === 0))
    fail('QUEUE_DIAGNOSTIC_CONTRACT_INVALID');
  const expected = !value.listing_complete ? 'incomplete_listing'
    : dentalflow.length > 1 || reported.length > 1 ? 'ambiguous'
      : reported.length === 0 ? 'reported_queue_not_found'
        : dentalflow.length === 0 ? 'dentalflow_queue_not_found'
          : reported[0].targets_dentalflow ? 'same_queue' : 'different_queue';
  if (value.correlation !== expected || (expected === 'same_queue'
    && JSON.stringify(dentalflow[0]) !== JSON.stringify(reported[0]))) fail('QUEUE_DIAGNOSTIC_CONTRACT_INVALID');
  return { available: true, contract, environment: 'production', checked_at: value.checked_at,
    listing_complete: value.listing_complete, total_webhooks: value.total_webhooks, correlation: expected,
    conclusion: expected === 'same_queue' ? 'reported_queue_targets_dentalflow'
      : expected === 'different_queue' ? 'reported_queue_targets_other_endpoint' : 'inconclusive',
    dentalflow, reported_test_queue: reported, delivery_logs_checked: false,
    webhook_configuration_changed: false, financial_processing_invoked: false };
}

async function boundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) fail('QUEUE_DIAGNOSTIC_BODY_INVALID');
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > limit) {
        await reader.cancel().catch(() => {});
        fail('QUEUE_DIAGNOSTIC_BODY_TOO_LARGE');
      }
      chunks.push(Buffer.from(next.value));
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { fail('QUEUE_DIAGNOSTIC_BODY_INVALID'); }
}

/** Explicit Production opt-in; one fixed GET, no redirect, retry, provider
 * API key, queue configuration write or financial worker invocation. */
export async function inspectReportedQueue(source = process.env, transport = fetch) {
  if (source.BILLING_ENVIRONMENT !== 'production' || source.BILLING_PRODUCTION_ENABLED !== 'true')
    fail('QUEUE_DIAGNOSTIC_PRODUCTION_REQUIRED');
  const token = source.BILLING_PRODUCTION_WORKER_TOKEN;
  if (typeof token !== 'string' || !/^[\x21-\x7e]{32,255}$/.test(token) || token.startsWith('$aact_'))
    fail('QUEUE_DIAGNOSTIC_CREDENTIAL_MISSING');
  try {
    const response = await transport(endpoint, { method: 'GET', redirect: 'manual', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'X-Billing-Environment': 'production' },
      signal: AbortSignal.timeout(12_000) });
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      fail(`QUEUE_DIAGNOSTIC_HTTP_${response.status}`);
    }
    return projectQueueDiagnostic(await boundedJson(response));
  } catch (error) {
    if (error instanceof DiagnosticFailure) throw error;
    fail('QUEUE_DIAGNOSTIC_TRANSPORT_FAILED');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result;
  try { result = await inspectReportedQueue(); }
  catch (error) {
    result = { available: false, code: error instanceof DiagnosticFailure ? error.message : 'QUEUE_DIAGNOSTIC_FAILED',
      financial_processing_invoked: false };
    process.exitCode = 1;
  }
  try {
    await writeFile('production-queue-alert.json', JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(result));
  } catch {
    console.error('QUEUE_DIAGNOSTIC_EVIDENCE_WRITE_FAILED');
    process.exitCode = 1;
  }
}
