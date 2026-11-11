import { createHash } from 'node:crypto';
import { z } from 'zod';

const targetSchema=z.object({id:z.string().uuid(),bucket:z.enum(['patient-photos','avatars']),subject_id:z.string().uuid(),
 old_path:z.string().min(1).max(1023),new_path:z.string().min(1).max(1023),old_signed_url:z.string().url(),
 size_bytes:z.coerce.number().int().positive().max(2*1024*1024),status:z.enum(['prepared','activated','verified']),
 content_hash:z.string().regex(/^[a-f0-9]{64}$/).nullable()});
const claimSchema=z.object({id:z.string().uuid(),lease_token:z.string().uuid(),targets:z.array(targetSchema).min(1).max(40)});
export type RotationTarget=z.infer<typeof targetSchema>;
type Claim=z.infer<typeof claimSchema>;
type ObjectBytes={bytes:Uint8Array;mime:string};
type Operations={origin:string;read:(bucket:string,path:string)=>Promise<ObjectBytes|null>;
 upload:(target:RotationTarget,source:ObjectBytes)=>Promise<void>;
 activate:(target:RotationTarget,hash:string)=>Promise<void>;remove:(target:RotationTarget)=>Promise<void>;
 oldStatus:(url:string)=>Promise<number>;verify:(target:RotationTarget,hash:string,status:number)=>Promise<void>;
 pause?:(ms:number)=>Promise<void>};
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export function parseRotationClaim(value:unknown,expectedId:string){const claim=claimSchema.parse(value);
 if(claim.id!==expectedId)throw new PrivateRotationFailure('ROTATION_SCOPE_MISMATCH');return claim;}
export class PrivateRotationFailure extends Error {constructor(readonly code:string){super(code);}}

export function assertRotationTarget(target:RotationTarget,origin:string) {
 const url=new URL(target.old_signed_url);
 const oldPath=`/storage/v1/object/sign/${target.bucket}/${target.old_path}`;
 if(url.origin!==new URL(origin).origin||url.username||url.password||url.hash
  ||decodeURIComponent(url.pathname)!==oldPath||!url.searchParams.get('token')
  ||!target.old_path.startsWith(target.subject_id+'/')||!target.new_path.startsWith(target.subject_id+'/')
  ||target.old_path===target.new_path||[target.old_path,target.new_path].some(p=>/(^|\/)\.\.(\/|$)|[\r\n]/.test(p)))
  throw new PrivateRotationFailure('ROTATION_TARGET_INVALID');
}

/** Copy, verify, atomically switch references, then retire only the old bytes.
 * After a timeout every destination is read back before another write. A
 * resume uses the stored hash; it never rewrites an already-verified copy. */
export async function rotatePrivateTarget(target:RotationTarget,ops:Operations) {
 assertRotationTarget(target,ops.origin);
 if(target.status==='verified')return;
 let copied=await ops.read(target.bucket,target.new_path),hash:string;
 if(target.status==='prepared') {
  const initialStatus=await ops.oldStatus(target.old_signed_url);
  if(![200,400,401,403,404,410].includes(initialStatus))throw new PrivateRotationFailure('ROTATION_ORIGINAL_URL_UNVERIFIED');
  const original=await ops.read(target.bucket,target.old_path);
  if(!original||original.bytes.length!==target.size_bytes||!/^image\/(jpeg|png|gif|webp)$/.test(original.mime))
   throw new PrivateRotationFailure('ROTATION_SOURCE_UNVERIFIED');
  hash=digest(original.bytes);
  if(!copied) {
   try{await ops.upload(target,original);}catch{ /* Read back an ambiguous upload; do not repeat it here. */ }
   copied=await ops.read(target.bucket,target.new_path);
  }
  if(!copied||copied.bytes.length!==target.size_bytes||digest(copied.bytes)!==hash)
   throw new PrivateRotationFailure('ROTATION_COPY_UNVERIFIED');
  await ops.activate(target,hash);
 } else {
  hash=target.content_hash??'';
  if(!copied||copied.bytes.length!==target.size_bytes||digest(copied.bytes)!==hash)
   throw new PrivateRotationFailure('ROTATION_COPY_UNVERIFIED');
  // Revalidate the canonical reference before removing any original object.
  await ops.activate(target,hash);
 }
 await ops.remove(target);
 const preserved=await ops.read(target.bucket,target.new_path);
 if(!preserved||preserved.bytes.length!==target.size_bytes||digest(preserved.bytes)!==hash)
  throw new PrivateRotationFailure('ROTATION_COPY_UNVERIFIED');
 const denied=new Set([400,401,403,404,410]);let status=await ops.oldStatus(target.old_signed_url);
 // Smart CDN invalidation can lag object removal. Read the exact issued URL,
 // without a cache-busting variant or an authorization header.
 for(let attempt=0;status===200&&attempt<4;attempt++) {
  await (ops.pause??(ms=>new Promise(r=>setTimeout(r,ms))))(15000);
  status=await ops.oldStatus(target.old_signed_url);
 }
 if(!denied.has(status))throw new PrivateRotationFailure('ROTATION_OLD_URL_STILL_USABLE');
 await ops.verify(target,hash,status);
}

