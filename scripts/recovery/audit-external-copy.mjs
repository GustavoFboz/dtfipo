/**
 * Read-only DentalFlow Storage recovery checkpoint auditor.
 * Never fetches Storage bytes, mutates the Cloud or prints object paths.
 * Usage: node scripts/recovery/audit-external-copy.mjs INDEX.dfenc KEY.bin [PARTS_DIRECTORY]
 * Optional archive checks compare SHA-256 one ZIP at a time. They do NOT
 * replace object decryption or a full independent restore.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { collect, fail, readKey, unseal } from './archive.mjs';

const AUTHENTICATED_INDEX_NAME = 'dentalflow-storage-index-20261029';
const validDigest = d => typeof d === 'string' && /^[a-f0-9]{64}$/.test(d);
const nonnegative = n => Number.isSafeInteger(n) && n >= 0;
const privateKey = value => [value.bucket_id, value.name, value.version ?? ''].join('\u001f');
const savedKey = value => [value.bucket_id, value.name, value.source_version ?? ''].join('\u001f');
const sum = (values, get) => values.reduce((total, v) => total + get(v), 0);

function fingerprint(catalog, selector) {
  const rows = [...catalog].sort((a, b) =>
    a.bucket_id < b.bucket_id ? -1 : a.bucket_id > b.bucket_id ? 1 :
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const contents = rows.map(row => [row.bucket_id, row.name, selector(row) ?? ''].join('\u001f')).join('\n');
  return createHash('md5').update(contents).digest('hex');
}

export function auditCatalog(index) {
  if (!index || index.version !== 1 || !Array.isArray(index.parts)
    || !Array.isArray(index.files) || !Array.isArray(index.source_catalog)
    || !nonnegative(index.source_objects) || !nonnegative(index.files_verified)
    || !nonnegative(index.bytes_verified) || typeof index.complete !== 'boolean') fail('RECOVERY_CHECKPOINT_INVALID');
  if (index.source_catalog.length !== index.source_objects) fail('RECOVERY_CHECKPOINT_SOURCE_COUNT');
  const catalog = new Map();
  for (const item of index.source_catalog) {
    const size = item?.metadata?.size;
    if (typeof item?.bucket_id !== 'string' || typeof item.name !== 'string'
      || typeof item.version !== 'string' || !nonnegative(size)) fail('RECOVERY_CHECKPOINT_CATALOG_INVALID');
    const key = privateKey(item);
    if (catalog.has(key)) fail('RECOVERY_CHECKPOINT_DUPLICATE_OBJECT');
    catalog.set(key, item);
  }
  const saved = new Set();
  for (const item of index.files) {
    if (typeof item?.source_version !== 'string' || !nonnegative(item.bytes)
      || !validDigest(item.sha256) || item.restore_verified !== true
      || typeof item.bucket_id !== 'string' || typeof item.name !== 'string') fail('RECOVERY_CHECKPOINT_RECEIPT_INVALID');
    const key = savedKey(item);
    if (saved.has(key)) fail('RECOVERY_CHECKPOINT_DUPLICATE_RECEIPT');
    saved.add(key);
    const original = catalog.get(key);
    if (!original || original.metadata.size !== item.bytes) fail('RECOVERY_CHECKPOINT_SOURCE_MISMATCH');
  }
  if (index.files_verified !== saved.size || index.bytes_verified !== sum(index.files, f => f.bytes))
    fail('RECOVERY_CHECKPOINT_TOTAL_MISMATCH');
  let partFiles = 0;
  for (let i = 0; i < index.parts.length; i++) {
    const part = index.parts[i];
    if (part?.part !== i + 1 || !nonnegative(part.files) || !nonnegative(part.bytes)
      || !validDigest(part.sha256) || part.closed !== true) fail('RECOVERY_CHECKPOINT_PART_INVALID');
    partFiles += part.files;
  }
  if (partFiles !== saved.size) fail('RECOVERY_CHECKPOINT_PART_COUNT');
  const missing = [...catalog].filter(([key]) => !saved.has(key)).map(([,value]) => value);
  const missingBytes = sum(missing, item => item.metadata.size);
  const readyToAccept = missing.length === 0 && index.complete === true;
  if (index.complete && missing.length > 0) fail('RECOVERY_CHECKPOINT_FALSE_COMPLETION');
  return {
    scope: 'historical-frozen-storage-inventory',
    source_objects: catalog.size,
    verified_objects: saved.size,
    missing_objects: missing.length,
    verified_bytes: index.bytes_verified,
    missing_bytes: missingBytes,
    zip_parts_declared: index.parts.length,
    original_fingerprint_version: fingerprint(index.source_catalog, v => v.version),
    original_fingerprint_size: fingerprint(index.source_catalog, v => String(v.metadata.size)),
    original_fingerprint_etag: fingerprint(index.source_catalog, v => v.metadata.eTag ?? ''),
    catalog_coverage_complete: readyToAccept,
    operational_acceptance: false,
    note: 'Only index checks. A verified isolated restore and current environment reconciliation remain required.',
  };
}

export async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function auditExternalCopy({ indexFile, keyFile, partsDirectory }) {
  const key = await readKey(keyFile);
  const index = JSON.parse(await collect(unseal(indexFile, key, AUTHENTICATED_INDEX_NAME), 8 * 1024 * 1024));
  const result = auditCatalog(index);
  if (partsDirectory) {
    let checked = 0;
    for (const part of index.parts) {
      const name = 'DentalFlow_Anexos_2026-10-29_Parte_' + String(part.part).padStart(2, '0') + '.zip';
      const path = join(partsDirectory, name);
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== part.bytes
        || await hashFile(path) !== part.sha256) fail('RECOVERY_CHECKPOINT_ARCHIVE_MISMATCH');
      checked++;
    }
    result.zip_archives_hash_verified = checked;
    result.note = 'Archive digests verified; object decryption, current Cloud comparison and isolated restore still required.';
  } else result.zip_archives_hash_verified = null;
  return result;
}

if (process.argv[1] && basename(process.argv[1]) === basename(new URL(import.meta.url).pathname)) {
  const [indexFile, keyFile, partsDirectory] = process.argv.slice(2);
  if (!indexFile || !keyFile || process.argv.length > 5) {
    console.error('RECOVERY_CHECKPOINT_USAGE');
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(await auditExternalCopy({ indexFile, keyFile, partsDirectory }), null, 2)); }
    catch (error) {
      // Never print arbitrary paths, filesystem errors or private catalog values.
      console.error(/^RECOVERY_[A-Z_]+$/.test(error?.message ?? '') ? error.message : 'RECOVERY_CHECKPOINT_FAILED');
      process.exitCode = 1;
    }
  }
}
