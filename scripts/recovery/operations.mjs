import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { collect, digest, fail, lines, seal, unseal } from './archive.mjs';
import { assertStorageConsistent, assertTargetGuard, assertTargetUrl, connect, identifier, inventory,
  objectDigest, objects, relation, schemaDigest, sequenceStates, tableChunks, tableDigest, transaction, validateForeignKeys } from './database.mjs';
import { objectPath } from './storage.mjs';

const contract = 'dentalflow-operational-recovery-v1';
const entryName = index => `entry-${String(index).padStart(6, '0')}.enc`;
function assertEqual(actual, expected) {
  if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) fail('RECOVERY_INTEGRITY_MISMATCH');
}
const tableKey = t => `${t.schema}.${t.name}`;

export async function backup({ sourceUrl, output, key, readObject, restoreSql, intervalMs = 250, revision = 'unrecorded' }) {
  if (!Number.isInteger(intervalMs) || intervalMs < 0 || intervalMs > 10_000) fail('RECOVERY_INTERVAL_INVALID');
  const sql = connect(sourceUrl);
  let created = false;
  try {
    await mkdir(output, { mode: 0o700 }); created = true;
    const manifest = { contract, created_at: new Date().toISOString(), revision, entries: [], tables: [], objects: [],
      // Recovery is offline. Secrets, extension jobs and external platform
      // settings are deliberately not transferred or activated by this tool.
      excluded: ['vault', 'cron', 'net', 'external-secrets-and-service-settings'] };
    await transaction(sql, 'isolation level repeatable read read only', async tx => {
      await assertStorageConsistent(tx);
      manifest.tables = await inventory(tx);
      manifest.schema_sha256 = schemaDigest(manifest.tables);
      manifest.objects = await objects(tx);
      for (const object of manifest.objects) {
        objectPath('/recovery', object.bucket, object.name);
        if (!/^\d+$/.test(object.size ?? '') || !Number.isSafeInteger(Number(object.size))) fail('RECOVERY_OBJECT_SIZE_INVALID');
      }
      manifest.sequences = await sequenceStates(tx);
      for (const table of manifest.tables) {
        const name = entryName(manifest.entries.length); let rows = 0;
        async function* source() { for await (const chunk of tableChunks(tx, table)) { rows++; yield chunk; } }
        const result = await seal(source(), join(output, name), key, name);
        manifest.entries.push({ name, kind: 'table', table: tableKey(table), rows, ...result });
      }
    });
    const schemaName = entryName(manifest.entries.length);
    const schema = await seal(createReadStream(restoreSql), join(output, schemaName), key, schemaName);
    manifest.entries.push({ name: schemaName, kind: 'schema', ...schema });
    for (let index = 0; index < manifest.objects.length; index++) {
      const object = manifest.objects[index], name = entryName(manifest.entries.length);
      const result = await seal(await readObject(object), join(output, name), key, name);
      if (result.bytes !== Number(object.size)) fail('RECOVERY_OBJECT_SIZE_MISMATCH');
      manifest.entries.push({ name, kind: 'object', object: index, ...result });
      if (intervalMs) await pause(intervalMs);
    }
    // New transaction, not the old MVCC snapshot: detect deleted, replaced or
    // added files while bytes were copied. An unstable copy is never complete.
    await assertStorageConsistent(sql);
    if (objectDigest(await objects(sql)) !== objectDigest(manifest.objects)) fail('RECOVERY_SOURCE_OBJECTS_CHANGED');
    manifest.completed_at = new Date().toISOString();
    await seal([Buffer.from(JSON.stringify(manifest))], join(output, 'manifest.enc.partial'), key, 'manifest.enc');
    await rename(join(output, 'manifest.enc.partial'), join(output, 'manifest.enc'));
    return summary(manifest);
  } catch (error) {
    if (created) await rm(output, { recursive: true, force: true });
    throw error;
  } finally { await sql.end({ timeout: 5 }); }
}

