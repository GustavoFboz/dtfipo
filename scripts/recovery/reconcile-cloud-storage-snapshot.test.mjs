import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {reconcileSnapshotSha256} from './reconcile-cloud-storage-snapshot.mjs';

const sha=v=>createHash('sha256').update(v,'utf8').digest('hex');
const version='11111111-2222-3333-4444-555555555555';
const cat=[
  {bucket_id:'case-files',name:'case-x/zero.bin',version,metadata:{size:0,eTag:null}},
  {bucket_id:'case-files',name:'case-y/fake.html',version,metadata:{size:5,eTag:'synthetic-etag'}},
  {bucket_id:'avatars',name:'fictitious-avatar.png',version,metadata:{size:17,eTag:'fake'}},
];
const index={source_catalog:cat};
const makeRows=(arr=cat)=>{
  const buckets=[...new Set(arr.map(x=>x.bucket_id))].sort();
  return buckets.map(bucket=>{
    const rr=arr.filter(x=>x.bucket_id===bucket).sort((a,b)=>Buffer.compare(Buffer.from(a.name),Buffer.from(b.name)));
    const fp=fn=>sha(rr.map(x=>[x.bucket_id,x.name,String(fn(x)??'')].join('\u001f')).join('\n'));
    return {
      bucket_id:bucket,
      objects:rr.length,
      bytes:rr.reduce((a,x)=>a+x.metadata.size,0),
      sha_version:fp(x=>x.version),
      sha_size:fp(x=>x.metadata.size),
      sha_etag:fp(x=>x.metadata.eTag),
    };
  });
};

test('strictly matches all source names, versions, sizes and ETags without returning private paths',()=>{
  const result=reconcileSnapshotSha256(index,makeRows());
  assert.equal(result.matching_buckets,2);
  assert.equal(result.matching_objects,3);
  assert.equal(result.sha256_version_size_etag_match,true);
  assert.equal(result.original_object_bytes_authenticated,false);
  assert.equal(result.operational_acceptance,false);
  assert.equal(result.beta_release_authorized,false);
  const rendered=JSON.stringify(result);
  assert(!rendered.includes('case-x'));
  assert(!rendered.includes('fictitious-avatar'));
});
test('rejects a new version even if name, size and ETag do not change',()=>{
  const modified=structuredClone(index);
  modified.source_catalog[0].version='new-version';
  assert.throws(()=>reconcileSnapshotSha256(modified,makeRows()),/RECOVERY_SHA256_METADATA_DIFFERENCE/);
});
test('rejects a changed source length or source ETag',()=>{
  const modified=structuredClone(index);
  modified.source_catalog[1].metadata.size=6;
  assert.throws(()=>reconcileSnapshotSha256(modified,makeRows()),/RECOVERY_SHA256_METADATA_DIFFERENCE/);
  const etag=structuredClone(index);
  etag.source_catalog[1].metadata.eTag='some-other-etag';
  assert.throws(()=>reconcileSnapshotSha256(etag,makeRows()),/RECOVERY_SHA256_METADATA_DIFFERENCE/);
});
test('rejects missing bucket, forged checksum and duplicate rows',()=>{
  const missing=makeRows().filter(x=>x.bucket_id!=='avatars');
  assert.throws(()=>reconcileSnapshotSha256(index,missing),/RECOVERY_SHA256_COVERAGE_INVALID/);
  const forged=makeRows();forged[0].sha_etag='0'.repeat(64);
  assert.throws(()=>reconcileSnapshotSha256(index,forged),/RECOVERY_SHA256_METADATA_DIFFERENCE/);
  const dup=structuredClone(index);
  dup.source_catalog.push(dup.source_catalog[0]);
  assert.throws(()=>reconcileSnapshotSha256(dup,makeRows()),/RECOVERY_SHA256_DUPLICATE_INDEX/);
});
test('preserves zero-size objects exactly in the SHA-256 normalized representation',()=>{
  const rows=makeRows();
  const correct=reconcileSnapshotSha256(index,rows);
  assert.equal(correct.matching_objects,3);
  const bad=structuredClone(rows);
  bad.find(x=>x.bucket_id==='case-files').sha_size=sha('different');
  assert.throws(()=>reconcileSnapshotSha256(index,bad),/RECOVERY_SHA256_METADATA_DIFFERENCE/);
});
test('refuses malformed live report, leaking no metadata in the exception',()=>{
  const x=makeRows();x[0].sha_version='not-a-hash';
  assert.throws(()=>reconcileSnapshotSha256(index,x),/^Error: RECOVERY_SHA256_LIVE_INVALID$/);
  const y=makeRows();y.push(structuredClone(y[0]));
  assert.throws(()=>reconcileSnapshotSha256(index,y),/RECOVERY_SHA256_LIVE_INVALID/);
});
