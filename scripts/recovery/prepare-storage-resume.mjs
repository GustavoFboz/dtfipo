/**
 * Prepare an encrypted, resumable private worklist of historical Storage
 * objects missing from an authenticated checkpoint. No HTTP requests, object
 * downloads, keys, patient names or raw paths appear in stdout.
 *
 * node scripts/recovery/prepare-storage-resume.mjs INDEX.dfenc KEY.bin OUTPUT.dfenc
 */
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readKey, unseal, collect, seal, fail } from './archive.mjs';
import { auditCatalog } from './audit-external-copy.mjs';

const SOURCE_AAD = 'dentalflow-storage-index-20261029';
export const RESUME_AAD = 'dentalflow-storage-resume-20261029';
const rowKey = v => [v.bucket_id, v.name, v.version ?? v.source_version ?? ''].join('\u001f');

export function prepareStorageResume(index, batchSize = 4) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 4)
    fail('RECOVERY_RESUME_BATCH_LIMIT');
  const summary = auditCatalog(index);
  const received = new Set(index.files.map(rowKey));
  const missing = index.source_catalog.filter(row => !received.has(rowKey(row)));
  if (missing.length !== summary.missing_objects) fail('RECOVERY_RESUME_COVERAGE_MISMATCH');
  const batches = [];
  // Keep the authenticated source order to avoid sorting paths, changing
  // revision semantics or repeatedly downloading the largest objects.
  for (let start = 0; start < missing.length; start += batchSize) {
    batches.push({
      number: batches.length + 1,
      objects: missing.slice(start, start + batchSize).map(v => ({
        bucket_id: v.bucket_id,
        name: v.name,
        version: v.version,
        size: v.metadata.size,
        eTag: v.metadata.eTag ?? null,
      })),
    });
  }
  const sealedData = {
    schema: 'dentalflow-resume-missing-objects-v1',
    snapshot: SOURCE_AAD,
    inventory_objects: summary.source_objects,
    copied_objects: summary.verified_objects,
    missing_objects: summary.missing_objects,
    missing_bytes: summary.missing_bytes,
    max_batch_size: batchSize,
    batches,
    // Explicit refusal to treat a worklist as backup completion.
    operational_acceptance: false,
  };
  const sumObjects = batches.reduce((sum, batch) => sum + batch.objects.length, 0);
  const sumBytes = batches.reduce((sum, batch) =>
    sum + batch.objects.reduce((v, obj) => v + obj.size, 0), 0);
  if (sumObjects !== summary.missing_objects || sumBytes !== summary.missing_bytes)
    fail('RECOVERY_RESUME_TOTAL_MISMATCH');
  return sealedData;
}

export async function createEncryptedStorageResume({indexFile,keyFile,outputFile,batchSize=4}) {
  if (!indexFile || !keyFile || !outputFile || indexFile === outputFile || keyFile === outputFile)
    fail('RECOVERY_RESUME_PATH_INVALID');
  const key = await readKey(keyFile);
  const index = JSON.parse(await collect(unseal(indexFile, key, SOURCE_AAD), 8*1024*1024));
  const plan = prepareStorageResume(index,batchSize);
  // seal uses exclusive create (wx), 0600 mode, AES-256-GCM and authenticated
  // name. Plaintext object names exist only in memory.
  await seal([Buffer.from(JSON.stringify(plan))], outputFile, key, RESUME_AAD);
  return {
    scope: 'encrypted-private-resume-only',
    missing_objects: plan.missing_objects,
    missing_bytes: plan.missing_bytes,
    batches: plan.batches.length,
    batch_limit: batchSize,
    downloaded_objects: 0,
    operational_acceptance: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [indexFile,keyFile,outputFile] = process.argv.slice(2);
  if (!indexFile || !keyFile || !outputFile || process.argv.length !== 5) {
    console.error('RECOVERY_RESUME_USAGE');
    process.exitCode=1;
  } else {
    try {
      console.log(JSON.stringify(await createEncryptedStorageResume({indexFile,keyFile,outputFile})));
    } catch (error) {
      // Never log paths/JSON, key values, URLs, filesystem errors or source
      // object metadata from user-provided encrypted archives.
      const code = /^RECOVERY_[A-Z_]+$/.test(error?.message ?? '')
        ? error.message : 'RECOVERY_RESUME_FAILED';
      console.error(code);
      process.exitCode=1;
    }
  }
}