export async function readManifest(input, key) {
  const value = JSON.parse(await collect(unseal(join(input, 'manifest.enc'), key, 'manifest.enc')));
  if (value.contract !== contract || !value.completed_at || !Array.isArray(value.entries)
    || !Array.isArray(value.tables) || !Array.isArray(value.objects) || !Array.isArray(value.sequences)
    || schemaDigest(value.tables) !== value.schema_sha256) fail('RECOVERY_MANIFEST_INVALID');
  const names = new Set(), tableNames = new Set(), objectIds = new Set(); let schemas = 0;
  for (const entry of value.entries) {
    if (!/^entry-\d{6}\.enc$/.test(entry.name) || names.has(entry.name)
      || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) fail('RECOVERY_MANIFEST_INVALID');
    names.add(entry.name);
    if (entry.kind === 'table') {
      if (tableNames.has(entry.table) || !value.tables.some(t => tableKey(t) === entry.table)
        || !Number.isSafeInteger(entry.rows) || entry.rows < 0) fail('RECOVERY_MANIFEST_INVALID');
      tableNames.add(entry.table);
    } else if (entry.kind === 'object') {
      if (!Number.isSafeInteger(entry.object) || !value.objects[entry.object] || objectIds.has(entry.object)
        || Number(value.objects[entry.object].size) !== entry.bytes) fail('RECOVERY_MANIFEST_INVALID');
      objectIds.add(entry.object);
    } else if (entry.kind === 'schema') { schemas++; }
    else fail('RECOVERY_MANIFEST_INVALID');
  }
  if (schemas !== 1 || tableNames.size !== value.tables.length || objectIds.size !== value.objects.length) fail('RECOVERY_MANIFEST_INCOMPLETE');
  for (const t of value.tables) {
    if (!['public','auth','storage','supabase_migrations'].includes(t.schema) || typeof t.name !== 'string') fail('RECOVERY_MANIFEST_INVALID');
  }
  for (const object of value.objects) objectPath('/recovery', object.bucket, object.name);
  return value;
}

export async function verify({ input, key }) {
  const manifest = await readManifest(input, key);
  for (const entry of manifest.entries) assertEqual(await digest(unseal(join(input, entry.name), key, entry.name)), entry);
  return summary(manifest);
}

