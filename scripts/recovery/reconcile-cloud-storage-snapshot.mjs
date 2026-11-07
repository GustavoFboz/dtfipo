/**
 * Compare the historical AES-256-GCM Storage inventory with an aggregate,
 * read-only SHA-256 report from the live Cloud. Does not download, print or
 * emit any clinical object names, source rows, keys or SQL connection strings.
 *
 * node scripts/recovery/reconcile-cloud-storage-snapshot.mjs \
 *   PRIVATE-INDEX.dfenc PRIVATE-KEY.bin LIVE-AGGREGATES.json
 */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {readKey,unseal,collect,fail} from './archive.mjs';

export const ORIGINAL_BUCKETS=Object.freeze([
  'avatars','case-files','database_export_05_09_26','patient-photos',
]);
const allowedDigest = v => typeof v==='string' && /^[a-f0-9]{64}$/.test(v);
const fingerprint = (rows, get) => createHash('sha256').update(
  rows.map(r => [r.bucket_id,r.name,String(get(r) ?? '')].join('\u001f')).join('\n'),'utf8'
).digest('hex');

function sorted(rows) {
  return [...rows].sort((a,b) =>
    Buffer.compare(Buffer.from(a.bucket_id),Buffer.from(b.bucket_id)) ||
    Buffer.compare(Buffer.from(a.name),Buffer.from(b.name))
  );
}

/** Synthetic-friendly pure helper; never output original paths/fingerprints. */
export function reconcileSnapshotSha256(index, liveAggregate) {
  if (!index || !Array.isArray(index.source_catalog) ||
      !Array.isArray(liveAggregate) || index.source_catalog.length===0 ||
      liveAggregate.length===0) fail('RECOVERY_SHA256_INPUT_INVALID');
  const grouped=new Map();
  const identity=new Set();
  for (const x of index.source_catalog) {
    if (!x || typeof x.bucket_id!=='string' || !x.bucket_id ||
        typeof x.name!=='string' || !x.name || typeof x.version!=='string' ||
        !x.metadata || !Number.isSafeInteger(x.metadata.size) || x.metadata.size<0 ||
        !(x.metadata.eTag===undefined || x.metadata.eTag===null || typeof x.metadata.eTag==='string'))
      fail('RECOVERY_SHA256_INDEX_INVALID');
    const id=[x.bucket_id,x.name,x.version].join('\u001f');
    if (identity.has(id)) fail('RECOVERY_SHA256_DUPLICATE_INDEX');
    identity.add(id);
    if (!grouped.has(x.bucket_id)) grouped.set(x.bucket_id,[]);
    grouped.get(x.bucket_id).push(x);
  }

  const live=new Map();
  for (const x of liveAggregate) {
    if (!x || typeof x.bucket_id!=='string' || !x.bucket_id ||
        !Number.isSafeInteger(Number(x.objects)) || Number(x.objects)<0 ||
        !Number.isSafeInteger(Number(x.bytes)) || Number(x.bytes)<0 ||
        !allowedDigest(x.sha_version) || !allowedDigest(x.sha_size) ||
        !allowedDigest(x.sha_etag) || live.has(x.bucket_id))
      fail('RECOVERY_SHA256_LIVE_INVALID');
    live.set(x.bucket_id,x);
  }

  if (grouped.size!==live.size || [...grouped.keys()].some(bucket=>!live.has(bucket)))
    fail('RECOVERY_SHA256_COVERAGE_INVALID');

  let matched=0, total=0;
  for (const [bucket,entries] of grouped) {
    const rows=sorted(entries);
    const remote=live.get(bucket);
    const count=rows.length;
    const size=rows.reduce((sum,x)=>sum+x.metadata.size,0);
    if (count!==Number(remote.objects) || size!==Number(remote.bytes) ||
        fingerprint(rows,x=>x.version)!==remote.sha_version ||
        fingerprint(rows,x=>x.metadata.size)!==remote.sha_size ||
        fingerprint(rows,x=>x.metadata.eTag)!==remote.sha_etag)
      fail('RECOVERY_SHA256_METADATA_DIFFERENCE');
    matched++;
    total+=count;
  }

  return {
    scope:'historical-storage-metadata-only',
    matching_buckets:matched,
    matching_objects:total,
    sha256_version_size_etag_match:true,
    original_object_bytes_authenticated:false,
    additional_export_bucket_covered:false,
    live_database_backup_verified:false,
    integrated_restore_verified:false,
    operational_acceptance:false,
    beta_release_authorized:false,
  };
}

export async function reconcilePrivateCheckpoint(indexFile,keyFile,aggregateFile) {
  const key=await readKey(keyFile);
  const raw=await collect(unseal(indexFile,key,'dentalflow-storage-index-20261029'),8*1024*1024);
  const index=JSON.parse(raw);
  if (index.version!==1 || index.source_objects!==708 ||
      index.source_catalog?.length!==708 || index.files_verified!==592 ||
      index.files?.length!==592) fail('RECOVERY_SHA256_HISTORICAL_CHECKPOINT_INVALID');
  const aggregate=JSON.parse(await readFile(aggregateFile,'utf8'));
  if (!Array.isArray(aggregate) || aggregate.length!==4 ||
      ORIGINAL_BUCKETS.some(b=>!aggregate.some(x=>x.bucket_id===b)))
    fail('RECOVERY_SHA256_BUCKET_SCOPE_INVALID');
  return reconcileSnapshotSha256(index,aggregate);
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [index,key,aggregates]=process.argv.slice(2);
  if(!index||!key||!aggregates||process.argv.length!==5){
    console.error('RECOVERY_SHA256_USAGE');process.exitCode=1;
  }else{
    try{console.log(JSON.stringify(await reconcilePrivateCheckpoint(index,key,aggregates),null,2));}
    catch{console.error('RECOVERY_SHA256_RECONCILIATION_FAILED');process.exitCode=1;}
  }
}
