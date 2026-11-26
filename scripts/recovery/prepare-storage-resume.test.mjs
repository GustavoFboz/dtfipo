import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {mkdtemp,rm,readFile,writeFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {seal,unseal,collect} from './archive.mjs';
import {prepareStorageResume,createEncryptedStorageResume,RESUME_AAD} from './prepare-storage-resume.mjs';

const sha = b => createHash('sha256').update(b).digest('hex');
function indexFixture() {
  const source_catalog=Array.from({length:7},(_,i)=>({
    bucket_id:'fake-files',name:'private/fixture-'+i+'.bin',version:'version-fixture',
    metadata:{size:i+10,eTag:'etag-'+i},
  }));
  const first=source_catalog[0];
  return {version:1,source_objects:7,files_verified:1,bytes_verified:10,complete:false,
    source_catalog,
    files:[{bucket_id:first.bucket_id,name:first.name,source_version:first.version,
      bytes:10,sha256:sha(Buffer.from('not-an-original-clinical-file')),restore_verified:true}],
    parts:[{part:1,files:1,bytes:12,sha256:sha(Buffer.from('sample-zip-1')),closed:true}],
  };
}
test('only missing objects appear; at most four per ordered private batch',()=>{
  const v=indexFixture(),plan=prepareStorageResume(v,4);
  assert.equal(plan.inventory_objects,7);
  assert.equal(plan.copied_objects,1);
  assert.equal(plan.missing_objects,6);
  assert.equal(plan.missing_bytes,81);
  assert.deepEqual(plan.batches.map(x=>x.objects.length),[4,2]);
  assert.equal(plan.batches[0].objects[0].name,'private/fixture-1.bin');
  assert.equal(plan.operational_acceptance,false);
});
test('refuses unsafe batch sizes, forged totals and duplicated receipts',()=>{
  const v=indexFixture();
  assert.throws(()=>prepareStorageResume(v,5),/RECOVERY_RESUME_BATCH_LIMIT/);
  assert.throws(()=>prepareStorageResume(v,0),/RECOVERY_RESUME_BATCH_LIMIT/);
  v.files_verified=2;assert.throws(()=>prepareStorageResume(v),/RECOVERY_CHECKPOINT_TOTAL_MISMATCH/);
  v.files_verified=1;v.files.push(v.files[0]);assert.throws(()=>prepareStorageResume(v),/RECOVERY_CHECKPOINT_DUPLICATE_RECEIPT/);
});
test('encrypted 0600 worklist contains no clear patient paths and refuses overwrite',async()=>{
  const root=await mkdtemp(join(tmpdir(),'dentalflow-resume-fixture-'));
  try{
    const key=randomBytes(32),keyFile=join(root,'key.bin'),indexFile=join(root,'index.dfenc'),outputFile=join(root,'private-resume.dfenc');
    await writeFile(keyFile,key,{mode:0o600});
    await seal([Buffer.from(JSON.stringify(indexFixture()))],indexFile,key,'dentalflow-storage-index-20261029');
    const summary=await createEncryptedStorageResume({indexFile,keyFile,outputFile});
    assert.deepEqual(summary,{scope:'encrypted-private-resume-only',missing_objects:6,
      missing_bytes:81,batches:2,batch_limit:4,downloaded_objects:0,operational_acceptance:false});
    const raw=await readFile(outputFile);
    assert.ok(raw.subarray(0,8).equals(Buffer.from('DFREC001')));
    assert.equal(raw.includes(Buffer.from('private/fixture-2.bin')),false);
    assert.equal((await stat(outputFile)).mode&0o077,0);
    const plan=JSON.parse(await collect(unseal(outputFile,key,RESUME_AAD)));
    assert.equal(plan.batches[1].objects.length,2);
    assert.equal(plan.batches[0].objects[0].eTag,'etag-1');
    await assert.rejects(createEncryptedStorageResume({indexFile,keyFile,outputFile}),/EEXIST/);
  }finally{await rm(root,{recursive:true,force:true});}
});
