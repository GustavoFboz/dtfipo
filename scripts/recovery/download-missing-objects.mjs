/**
 * Private incremental backup of only the 116 missing historical Storage bytes.
 * Requires the authenticated encrypted resume manifest, a private AES-256 key,
 * and an explicitly supplied server-side Storage token. Never publish these.
 * This does not reconcile the live catalog or prove a full recovery.
 *
 * node scripts/recovery/download-missing-objects.mjs RESUME.dfenc KEY.bin PRIVATE_DIR
 */
import {createHash} from 'node:crypto';
import {lstat, mkdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readKey,unseal,collect,seal,digest,fail,sha256} from './archive.mjs';
import {supabaseSource,objectPath} from './storage.mjs';
import {RESUME_AAD} from './prepare-storage-resume.mjs';

const fileHash = object => sha256([object.bucket_id,object.name,object.version ?? ''].join('\u001f'));
const dataAAD = hash => 'dentalflow-missing-20261029-data-'+hash;
const receiptAAD = hash => 'dentalflow-missing-20261029-receipt-'+hash;

async function readJsonEncrypted(file,key,aad){
  return JSON.parse(await collect(unseal(file,key,aad),8*1024*1024));
}
async function exists(file){
  try { const s=await lstat(file); if(!s.isFile() || s.isSymbolicLink() || (s.mode&0o077)) fail('RECOVERY_RESUME_UNSAFE_FILE'); return true; }
  catch(e){if(e?.code==='ENOENT')return false;throw e;}
}
async function ensurePrivateDirectory(dir){
  await mkdir(dir,{recursive:true,mode:0o700});
  const info=await lstat(dir);
  if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077))fail('RECOVERY_RESUME_UNSAFE_DIRECTORY');
}
export async function downloadMissing({manifestFile,keyFile,outputDir,source,intervalMs=250,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
  if(!Number.isInteger(intervalMs)||intervalMs<200||intervalMs>2000)fail('RECOVERY_RESUME_INTERVAL_INVALID');
  const key=await readKey(keyFile);
  const plan=await readJsonEncrypted(manifestFile,key,RESUME_AAD);
  if(plan.schema!=='dentalflow-resume-missing-objects-v1'||plan.operational_acceptance!==false||
      plan.snapshot!=='dentalflow-storage-index-20261029'||plan.missing_objects!==116||
      plan.missing_bytes!==1968840906||plan.max_batch_size!==4||
      !Array.isArray(plan.batches)||plan.batches.length!==29) fail('RECOVERY_RESUME_PLAN_INVALID');
  await ensurePrivateDirectory(outputDir);
  let completed=0,reused=0,bytes=0;
  const seen=new Set();
  for(const batch of plan.batches){
    if(!Array.isArray(batch.objects)||batch.objects.length<1||batch.objects.length>4)fail('RECOVERY_RESUME_BATCH_INVALID');
    for(const row of batch.objects){
      if(typeof row.bucket_id!=='string'||typeof row.name!=='string'||!Number.isSafeInteger(row.size)||row.size<0)
        fail('RECOVERY_RESUME_OBJECT_INVALID');
      objectPath('/recovery',row.bucket_id,row.name);
      const hash=fileHash(row);
      if(seen.has(hash))fail('RECOVERY_RESUME_DUPLICATE');
      seen.add(hash);
      const envelope=join(outputDir,hash+'.dfenc');
      const receiptFile=join(outputDir,hash+'.receipt.dfenc');
      const hasData=await exists(envelope),hasReceipt=await exists(receiptFile);
      if(hasData!==hasReceipt)fail('RECOVERY_RESUME_PARTIAL_OBJECT');
      if(hasData){
        const receipt=await readJsonEncrypted(receiptFile,key,receiptAAD(hash));
        const verification=await digest(unseal(envelope,key,dataAAD(hash)));
        if(receipt.hash!==hash||receipt.size!==row.size||
           receipt.sha256!==verification.sha256||verification.bytes!==row.size)fail('RECOVERY_RESUME_RECEIPT_MISMATCH');
        reused++;bytes+=row.size;continue;
      }
      const sourceStream=await source({bucket:row.bucket_id,name:row.name,version:row.version});
      const md5=createHash('md5');
      async function* metered(){for await(const chunk of sourceStream){const b=Buffer.from(chunk);md5.update(b);yield b;}}
      const written=await seal(metered(),envelope,key,dataAAD(hash));
      if(written.bytes!==row.size)fail('RECOVERY_RESUME_SIZE_MISMATCH');
      const expectedMd5=String(row.eTag??'').replace(/^"|"$/g,'');
      if(/^[a-f0-9]{32}$/i.test(expectedMd5)&&md5.digest('hex').toLowerCase()!==expectedMd5.toLowerCase())
        fail('RECOVERY_RESUME_ETAG_MISMATCH');
      await seal([Buffer.from(JSON.stringify({hash,size:written.bytes,sha256:written.sha256}))],receiptFile,key,receiptAAD(hash));
      completed++;bytes+=row.size;
      await sleep(intervalMs);
    }
  }
  if(seen.size!==116||bytes!==1968840906)fail('RECOVERY_RESUME_COVERAGE_MISMATCH');
  return {scope:'private-encrypted-object-download',new_objects:completed,reused_objects:reused,encrypted_objects_verified:116,
    content_bytes:bytes,source_catalog_reconciled:false,integrated_database_storage_restore_verified:false,
    operational_acceptance:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const [manifestFile,keyFile,outputDir]=process.argv.slice(2);
    if(!manifestFile||!keyFile||!outputDir||process.argv.length!==5)fail('RECOVERY_RESUME_USAGE');
    const url=process.env.DENTALFLOW_RECOVERY_STORAGE_URL;
    const token=process.env.DENTALFLOW_RECOVERY_STORAGE_KEY;
    if(!url||!token)fail('RECOVERY_RESUME_CREDENTIAL_REQUIRED');
    console.log(JSON.stringify(await downloadMissing({manifestFile,keyFile,outputDir,source:supabaseSource(url,token)})));
  }catch(e){
    console.error(/^RECOVERY_[A-Z_]+$/.test(e?.message??'')?e.message:'RECOVERY_RESUME_DOWNLOAD_FAILED');
    process.exitCode=1;
  }
}
