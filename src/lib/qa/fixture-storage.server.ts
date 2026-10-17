import { createHash, randomUUID } from 'node:crypto';
import { FixtureFailure, requireResult, type Check, type Job } from './fixture-acceptance.server';
import { withFixtureSessions, type FixtureSession } from './fixture-sessions.server';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6BYAAAAASUVORK5CYII=','base64');
type Upload={bucket:string;path:string;source:string;bytes:Buffer;mime:string;caseId?:string;patientId?:string;fileId?:string;sourceId?:string;uploaded?:boolean;completed?:boolean};
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
async function usage(fixture:FixtureSession) {
  const rows=requireResult(await fixture.client.rpc('get_storage_usage'),'FIXTURE_USAGE_FAILED') as any;
  const row=Array.isArray(rows)?rows[0]:rows;
  if(!row || !Number.isSafeInteger(Number(row.used_bytes)) || !Number.isSafeInteger(Number(row.limit_bytes))) throw new FixtureFailure('FIXTURE_USAGE_INVALID');
  return {used:Number(row.used_bytes),limit:Number(row.limit_bytes)};
}
async function ownClinical(fixture:FixtureSession,jobId:string) {
  // A participant may upload to an assigned case without being allowed to
  // create/delete patients. Provision only this job's disposable records as
  // trusted setup; all reservations and Storage operations use the real user.
  // Never promote a fixture or change policies to make the test pass.
  const {supabaseAdmin:admin}=await import('@/integrations/supabase/client.server');
  const patientId=randomUUID(),caseId=randomUUID();
  const photo=`storage://patient-photos/${patientId}/qa-${jobId}.png`;
  requireResult(await admin.from('patients').insert({id:patientId,name:`DentalFlow SaaS QA ${jobId}`,clinic_id:fixture.clinic_id,photo_url:photo}).select('id').single(),'FIXTURE_PATIENT_CREATE_FAILED');
  try {
    // An unassigned draft avoids the legacy INSERT broadcast to global staff.
    // Attach only this fixture after INSERT; assignment/status stay unchanged.
    requireResult(await admin.from('cases').insert({id:caseId,patient_id:patientId,requested_by:null,
      delivery_date:new Date(Date.now()+7*86400000).toISOString().slice(0,10),status:'pendente'}).select('id').single(),'FIXTURE_CASE_CREATE_FAILED');
    requireResult(await admin.from('cases').update({requested_by:fixture.user_id}).eq('id',caseId).eq('patient_id',patientId).is('requested_by',null).select('id').single(),'FIXTURE_CASE_PARTICIPANT_FAILED');
  } catch(error) {
    await admin.from('cases').delete().eq('id',caseId).eq('patient_id',patientId);
    await admin.from('patients').delete().eq('id',patientId).eq('clinic_id',fixture.clinic_id);throw error;
  }
  return {patientId,caseId,photo,async remove() {
    // Exact random IDs returned by our inserts, scoped again to the fixture.
    requireResult(await admin.from('cases').delete().eq('id',caseId).eq('patient_id',patientId).eq('requested_by',fixture.user_id),'FIXTURE_CASE_DELETE_FAILED');
    requireResult(await admin.from('patients').delete().eq('id',patientId).eq('clinic_id',fixture.clinic_id).eq('name',`DentalFlow SaaS QA ${jobId}`),'FIXTURE_PATIENT_DELETE_FAILED');
    const cases=await admin.from('cases').select('id').eq('id',caseId),patients=await admin.from('patients').select('id').eq('id',patientId);
    return !cases.error&&cases.data.length===0&&!patients.error&&patients.data.length===0;
  }};
}
async function cleanup(fixture:FixtureSession,upload:Upload) {
  if(upload.uploaded) requireResult(await fixture.client.storage.from(upload.bucket).remove([upload.path]),'FIXTURE_OBJECT_DELETE_FAILED');
  // The uploader can release its own reservation only after Storage confirms
  // absence. Company-wide managed deletion requires a different manager role.
  if(upload.fileId) requireResult(await fixture.client.rpc('cancel_storage_upload',{_file_id:upload.fileId}),'FIXTURE_RESERVATION_DELETE_FAILED');
  if(upload.sourceId&&upload.source==='case_attachment') requireResult(await fixture.client.from('case_attachments').delete().eq('id',upload.sourceId).eq('storage_path',upload.path),'FIXTURE_CASE_ATTACHMENT_DELETE_FAILED');
  if(upload.sourceId&&upload.source==='patient_attachment') requireResult(await fixture.client.from('patient_attachments').delete().eq('id',upload.sourceId).eq('file_path',upload.path),'FIXTURE_PATIENT_ATTACHMENT_DELETE_FAILED');
}

/** Real authenticated Storage uploads, persisted size checks, clinical links,
 * cross-company denials and removal. Only this run's UUID paths are removed. */