// Restores data into a pre-provisioned local Supabase PostgreSQL database and
// all object bytes into a new private offline file vault. It does not connect
// an app, issue signed URLs, start Auth or replay billing events.
export async function restore({ input, key, targetUrl, guardToken, filesOutput, restoreSql, beforeValidate, onProgress }) {
  assertTargetUrl(targetUrl);
  const manifest = await readManifest(input, key);
  const expectedSchema = manifest.entries.find(e => e.kind === 'schema');
  assertEqual(await digest(createReadStream(restoreSql)), expectedSchema);
  // Authenticate ALL entries before contacting or changing the destination.
  await verify({ input, key });
  onProgress?.('archive_authenticated');
  const sql = connect(targetUrl, false); let created = false, committed = false;
  const staging = resolve(filesOutput);
  try {
    await mkdir(staging, { mode: 0o700 }); created = true;
    // Only the newly created destination can be removed on failure. Existing
    // directories are refused, never merged, overwritten or cleaned up.
    for (const entry of manifest.entries.filter(e => e.kind === 'object')) {
      const object = manifest.objects[entry.object], path = objectPath(staging, object.bucket, object.name);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const file = await open(path, 'wx', 0o600);
      try { for await (const chunk of unseal(join(input, entry.name), key, entry.name)) await file.writeFile(chunk); await file.sync(); }
      finally { await file.close(); }
      assertEqual(await digest(createReadStream(path)), entry);
    }
    const result = await transaction(sql, '', async tx => {
      await assertTargetGuard(tx, guardToken);
      onProgress?.('destination_guard_verified');
      const targetTables = await inventory(tx);
      if (schemaDigest(targetTables) !== manifest.schema_sha256) fail('RECOVERY_TARGET_SCHEMA_MISMATCH');
      const targetSequences = await sequenceStates(tx);
      if (JSON.stringify(targetSequences.map(({ next, ...s }) => s)) !== JSON.stringify(manifest.sequences.map(({ next, ...s }) => s))) fail('RECOVERY_TARGET_SEQUENCE_MISMATCH');
      await tx.unsafe('SET LOCAL session_replication_role = replica');
      await tx.unsafe(`TRUNCATE ${manifest.tables.map(relation).join(',')} RESTART IDENTITY`);
      onProgress?.('destination_tables_truncated');
      for (const table of manifest.tables) {
        const entry = manifest.entries.find(e => e.kind === 'table' && e.table === tableKey(table));
        const columns = table.columns.filter(c => !c.generated).map(c => identifier(c.name)).join(',');
        let batch = [], rowCount = 0;
        const flush = async () => {
          if (!batch.length) return;
          await tx.unsafe(`INSERT INTO ${relation(table)} (${columns}) OVERRIDING SYSTEM VALUE
            SELECT ${columns} FROM jsonb_populate_recordset(NULL::${relation(table)},$1::text::jsonb)`, ['[' + batch.join(',') + ']']);
          batch = [];
        };
        for await (const line of lines(unseal(join(input, entry.name), key, entry.name))) {
          batch.push(line); rowCount++;
          if (batch.length === 128) await flush();
        }
        await flush();
        if (rowCount !== entry.rows) fail('RECOVERY_TABLE_ROW_COUNT_MISMATCH');
      }
      onProgress?.('all_rows_inserted');
      // A failed process or validation rolls back TRUNCATE, INSERT and the
      // transactional sequence RESTART together. setval() is not used here.
      for (const seq of manifest.sequences) {
        if (!/^-?\d+$/.test(seq.next)) fail('RECOVERY_SEQUENCE_INVALID');
        await tx.unsafe(`ALTER SEQUENCE ${relation(seq)} RESTART WITH ${seq.next}`);
      }
      onProgress?.('sequences_restarted');
      if (beforeValidate) await beforeValidate(tx); // Only imported by the isolated CI drill; no CLI flag.
      const foreignKeys = await validateForeignKeys(tx, targetTables);
      onProgress?.('foreign_keys_validated');
      for (const table of targetTables) {
        const entry = manifest.entries.find(e => e.kind === 'table' && e.table === tableKey(table));
        const actual = await tableDigest(tx, table);
        assertEqual(actual, entry);
        if (actual.rows !== entry.rows) fail('RECOVERY_TABLE_ROW_COUNT_MISMATCH');
      }
      await assertStorageConsistent(tx);
      onProgress?.('database_integrity_verified');
      await tx.unsafe('SET LOCAL session_replication_role = origin');
      await tx`UPDATE recovery_guard.destination SET mode='restored-offline-no-runtime' WHERE singleton=true`;
      return { ...summary(manifest), foreign_keys_validated: foreignKeys, restored_at: new Date().toISOString(),
        target: 'isolated-local-postgres-and-offline-file-vault', external_jobs_activated: false };
    });
    committed = true;
    onProgress?.('database_committed');
    await open(join(staging, 'RECOVERY-VERIFIED.json'), 'wx', 0o600).then(async file => {
      try { await file.writeFile(JSON.stringify(result, null, 2) + '\n'); } finally { await file.close(); }
    });
    return result;
  } catch (error) {
    if (created && !committed) await rm(staging, { recursive: true, force: true });
    if (committed) fail('RECOVERY_COMMITTED_RECEIPT_WRITE_FAILED');
    throw error;
  } finally { await sql.end({ timeout: 5 }); }
}

function summary(manifest) {
  return { contract, created_at: manifest.created_at, completed_at: manifest.completed_at, revision: manifest.revision,
    tables: manifest.tables.length, rows: manifest.entries.filter(e => e.kind === 'table').reduce((n, e) => n + e.rows, 0),
    objects: manifest.objects.length, object_bytes: manifest.entries.filter(e => e.kind === 'object').reduce((n, e) => n + e.bytes, 0),
    schema_sha256: manifest.schema_sha256, financial_and_clinical_tables_included: true,
    encrypted: 'AES-256-GCM', external_service_settings_restored: false };
}
