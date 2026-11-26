import {randomUUID} from 'node:crypto';
import {FixtureFailure,requireResult,type Check,type Job} from './fixture-acceptance.server';
import {withFixtureSessions} from './fixture-sessions.server';

/** Only fixed USER fixtures. Manager/version-publishing proofs remain isolated
 * SQL rehearsals; this job never promotes a user or edits IPO definitions. */
export async function runFixtureConfiguration(job:Job):Promise<Check[]> {
 const {supabaseAdmin:admin}=await import('@/integrations/supabase/client.server');
 const models=job.fixtures.map(f=>({...f,ids:Object.fromEntries(['phase','stage','stage_assignment','phase_assignment','reason','patient','case','spoof','case_type','color'].map(k=>[k,randomUUID()]))}));
 const checks:Check[]=[];const seeded=new Set<string>();
 const record=(check:string,passed:boolean)=>{checks.push({check,passed});if(!passed)throw new FixtureFailure(check.toUpperCase());};
 async function seed(table:string,rows:object[]) {seeded.add(table);requireResult(await (admin as any).from(table).insert(rows),'CONFIGURATION_SETUP_FAILED');}
 try {
  await seed('patients',models.map(m=>({id:m.ids.patient,name:`DentalFlow QA ${job.id}`,clinic_id:m.clinic_id})));
  await seed('cases',models.map(m=>({id:m.ids.case,patient_id:m.ids.patient,requested_by:null,status:'pendente',delivery_date:new Date(Date.now()+7*86400000).toISOString().slice(0,10)})));
  for(const m of models)requireResult(await admin.from('cases').update({requested_by:m.user_id}).eq('id',m.ids.case).eq('patient_id',m.ids.patient).is('requested_by',null),'CONFIGURATION_PARTICIPANT_FAILED');
  await seed('phases',models.map(m=>({id:m.ids.phase,name:`QA ${job.id}`,position:9000,clinic_id:m.clinic_id})));
  await seed('stages',models.map(m=>({id:m.ids.stage,name:`QA ${job.id}`,position:9000,clinic_id:m.clinic_id,phase_id:m.ids.phase,flow_key:'common',workflow_version:1,stage_key:`qa_${job.id}`})));
  await seed('stage_assignments',models.map(m=>({id:m.ids.stage_assignment,stage_id:m.ids.stage,user_id:m.user_id,clinic_id:m.clinic_id})));
  await seed('phase_assignments',models.map(m=>({id:m.ids.phase_assignment,phase_id:m.ids.phase,user_id:m.user_id,clinic_id:m.clinic_id})));
  await seed('stage_return_reasons',models.map(m=>({id:m.ids.reason,label:`QA ${job.id}`,position:9000,clinic_id:m.clinic_id})));
  await withFixtureSessions(job,async sessions=>{
   for(const actor of sessions) {
    const own=models.find(m=>m.user_id===actor.user_id)!,other=models.find(m=>m.user_id!==actor.user_id)!;
    const manager=await actor.client.rpc('current_user_can_manage_workflow' as any);
    record('configuration_actual_user_not_manager',!manager.error&&manager.data===false);
    for(const [table,key] of [['phases','phase'],['stages','stage'],['stage_assignments','stage_assignment'],['phase_assignments','phase_assignment'],['stage_return_reasons','reason']] as const) {
     const r=await (actor.client as any).from(table).select('id,clinic_id').in('id',[own.ids[key],other.ids[key]]);
     record(`configuration_${table}_isolation`,!r.error&&r.data?.length===1&&r.data[0].id===own.ids[key]&&r.data[0].clinic_id===own.clinic_id);
    }
    for(const [table,n] of [['workflow_templates',4],['workflow_settings',1]] as const) {
     const ownRows=await (actor.client as any).from(table).select('clinic_id').eq('clinic_id',own.clinic_id);
     const foreignRows=await (actor.client as any).from(table).select('clinic_id').eq('clinic_id',other.clinic_id);
     record(`configuration_${table}_isolation`,!ownRows.error&&ownRows.data?.length===n&&!foreignRows.error&&foreignRows.data?.length===0);
    }
    const spoof=await (actor.client as any).from('phases').insert({id:own.ids.spoof,name:`QA ${job.id}`,position:9001,clinic_id:other.clinic_id});
    record('configuration_company_spoof_denied',spoof.error?.code==='42501');
    const settings=await actor.client.rpc('update_company_workflow_settings' as any,{_patch:{progress_bar_enabled:false}});
    record('configuration_settings_require_manager',settings.error?.code==='42501');
    const save=await actor.client.rpc('save_workflow_template' as any,{_flow_key:'common',_stages:[{name:'QA entry',stage_key:'entry'},{name:'QA next',stage_key:'cad'}],_apply_open:true});
    record('configuration_template_requires_manager',!save.error&&(save.data as any)?.success===false);
    const reset=await actor.client.rpc('reset_default_workflows' as any,{_apply_open:true});
    record('configuration_reset_requires_manager',!reset.error&&(reset.data as any)?.success===false);
    const ct=await (actor.client as any).from('case_types').insert({id:own.ids.case_type,name:`QA ${job.id}`});
    record('configuration_shared_case_types_read_only',ct.error?.code==='42501');
    const color=await (actor.client as any).from('tooth_colors').insert({id:own.ids.color,code:`QA ${job.id}`});
    record('configuration_shared_colors_read_only',color.error?.code==='42501');
    const foreignCase=await actor.client.rpc('advance_case_workflow' as any,{_case_id:other.ids.case,_stage_id:other.ids.stage});
    record('configuration_foreign_case_rpc_denied',foreignCase.error?.code==='42501');
    const baseline=requireResult(await actor.client.from('cases').select('current_stage_id,workflow_version').eq('id',own.ids.case).single(),'CONFIGURATION_CASE_READ_FAILED');
    const cross=await actor.client.rpc('advance_case_workflow' as any,{_case_id:own.ids.case,_stage_id:other.ids.stage});
    record('configuration_foreign_stage_rpc_denied',!cross.error&&(cross.data as any)?.success===false);
    const unchanged=requireResult(await actor.client.from('cases').select('current_stage_id,workflow_version').eq('id',own.ids.case).single(),'CONFIGURATION_CASE_READ_FAILED');
    record('configuration_denial_preserves_case',JSON.stringify(unchanged)===JSON.stringify(baseline));
    const moved=requireResult(await actor.client.rpc('advance_case_workflow' as any,{_case_id:own.ids.case,_stage_id:own.ids.stage}),'CONFIGURATION_OWN_ADVANCE_FAILED') as any;
    record('configuration_authorized_user_advances_own_case',moved?.success===true&&moved.stage_id===own.ids.stage);
    const badReason=await actor.client.rpc('return_case_workflow' as any,{_case_id:own.ids.case,_reason_id:other.ids.reason,_to_stage_id:baseline.current_stage_id});
    record('configuration_foreign_reason_denied',badReason.error?.code==='42501');
    const returned=requireResult(await actor.client.rpc('return_case_workflow' as any,{_case_id:own.ids.case,_reason_id:own.ids.reason,_to_stage_id:baseline.current_stage_id}),'CONFIGURATION_OWN_RETURN_FAILED') as any;
    record('configuration_authorized_user_returns_own_case',returned?.success===true&&returned.stage_id===baseline.current_stage_id);
   }
  });
 } catch(error) {checks.push({check:'configuration_flow',passed:false,code:error instanceof FixtureFailure?error.safeCode:'CONFIGURATION_EXECUTION_FAILED'});}
 finally {
  let clean=true;
  try {
   if(seeded.has('cases'))requireResult(await admin.from('cases').delete().in('id',models.map(m=>m.ids.case)).in('patient_id',models.map(m=>m.ids.patient)),'CONFIGURATION_CASE_CLEANUP_FAILED');
   for(const [table,key] of [['stage_assignments','stage_assignment'],['phase_assignments','phase_assignment'],['stages','stage'],['phases','phase'],['stage_return_reasons','reason']] as const) {
    const ids=models.map(m=>m.ids[key]);if(table==='phases')ids.push(...models.map(m=>m.ids.spoof));
    if(seeded.has(table)||table==='phases')requireResult(await (admin as any).from(table).delete().in('id',ids).in('clinic_id',models.map(m=>m.clinic_id)),'CONFIGURATION_RESOURCE_CLEANUP_FAILED');
    const left=await (admin as any).from(table).select('id').in('id',ids);clean=clean&&!left.error&&left.data?.length===0;
   }
   // Only allocated UUIDs, in case a denial check exposed a regression.
   for(const [table,key] of [['case_types','case_type'],['tooth_colors','color']] as const) {
    requireResult(await (admin as any).from(table).delete().in('id',models.map(m=>m.ids[key])),'CONFIGURATION_DICTIONARY_CLEANUP_FAILED');
   }
   if(seeded.has('patients'))requireResult(await admin.from('patients').delete().in('id',models.map(m=>m.ids.patient)).in('clinic_id',models.map(m=>m.clinic_id)),'CONFIGURATION_PATIENT_CLEANUP_FAILED');
   for(const [table,key] of [['cases','case'],['patients','patient']] as const) {
    const left=await admin.from(table).select('id').in('id',models.map(m=>m.ids[key]));clean=clean&&!left.error&&left.data?.length===0;
   }
  } catch {clean=false;}
  checks.push({check:'configuration_fixture_cleanup',passed:clean});
 }
 return checks;
}