export async function runFixtureStorage(job:Job):Promise<Check[]> {
  const checks:Check[]=[];
  try {
    await withFixtureSessions(job,async sessions=>{
      for(const fixture of sessions) {
        const foreign=sessions.find(s=>s.user_id!==fixture.user_id)!;
        const baseline=await usage(fixture);
        const own=requireResult(await fixture.client.from('profiles').select('avatar_url').eq('id',fixture.user_id).single(),'FIXTURE_AVATAR_READ_FAILED');
        const originals={avatar:own.avatar_url};
        if(originals.avatar) throw new FixtureFailure('FIXTURE_AVATAR_ALREADY_SET');
        const clinical=await ownClinical(fixture,job.id);
        const uploads:Upload[]=[
          {bucket:'case-files',path:`${clinical.caseId}/qa-${job.id}.stl`,source:'case_attachment',bytes:Buffer.from('solid fixture\nendsolid fixture\n'),mime:'application/octet-stream',caseId:clinical.caseId},
          {bucket:'patient-files',path:`${clinical.patientId}/qa-${job.id}.pdf`,source:'patient_attachment',bytes:Buffer.from('%PDF-1.4\n% DentalFlow QA fixture\n%%EOF\n'),mime:'application/pdf',patientId:clinical.patientId},
          {bucket:'patient-photos',path:`${clinical.patientId}/qa-${job.id}.png`,source:'patient_photo',bytes:png,mime:'image/png',patientId:clinical.patientId},
          {bucket:'avatars',path:`${fixture.user_id}/qa-${job.id}.png`,source:'user_avatar',bytes:png,mime:'image/png'},
        ];
        try {
          const direct=await fixture.client.storage.from('avatars').upload(`${fixture.user_id}/qa-${job.id}-unreserved.png`,png,{contentType:'image/png',upsert:false});
          checks.push({check:'unreserved_real_upload_denied',passed:!!direct.error});
          if(!direct.error) {await fixture.client.storage.from('avatars').remove([`${fixture.user_id}/qa-${job.id}-unreserved.png`]);throw new FixtureFailure('FIXTURE_UNRESERVED_UPLOAD_ALLOWED');}
          const over=await fixture.client.rpc('reserve_storage_upload',{_size_bytes:baseline.limit+1,_bucket:'avatars',_object_path:`${fixture.user_id}/qa-${job.id}-over.png`,_source_type:'user_avatar',_case_id:null,_patient_id:null,_original_name:'qa-over.png',_mime_type:'image/png'});
          checks.push({check:'actual_quota_overflow_denied',passed:!!over.error&&over.error.message.includes('STORAGE_QUOTA_EXCEEDED')});
          if(!over.error) {
            const rows=over.data as any;const id=Array.isArray(rows)?rows[0]?.file_id:rows?.file_id;
            if(id) await fixture.client.rpc('cancel_storage_upload',{_file_id:id});
            throw new FixtureFailure('FIXTURE_QUOTA_OVERFLOW_ALLOWED');
          }
          let expected=baseline.used;
          for(const upload of uploads) {
            const reserved=requireResult(await fixture.client.rpc('reserve_storage_upload',{
              _size_bytes:upload.bytes.length,_bucket:upload.bucket,_object_path:upload.path,_source_type:upload.source,
              _case_id:upload.caseId??null,_patient_id:upload.patientId??null,_original_name:upload.path.split('/')[1],_mime_type:upload.mime}),'FIXTURE_RESERVATION_FAILED') as any;
            upload.fileId=(Array.isArray(reserved)?reserved[0]:reserved)?.file_id;
            if(!upload.fileId) throw new FixtureFailure('FIXTURE_RESERVATION_MISSING');
            requireResult(await fixture.client.storage.from(upload.bucket).upload(upload.path,upload.bytes,{contentType:upload.mime,upsert:false}),'FIXTURE_UPLOAD_FAILED');upload.uploaded=true;
            const stable=`storage://${upload.bucket}/${upload.path}`;
            if(upload.source==='case_attachment') {
              const source=requireResult(await fixture.client.from('case_attachments').insert({case_id:clinical.caseId,file_name:'qa-fixture.stl',storage_path:upload.path,
                size_bytes:upload.bytes.length,mime_type:upload.mime,uploaded_by:fixture.user_id,kind:'other'}).select('id').single(),'FIXTURE_CASE_ATTACHMENT_FAILED');upload.sourceId=source.id;
            } else if(upload.source==='patient_attachment') {
              const source=requireResult(await fixture.client.from('patient_attachments').insert({patient_id:clinical.patientId,title:'QA fixture',kind:'other',file_url:stable,
                file_path:upload.path,size_bytes:upload.bytes.length,mime_type:upload.mime}).select('id').single(),'FIXTURE_PATIENT_ATTACHMENT_FAILED');upload.sourceId=source.id;
            } else if(upload.source==='patient_photo') {
              // The fixture is a case participant, not a clinical administrator.
              // Its disposable patient's reference was seeded during setup;
              // validate that the real user can read that exact private source.
              const patient=requireResult(await fixture.client.from('patients').select('photo_url').eq('id',clinical.patientId).single(),'FIXTURE_PATIENT_PHOTO_FAILED');
              if(patient.photo_url!==stable || stable!==clinical.photo) throw new FixtureFailure('FIXTURE_PATIENT_PHOTO_MISMATCH');
              upload.sourceId=clinical.patientId;
            } else {
              requireResult(await fixture.client.from('profiles').update({avatar_url:stable}).eq('id',fixture.user_id).select('id').single(),'FIXTURE_AVATAR_UPDATE_FAILED');upload.sourceId=fixture.user_id;
            }
            requireResult(await fixture.client.rpc('complete_storage_upload',{_file_id:upload.fileId,_source_id:upload.sourceId}),'FIXTURE_UPLOAD_COMPLETION_FAILED');upload.completed=true;
            const downloaded=requireResult(await fixture.client.storage.from(upload.bucket).download(upload.path),'FIXTURE_OWN_DOWNLOAD_FAILED');
            const bytes=new Uint8Array(await downloaded.arrayBuffer());
            expected+=upload.bytes.length;
            const measured=await usage(fixture);
            checks.push({check:`${upload.source}_real_upload_size`,passed:bytes.length===upload.bytes.length&&hash(bytes)===hash(upload.bytes)&&measured.used===expected,
              resource_id:upload.fileId,count:bytes.length});
            const denied=await foreign.client.storage.from(upload.bucket).download(upload.path);
            checks.push({check:`${upload.source}_foreign_download_denied`,passed:!!denied.error});
            const deniedReserve=await foreign.client.rpc('reserve_storage_upload',{_size_bytes:1,_bucket:upload.bucket,_object_path:upload.path+'-foreign',_source_type:upload.source,
              _case_id:upload.caseId??null,_patient_id:upload.patientId??null,_original_name:'foreign',_mime_type:upload.mime});
            checks.push({check:`${upload.source}_foreign_reservation_denied`,passed:!!deniedReserve.error});
            if(!deniedReserve.error) {
              const rows=deniedReserve.data as any;const id=(Array.isArray(rows)?rows[0]:rows)?.file_id;if(id) await foreign.client.rpc('cancel_storage_upload',{_file_id:id});
            }
            // Storage DELETE may return an empty success for an RLS-hidden
            // object. Verify the owner's exact bytes still exist afterwards.
            await foreign.client.storage.from(upload.bucket).remove([upload.path]);
            const preserved=requireResult(await fixture.client.storage.from(upload.bucket).download(upload.path),'FIXTURE_FOREIGN_DELETE_CHANGED_OBJECT');
            checks.push({check:`${upload.source}_foreign_delete_preserved`,passed:hash(new Uint8Array(await preserved.arrayBuffer()))===hash(upload.bytes)});
          }
          const foreignPatient=await foreign.client.from('patients').select('id').eq('id',clinical.patientId);
          const foreignCase=await foreign.client.from('cases').select('id').eq('id',clinical.caseId);
          checks.push({check:'populated_company_clinical_isolation',passed:!foreignPatient.error&&foreignPatient.data.length===0&&!foreignCase.error&&foreignCase.data.length===0});
        } finally {
          for(const upload of [...uploads].reverse()) {
            try {
              await cleanup(fixture,upload);
              if(upload.uploaded) {
                const gone=await fixture.client.storage.from(upload.bucket).download(upload.path);
                checks.push({check:`${upload.source}_real_delete`,passed:!!gone.error,resource_id:upload.fileId});
              }
            } catch(error) {checks.push({check:`${upload.source}_cleanup`,passed:false,code:error instanceof FixtureFailure?error.safeCode:'FIXTURE_CLEANUP_FAILED'});}
          }
          requireResult(await fixture.client.from('profiles').update({avatar_url:originals.avatar}).eq('id',fixture.user_id),'FIXTURE_AVATAR_RESTORE_FAILED');
          // Do not orphan bytes if an actual Storage deletion failed.
          const restored=await usage(fixture);
          if(restored.used!==baseline.used) throw new FixtureFailure('FIXTURE_STORAGE_CLEANUP_INCOMPLETE');
          checks.push({check:'clinical_fixture_cleanup',passed:await clinical.remove()});
          const final=await usage(fixture);
          checks.push({check:'authoritative_quota_restored',passed:final.used===baseline.used,count:final.used});
        }
      }
    });
  } catch(error) { checks.push({check:'storage_flow',passed:false,code:error instanceof FixtureFailure?error.safeCode:'FIXTURE_STORAGE_FLOW_FAILED',
    ...(error instanceof FixtureFailure&&error.httpStatus?{http_status:error.httpStatus}:{})}); }
  return checks;
}
