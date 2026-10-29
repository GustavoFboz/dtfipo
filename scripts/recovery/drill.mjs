import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { digest, sha256 } from './archive.mjs';
import { backup, readManifest, restore, verify } from './operations.mjs';
import { assertTargetUrl, connect, inventory, schemaDigest, sequenceStates, tableDigest } from './database.mjs';
import { filesystemSource, objectPath } from './storage.mjs';

const sourceUrl = process.env.DENTALFLOW_RECOVERY_SOURCE_DB_URL;
const targetUrl = process.env.DENTALFLOW_RECOVERY_TARGET_DB_URL;
if (!sourceUrl || !targetUrl) throw new Error('RECOVERY_DRILL_DATABASES_REQUIRED');
assertTargetUrl(targetUrl);
const sourceAddress = new URL(sourceUrl);
if (sourceAddress.hostname !== '127.0.0.1' || sourceAddress.port !== '54324'
  || sourceAddress.pathname !== '/postgres' || sourceAddress.search
  || process.env.GITHUB_ACTIONS !== 'true') throw new Error('RECOVERY_DRILL_CI_ONLY');
const root = await mkdtemp(join(tmpdir(), 'dentalflow-operational-recovery-'));
const source = connect(sourceUrl, false), target = connect(targetUrl, false);
const checks = [];
const record = name => { checks.push({ check: name, passed: true }); console.log('RECOVERY_CHECK_PASSED', name); };
const onProgress = stage => console.log('RECOVERY_RESTORE_PHASE', stage);
const key = randomBytes(32), guardToken = randomBytes(32).toString('hex');
const schema = 'public/restore.sql', bundle = join(root, 'encrypted-backup');
const sourceFiles = join(root, 'source-files'), output = join(root, 'restored-files');
const started = Date.now();

async function databaseHash(sql) {
  const values = [];
  for (const t of await inventory(sql)) values.push({ schema: t.schema, name: t.name, ...await tableDigest(sql, t) });
  return schemaDigest(values);
}

