import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {seal} from './archive.mjs';
import {RESUME_AAD} from './prepare-storage-resume.mjs';
import {downloadMissing} from './download-missing-objects.mjs';

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'dentalflow-missing-'));
  await chmod(root,0o700);
  const key=randomBytes(32),keyFile=join(root,'key.bin');
  await writeFile(keyFile,key,{mode:0o600});
  const objects=Array.from({length:116},(_,i)=>({bucket_id:'fake-test',name:'f'+i+'.bin',version:'v1',size:i===0?1968840906:0,eTag:null}));
  const plan={schema:'dentalflow-resume-missing-objects-v1',snapshot:'dentalflow-storage-index-20261029',
    missing_objects:116,missing_bytes:1968840906,max_batch_size:4,operational_acceptance:false,
    batches:Array.from({length:29},(_,i)=>({number:i+1,objects:objects.slice(i*4,i*4+4)}))};
  const manifestFile=join(root,'manifest.dfenc');
  await seal([Buffer.from(JSON.stringify(plan))],manifestFile,key,RESUME_AAD);
  return {root,key,plan,keyFile,manifestFile,outputDir:join(root,'objects')};
}
test('rejects any mutated encrypted manifest before fetching private data',async()=>{
  const f=await fixture();f.plan.missing_objects=115;
  const broken=join(f.root,'broken.dfenc');
  await seal([Buffer.from(JSON.stringify(f.plan))],broken,f.key,RESUME_AAD);
  let calls=0;
  await assert.rejects(downloadMissing({manifestFile:broken,keyFile:f.keyFile,outputDir:f.outputDir,
    source:async()=>{calls++;return []},sleep:async()=>{}}),/RECOVERY_RESUME_PLAN_INVALID/);
  assert.equal(calls,0);
});
test('fails closed on truncated source bytes without creating a valid receipt',async()=>{
  const f=await fixture();
  let calls=0;
  await assert.rejects(downloadMissing({manifestFile:f.manifestFile,keyFile:f.keyFile,outputDir:f.outputDir,
    source:async()=>{calls++;return [Buffer.from('short')]},sleep:async()=>{}}),/RECOVERY_RESUME_SIZE_MISMATCH/);
  assert.equal(calls,1);
  const output=await readdir(f.outputDir);
  assert.equal(output.filter(x=>x.endsWith('.receipt.dfenc')).length,0);
  assert.equal(output.filter(x=>x.endsWith('.dfenc')).length,1);
});
test('rejects public-readable backup key before touching any network',async()=>{
  const f=await fixture();
  await chmod(f.keyFile,0o644);
  let calls=0;
  await assert.rejects(downloadMissing({manifestFile:f.manifestFile,keyFile:f.keyFile,outputDir:f.outputDir,
    source:async()=>{calls++;return []},sleep:async()=>{}}),/RECOVERY_KEY_PERMISSIONS/);
  assert.equal(calls,0);
});
