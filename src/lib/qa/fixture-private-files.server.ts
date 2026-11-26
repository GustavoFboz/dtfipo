import {createHash,randomBytes} from 'node:crypto';
import {executePrivateFileRotation,parseRotationClaim} from '@/lib/private-file-rotation.server';
import {FixtureFailure,requireResult,type Check} from './fixture-acceptance.server';
import type {FixtureSession} from './fixture-sessions.server';

export async function exerciseFixturePrivateFiles(fixture:FixtureSession,foreign:FixtureSession,jobId:string,
 upload:{bucket:string;path:string;fileId?:string;bytes:Uint8Array}):Promise<Check[]> {
 const {supabaseAdmin:admin}=await import('@/integrations/supabase/client.server');
 const checks:Check[]=[];let rotationId:string|undefined;const originalPath=upload.path;
 const record=(check:string,passed:boolean)=>{checks.push({check,passed});if(!passed)throw new FixtureFailure(check.toUpperCase());};
 async function sign(path:string,seconds:number){const r=requireResult(await fixture.client.storage.from('avatars').createSignedUrl(path,seconds),'PRIVATE_FIXTURE_SIGN_FAILED');return r.signedUrl;}
 async function opened(url:string){const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(6000)});try{await r.body?.cancel();}catch{}return r.status;}
 try {
  const expiring=await sign(originalPath,5);record('private_short_lived_link_opens',await opened(expiring)===200);
  await new Promise(r=>setTimeout(r,6200));
  record('private_expired_link_denied',[400,401,403,404].includes(await opened(expiring)));
  const before=await sign(originalPath,300);
  const payload=JSON.parse(Buffer.from(new URL(before).searchParams.get('token')!.split('.')[1],'base64url').toString());
  record('private_link_ttl_five_minutes',Number(payload.exp)-Number(payload.iat)===300);
  const tokenHash=createHash('sha256').update(randomBytes(32)).digest('hex');
  rotationId=requireResult(await (admin as any).rpc('prepare_fixture_private_file_rotation',{
   _fixture_job:jobId,_subject:fixture.user_id,_signed_url:before,_token_hash:tokenHash}),'PRIVATE_FIXTURE_PREPARE_FAILED') as string;
  const value=requireResult(await (admin as any).rpc('claim_private_file_rotation',{_job:rotationId,_token_hash:tokenHash}),'PRIVATE_FIXTURE_CLAIM_FAILED');
  const result=await executePrivateFileRotation(parseRotationClaim(value,rotationId),admin);
  record('private_real_rotation_verified',result.receipt?.passed===true&&result.failures.length===0);
  const target=requireResult(await (admin as any).from('private_file_rotation_targets').select('new_path,status')
   .eq('job_id',rotationId).eq('subject_id',fixture.user_id).single(),'PRIVATE_FIXTURE_RESULT_FAILED') as any;
  upload.path=target.new_path;
  const alias=requireResult(await fixture.client.rpc('resolve_rotated_private_file' as any,{_bucket:'avatars',_path:originalPath}),'PRIVATE_FIXTURE_ALIAS_FAILED') as any;
  record('private_owner_alias_resolves',alias?.bucket==='avatars'&&alias.path===upload.path);
  const denied=await foreign.client.rpc('resolve_rotated_private_file' as any,{_bucket:'avatars',_path:originalPath});
  record('private_foreign_alias_denied',!denied.error&&denied.data===null);
  const signed=await sign(upload.path,300);record('private_rotated_link_renews_and_opens',await opened(signed)===200);
  record('private_old_issued_link_revoked',[400,401,403,404,410].includes(await opened(before)));
  const foreignSign=await foreign.client.storage.from('avatars').createSignedUrl(upload.path,300);
  record('private_foreign_signature_denied',!!foreignSign.error);
  const row=requireResult(await fixture.client.from('profiles').select('avatar_url').eq('id',fixture.user_id).single(),'PRIVATE_FIXTURE_REFERENCE_FAILED');
  record('private_canonical_reference_has_no_bearer',row.avatar_url===`storage://avatars/${upload.path}`&&!row.avatar_url.includes('token='));
  // A valid new reservation cannot resurrect a path with an issued old token.
  const reserved=requireResult(await fixture.client.rpc('reserve_storage_upload',{_size_bytes:upload.bytes.length,_bucket:'avatars',_object_path:originalPath,
   _source_type:'user_avatar',_case_id:null,_patient_id:null,_original_name:'retired.png',_mime_type:'image/png'}),'PRIVATE_FIXTURE_RESERVE_FAILED') as any;
  const id=(Array.isArray(reserved)?reserved[0]:reserved)?.file_id;
  try{const resurrect=await fixture.client.storage.from('avatars').upload(originalPath,upload.bytes,{contentType:'image/png',upsert:false});
   if(!resurrect.error)await fixture.client.storage.from('avatars').remove([originalPath]);
   record('private_retired_path_cannot_be_reused',!!resurrect.error);
  }finally{if(id)requireResult(await fixture.client.rpc('cancel_storage_upload',{_file_id:id}),'PRIVATE_FIXTURE_RESERVATION_CLEANUP_FAILED');}
 } catch(error){checks.push({check:'private_rotation_fixture',passed:false,code:error instanceof FixtureFailure?error.safeCode:'PRIVATE_FIXTURE_ROTATION_FAILED'});}
 finally {
  if(rotationId){
   const target=await (admin as any).from('private_file_rotation_targets').select('new_path,status').eq('job_id',rotationId).eq('subject_id',fixture.user_id).maybeSingle();
   if(target.data){
    if(target.data.status==='prepared')await admin.storage.from('avatars').remove([target.data.new_path]);
    else upload.path=target.data.new_path;
   }
   // Only this job's fixed, disposable old avatar path, never a business file.
   await fixture.client.storage.from('avatars').remove([originalPath]);
  }
 }
 return checks;
}