try {
  const [allowed] = await source`SELECT purpose FROM recovery_guard.disposable_source WHERE singleton=true`;
  const [empty] = await source`SELECT (SELECT count(*) FROM auth.users)::int AS users,(SELECT count(*) FROM public.patients)::int AS patients,
    (SELECT count(*) FROM public.cases)::int AS cases,(SELECT count(*) FROM public.account_subscriptions)::int AS subscriptions`;
  if (allowed?.purpose !== 'synthetic-ci-only' || Object.values(empty).some(n => n !== 0)) throw new Error('RECOVERY_DRILL_SOURCE_NOT_DISPOSABLE');
  await source.unsafe(await readFile('docs/saas/sql/operational-recovery-fixture.sql', 'utf8'));
  await target.unsafe(`CREATE TABLE public.recovery_bigint_sentinel(id bigint PRIMARY KEY,amount bigint NOT NULL,doubled numeric GENERATED ALWAYS AS (amount::numeric*2) STORED)`);
  await target.unsafe(`CREATE SCHEMA recovery_guard; CREATE TABLE recovery_guard.destination(singleton boolean PRIMARY KEY CHECK(singleton),mode text NOT NULL,token_hash text NOT NULL)`);
  await target`INSERT INTO recovery_guard.destination VALUES(true,'isolated-offline-no-runtime',${sha256(guardToken)})`;
  const payloads = [Buffer.from('arquivo descartável de recuperação 🦷\n'), randomBytes(2 * 1024 * 1024 + 13), Buffer.alloc(0)];
  for (let index = 0; index < payloads.length; index++) {
    const name = `92900000-0000-4000-8000-000000000001/recovery-${index}.bin`;
    const path = objectPath(sourceFiles, 'avatars', name);
    await mkdir(join(sourceFiles, 'avatars', '92900000-0000-4000-8000-000000000001'), { recursive: true, mode: 0o700 });
    await writeFile(path, payloads[index], { mode: 0o600 });
    await source`INSERT INTO storage.buckets(id,name,public) VALUES('avatars','avatars',false) ON CONFLICT(id) DO NOTHING`;
    await source`INSERT INTO storage.objects(bucket_id,name,metadata,owner_id) VALUES('avatars',${name},
      ${JSON.stringify({ size: payloads[index].length, mimetype: 'application/octet-stream' })}::text::jsonb,'92900000-0000-4000-8000-000000000001')`;
    await source`INSERT INTO public.storage_files(clinic_id,bucket,object_path,source_type,original_name,size_bytes,status,uploaded_by)
      VALUES('92900000-0000-4000-8000-000000000010','avatars',${name},'user_avatar',${`recovery-${index}.bin`},${payloads[index].length},'ready','92900000-0000-4000-8000-000000000001')`;
  }
  const sourceBefore = await databaseHash(source), targetBefore = await databaseHash(target);
  const originalSequences = await sequenceStates(target);
  const backupReceipt = await backup({ sourceUrl, output: bundle, key, readObject: filesystemSource(sourceFiles), restoreSql: schema,
    intervalMs: 0, revision: process.env.GITHUB_SHA ?? 'local-isolated-drill' });
  assert.equal(sourceBefore, await databaseHash(source)); record('backup_did_not_mutate_source_database');
  assert.equal((await stat(bundle)).mode & 0o777, 0o700); record('encrypted_bundle_has_private_permissions');
  assert.equal((await verify({ input: bundle, key })).objects, 3); record('all_encrypted_entries_authenticated');
  const manifest = await readManifest(bundle, key);
  assert(manifest.tables.some(t => t.name === 'billing_plan_periods'));
  assert(manifest.tables.some(t => t.name === 'billing_cancel_executions'));
  assert(manifest.tables.some(t => t.name === 'billing_payments'));
  assert(manifest.tables.some(t => t.name === 'patients'));
  record('clinical_financial_auth_and_storage_records_included');
  await assert.rejects(restore({ input: bundle, key, targetUrl, guardToken: '0'.repeat(64), filesOutput: join(root, 'wrong-guard'), restoreSql: schema }), /GUARD_MISMATCH/);
  assert.equal(targetBefore, await databaseHash(target)); record('incorrect_guard_did_not_change_destination');
  // Cause a real validation failure after TRUNCATE and all table inserts.
  await assert.rejects(restore({ input: bundle, key, targetUrl, guardToken, filesOutput: join(root, 'failed-files'), restoreSql: schema,
    onProgress,
    beforeValidate: tx => tx`UPDATE public.cases SET patient_id='92900000-0000-4000-8000-000000000099' WHERE id='92900000-0000-4000-8000-000000000012'` }), /FOREIGN_KEY_BROKEN/);
  assert.equal(targetBefore, await databaseHash(target));
  assert.deepEqual(await sequenceStates(target), originalSequences);
  await assert.rejects(stat(join(root, 'failed-files')), { code: 'ENOENT' });
  record('failed_restore_rolled_back_database_and_removed_only_its_staged_files');
  // A real disconnected backend must fail closed without resuming inserts or
  // sending ROLLBACK on a dead connection. The server rolls back this session.
  await assert.rejects(restore({ input: bundle, key, targetUrl, guardToken, filesOutput: join(root, 'disconnected-files'), restoreSql: schema, onProgress,
    beforeValidate: async tx => {
      const [{ pid }] = await tx`SELECT pg_backend_pid() AS pid`;
      await target`SELECT pg_terminate_backend(${pid})`;
      await tx`SELECT 1`;
    } }));
  assert.equal(targetBefore, await databaseHash(target));
  assert.deepEqual(await sequenceStates(target), originalSequences);
  await assert.rejects(stat(join(root, 'disconnected-files')), { code: 'ENOENT' });
  record('terminated_backend_rolled_back_without_reconnecting_or_partial_recovery');
  const restoreReceipt = await restore({ input: bundle, key, targetUrl, guardToken, filesOutput: output, restoreSql: schema, onProgress });
  assert.equal(await databaseHash(target), sourceBefore); record('all_table_counts_and_sha256_match_source');
  assert.deepEqual(await sequenceStates(target), manifest.sequences); record('sequence_next_values_preserved');
  for (const entry of manifest.entries.filter(e => e.kind === 'object')) {
    const object = manifest.objects[entry.object];
    assert.deepEqual(await digest(createReadStream(objectPath(output, object.bucket, object.name))), { bytes: entry.bytes, sha256: entry.sha256 });
  }
  record('every_restored_binary_size_and_sha256_match');
  const [precise] = await target`SELECT id::text,amount::text,doubled::text FROM public.recovery_bigint_sentinel`;
  assert.deepEqual(precise, { id: '9007199254740993123', amount: '9007199254740993123', doubled: '18014398509481986246' });
  record('bigint_and_generated_values_preserved_exactly');
  const [financial] = await target`SELECT count(*)::int AS payments,sum(amount_cents)::int AS cents FROM public.billing_payments WHERE id IN('92900000-0000-4000-8000-000000000031','92900000-0000-4000-8000-000000000041')`;
  assert.deepEqual(financial, { payments: 2, cents: 45400 }); record('paid_history_and_contracts_preserved');
  const [scheduled] = await target`SELECT s.plan_code,s.status,p.state,p.amount_cents,
    public.billing_subscription_contract_amount(s.id) AS current_cents,
    public.billing_subscription_provider_amount(s.id) AS future_cents,p.activated_at IS NULL AS not_activated
    FROM public.account_subscriptions s JOIN public.billing_plan_periods p ON p.subscription_id=s.id
    WHERE s.id='92900000-0000-4000-8000-000000000030'`;
  assert.deepEqual(scheduled, { plan_code: 'company_growth', status: 'active', state: 'scheduled', amount_cents: 500,
    current_cents: 44900, future_cents: 500, not_activated: true });
  record('future_plan_price_preserved_without_early_activation');
  await assert.rejects(restore({ input: bundle, key, targetUrl, guardToken, filesOutput: join(root, 'second-restore'), restoreSql: schema }), /GUARD_MISMATCH/);
  record('repeat_restore_into_used_destination_denied');
  const badEntry = manifest.entries.find(e => e.kind === 'object');
  const bytes = await readFile(join(bundle, badEntry.name)); bytes[22] ^= 1; await writeFile(join(bundle, badEntry.name), bytes);
  await assert.rejects(verify({ input: bundle, key }), /AUTHENTICATION_FAILED/); record('damaged_archive_rejected');
  assert.equal(await databaseHash(source), sourceBefore); record('source_unchanged_after_incident_and_recovery');
  const receipt = { contract: 'dentalflow-operational-recovery-drill-v1', passed: true, checked_at: new Date().toISOString(),
    revision: process.env.GITHUB_SHA ?? null, run_id: process.env.GITHUB_RUN_ID ?? null,
    environment: 'two-disposable-local-supabase-databases-and-real-filesystem',
    cloud_data_exported: false, cloud_storage_api_tested: false, real_asaas_api_called: false,
    production_recovery_accepted: false, duration_ms: Date.now() - started,
    backup: backupReceipt, restore: restoreReceipt, checks };
  await writeFile('operational-recovery-drill.json', JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await source.end({ timeout: 5 }); await target.end({ timeout: 5 });
  await rm(root, { recursive: true, force: true });
}
