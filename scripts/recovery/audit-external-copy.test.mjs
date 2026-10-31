import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { seal } from './archive.mjs';
import { auditCatalog, auditExternalCopy } from './audit-external-copy.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const obj = (name, size) => ({ bucket_id: 'fake-files', name, version: 'test-version', metadata: { size, eTag: 'fake' } });
const receipt = (row, bytes) => ({ bucket_id: row.bucket_id, name: row.name, source_version: row.version, bytes,
  sha256: sha(Buffer.from(row.name)), restore_verified: true });
function fixture() {
  const catalog = [obj('one/test.bin', 10), obj('two/test.bin', 15)], files = [receipt(catalog[0],10)];
  return { version: 1, source_objects: 2, complete: false, files_verified: 1, bytes_verified: 10,
    parts: [{part:1,files:1,bytes:8,sha256:sha(Buffer.from('fake zip')),closed:true}],
    source_catalog: catalog, files };
}

test('partial checkpoint counts missing files and bytes without object paths', () => {
  const output = auditCatalog(fixture());
  assert.equal(output.verified_objects, 1);
  assert.equal(output.missing_objects, 1);
  assert.equal(output.missing_bytes, 15);
  assert.equal(output.catalog_coverage_complete, false);
  assert.equal(output.operational_acceptance, false);
  assert.equal(JSON.stringify(output).includes('one/test.bin'), false);
});

test('index cannot claim completion, duplicate receipts or lost part counts', () => {
  const v = fixture(); v.complete = true;
  assert.throws(() => auditCatalog(v), /FALSE_COMPLETION/);
  v.complete = false; v.files.push(v.files[0]); v.files_verified = 2; v.bytes_verified = 20;
  assert.throws(() => auditCatalog(v), /DUPLICATE_RECEIPT/);
  v.files.pop(); v.files_verified = 1; v.bytes_verified = 10; v.parts[0].files = 2;
  assert.throws(() => auditCatalog(v), /PART_COUNT/);
});

test('catalog and saved receipts reject changes in source version or size', () => {
  const v = fixture(); v.files[0].source_version = 'modified';
  assert.throws(() => auditCatalog(v), /SOURCE_MISMATCH/);
  v.files[0].source_version = 'test-version'; v.source_catalog[0].metadata.size = 11;
  assert.throws(() => auditCatalog(v), /SOURCE_MISMATCH/);
});

test('encrypted index and one ZIP are authenticated without exposing paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dentalflow-checkpoint-'));
  try {
    const key = randomBytes(32), keyFile = join(root, 'key.bin'), indexFile = join(root, 'index.dfenc');
    const partsDirectory = join(root, 'parts'); await mkdir(partsDirectory);
    const zipData = Buffer.from('fake zip');
    await writeFile(keyFile, key, { mode: 0o600 });
    await writeFile(join(partsDirectory, 'DentalFlow_Anexos_2026-10-29_Parte_01.zip'), zipData);
    const index = fixture(); index.parts[0].bytes = zipData.length;
    await seal([Buffer.from(JSON.stringify(index))], indexFile, key, 'dentalflow-storage-index-20261029');
    const output = await auditExternalCopy({ indexFile, keyFile, partsDirectory });
    assert.equal(output.zip_archives_hash_verified, 1);
    assert.equal(output.missing_objects, 1);
    index.parts[0].sha256 = sha(Buffer.from('wrong'));
    const wrong = join(root, 'wrong.dfenc');
    await seal([Buffer.from(JSON.stringify(index))], wrong, key, 'dentalflow-storage-index-20261029');
    await assert.rejects(auditExternalCopy({ indexFile: wrong, keyFile, partsDirectory }), /ARCHIVE_MISMATCH/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