export async function executePrivateFileRotation(claim:Claim,admin:any) {
 const origin=process.env.SUPABASE_URL;
 if(!origin)throw new PrivateRotationFailure('ROTATION_CONFIGURATION_MISSING');
 const rpc=async(name:string,args:object)=>{const r=await admin.rpc(name,args);if(r.error||r.data!==true)throw new PrivateRotationFailure('ROTATION_DATABASE_REJECTED');};
 const ops:Operations={origin,
  read:async(bucket,path)=>{
   const r=await admin.storage.from(bucket).download(path);
   if(r.error){if(Number(r.error.statusCode??r.error.status)===404
     || (Number(r.error.statusCode??r.error.status)===400&&/not found|does not exist/i.test(r.error.message)))return null;
    throw new PrivateRotationFailure('ROTATION_OBJECT_READ_FAILED');}
   const bytes=new Uint8Array(await r.data.arrayBuffer());
   if(bytes.length>2*1024*1024)throw new PrivateRotationFailure('ROTATION_OBJECT_TOO_LARGE');
   return {bytes,mime:r.data.type.split(';')[0]};
  },
  upload:async(t,source)=>{const r=await admin.storage.from(t.bucket).upload(t.new_path,source.bytes,{contentType:source.mime,upsert:false,cacheControl:'0'});
   if(r.error)throw new PrivateRotationFailure('ROTATION_UPLOAD_UNCONFIRMED');},
  activate:(t,hash)=>rpc('activate_private_file_rotation',{_job:claim.id,_lease:claim.lease_token,_target:t.id,_hash:hash,_bytes:t.size_bytes}),
  remove:async(t)=>{const r=await admin.storage.from(t.bucket).remove([t.old_path]);if(r.error)throw new PrivateRotationFailure('ROTATION_REMOVAL_UNCONFIRMED');},
  oldStatus:async(url)=>{const r=await fetch(url,{method:'GET',credentials:'omit',redirect:'manual',signal:AbortSignal.timeout(8000)});
   try{await r.body?.cancel();}catch{} return r.status;},
  verify:(t,hash,status)=>rpc('verify_private_file_rotation',{_job:claim.id,_lease:claim.lease_token,_target:t.id,_hash:hash,_old_http_status:status})};
 const failures:{id:string;code:string}[]=[];
 // Keep maintenance below the live application's load: complete each file
 // before starting the next. A failed proof stops the job; untouched targets
 // stay prepared for review instead of generating more requests under failure.
 for(const target of claim.targets) {
  try{await rotatePrivateTarget(target,ops);}
  catch(error){
   failures.push({id:target.id,code:error instanceof PrivateRotationFailure?error.code:'ROTATION_EXECUTION_FAILED'});
   break;
  }
 }
 const finished=await admin.rpc('finish_private_file_rotation',{_job:claim.id,_lease:claim.lease_token});
 if(finished.error||!finished.data)throw new PrivateRotationFailure('ROTATION_RECEIPT_NOT_PERSISTED');
 return {receipt:finished.data,failures};
}

/** One-use backend capability, no Origin, no arbitrary source/actor/path/URL. */
export async function handlePrivateFileRotation(request:Request) {
 const reply=(status:number,body:object)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(request.method!=='POST')return reply(405,{available:false});
 const token=/^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization')??'')?.[1];
 if(!token||request.headers.has('origin'))return reply(403,{available:false});
 if(Number(request.headers.get('content-length')??'0')>100)return reply(413,{available:false});
 let id:string;
 try{const body=await request.text();if(Buffer.byteLength(body)>100)return reply(413,{available:false});
  id=z.object({jobId:z.string().uuid()}).strict().parse(JSON.parse(body)).jobId;
 }catch{return reply(400,{available:false});}
 const {supabaseAdmin:admin}=await import('@/integrations/supabase/client.server');let claim:Claim;
 try{const r=await (admin as any).rpc('claim_private_file_rotation',{_job:id,_token_hash:createHash('sha256').update(token).digest('hex')});
  if(r.error)throw new Error();claim=parseRotationClaim(r.data,id);
 }catch{return reply(403,{available:false});}
 try{return reply(200,{available:true,...await executePrivateFileRotation(claim,admin)});}
 catch{return reply(503,{available:false,code:'ROTATION_REVIEW_REQUIRED'});}
}
