import {randomUUID} from 'node:crypto';
import {FixtureFailure,requireResult,type Check,type Job} from './fixture-acceptance.server';
import {withFixtureSessions} from './fixture-sessions.server';

type Model=Job['fixtures'][number]&{ids:Record<string,string>};
const domains=['component_categories','components','implant_component_types','implant_systems','implant_system_components','scan_jigs',
 'stock_items','stock_item_custom_fields','stock_consumption_rules','holders','burrs','burr_usages','resin_pots','resin_weighings',
 'cadistas','doctors','proteticos'] as const;

/** Trusted preparation touches only known job UUIDs. Authorization, reads,
 * consumption and denials use two actual USER sessions, with no role changes. */
export async function runFixtureCompanyOwnership(job:Job):Promise<Check[]> {
 const {supabaseAdmin:admin}=await import('@/integrations/supabase/client.server');
 const checks:Check[]=[];
 const models:Model[]=job.fixtures.map(f=>({...f,ids:Object.fromEntries([...domains,'patient','case','unexpected_stock'].map(t=>[t,randomUUID()]))}));
 const record=(check:string,passed:boolean)=>{checks.push({check,passed});if(!passed)throw new FixtureFailure(check.toUpperCase());};
 const seeded=new Set<string>();
 async function seed(table:string,values:object[]) {
  seeded.add(table); // target UUIDs are known even if the committed response is lost
  requireResult(await (admin as any).from(table).insert(values),`OWNERSHIP_${table.toUpperCase()}_SETUP_FAILED`);
 }
 const rows=(table:typeof domains[number],extra:(m:Model)=>object)=>models.map(m=>({id:m.ids[table],clinic_id:m.clinic_id,...extra(m)}));
 const label=(m:Model)=>`DentalFlow QA ${job.id} ${m.user_id}`;
 try {
  const existing=await (admin as any).from('stock_items').select('id',{count:'exact',head:true}).in('clinic_id',models.map(m=>m.clinic_id));
  record('ownership_fixtures_start_without_stock',!existing.error&&existing.count===0);
  await seed('patients',models.map(m=>({id:m.ids.patient,name:label(m),clinic_id:m.clinic_id})));
  await seed('cases',models.map(m=>({id:m.ids.case,patient_id:m.ids.patient,requested_by:null,status:'pendente',delivery_date:new Date(Date.now()+7*86400000).toISOString().slice(0,10)})));
  for(const m of models) requireResult(await admin.from('cases').update({requested_by:m.user_id}).eq('id',m.ids.case).eq('patient_id',m.ids.patient).is('requested_by',null),'OWNERSHIP_PARTICIPANT_SETUP_FAILED');
  await seed('component_categories',rows('component_categories',m=>({name:`QA ${job.id}`,position:9999})));
  await seed('components',rows('components',m=>({name:label(m),category:'QA'})));
  await seed('implant_component_types',rows('implant_component_types',m=>({name:label(m)})));
  await seed('implant_systems',rows('implant_systems',m=>({name:label(m)})));
  await seed('implant_system_components',rows('implant_system_components',m=>({name:label(m),implant_system_id:m.ids.implant_systems,component_type_id:m.ids.implant_component_types})));
  await seed('scan_jigs',rows('scan_jigs',m=>({name:label(m),implant_system_id:m.ids.implant_systems})));
  await seed('stock_items',rows('stock_items',m=>({name:label(m),category:'component',category_id:m.ids.component_categories,
   component_id:m.ids.components,implant_system_component_id:m.ids.implant_system_components,qty_on_hand:10,min_qty:0,unit:'un'})));
  await seed('stock_item_custom_fields',rows('stock_item_custom_fields',m=>({stock_item_id:m.ids.stock_items,key:'qa_job',value:job.id})));
  await seed('stock_consumption_rules',rows('stock_consumption_rules',m=>({stock_item_id:m.ids.stock_items,qty_per_tooth:1})));
  await seed('holders',rows('holders',m=>({name:label(m)})));
  await seed('burrs',rows('burrs',m=>({name:label(m),material:'zirconia',holder_id:m.ids.holders})));
  await seed('burr_usages',rows('burr_usages',m=>({burr_id:m.ids.burrs,case_id:m.ids.case,material:'zirconia',teeth_count:1})));
  await seed('resin_pots',rows('resin_pots',m=>({name:label(m),stock_item_id:m.ids.stock_items,tare_g:100,declared_net_g:80,created_by:m.user_id})));
  await seed('resin_weighings',rows('resin_weighings',m=>({pot_id:m.ids.resin_pots,gross_g:90,net_g:0,created_by:m.user_id})));
  for(const table of ['cadistas','doctors','proteticos'] as const) await seed(table,rows(table,m=>({name:label(m),user_id:m.user_id})));

  await withFixtureSessions(job,async sessions=>{
   for(const actor of sessions) {
    const own=models.find(m=>m.user_id===actor.user_id)!,other=models.find(m=>m.user_id!==actor.user_id)!;
    const foreign=sessions.find(s=>s.user_id!==actor.user_id)!;
    const role=await actor.client.rpc('saas_company_can_manage_stock' as any,{_clinic:own.clinic_id});
    record('ownership_real_user_not_inventory_manager',!role.error&&role.data===false);
    const balance=async(m:Model,client=actor.client)=>requireResult(await (client as any).from('stock_items').select('id,clinic_id,qty_on_hand,name')
     .eq('id',m.ids.stock_items).single(),'OWNERSHIP_BALANCE_READ_FAILED') as any;
    const before=await balance(own),foreignBefore=await balance(other,foreign.client);
    for(const table of domains) {
     const actual=await (actor.client as any).from(table).select('id,clinic_id').in('id',[own.ids[table],other.ids[table]]);
     record(`company_${table}_isolation`,!actual.error&&actual.data?.length===1&&actual.data[0].id===own.ids[table]&&actual.data[0].clinic_id===own.clinic_id);
    }
    const profiles=await actor.client.from('profiles').select('id').eq('id',other.user_id);
    record('company_foreign_profile_hidden',!profiles.error&&profiles.data?.length===0);
    const denied=await actor.client.from('stock_items').insert({id:own.ids.unexpected_stock,name:label(own),category:'component',clinic_id:other.clinic_id} as never);
    record('company_stock_owner_spoof_denied',denied.error?.code==='42501');
    await actor.client.from('stock_items').update({qty_on_hand:999}).eq('id',other.ids.stock_items);
    await actor.client.from('stock_items').delete().eq('id',other.ids.stock_items);
    const foreignAfter=await balance(other,foreign.client);
    record('company_foreign_stock_preserved',JSON.stringify(foreignAfter)===JSON.stringify(foreignBefore));
    const bad=await actor.client.rpc('register_case_implant_tooth' as any,{_case_id:own.ids.case,_tooth_fdi:11,_stock_item_id:other.ids.stock_items});
    record('company_definer_foreign_stock_denied',bad.error?.code==='42501');
    record('company_denied_rpc_preserves_both_balances',(await balance(own)).qty_on_hand===before.qty_on_hand&&(await balance(other,foreign.client)).qty_on_hand===foreignBefore.qty_on_hand);
    const used=requireResult(await actor.client.rpc('register_case_implant_tooth' as any,{_case_id:own.ids.case,_tooth_fdi:11,_stock_item_id:own.ids.stock_items}),'OWNERSHIP_OWN_CONSUMPTION_FAILED') as any;
    record('company_own_case_consumes_own_stock',used?.success===true&&typeof used.id==='string'&&(await balance(own)).qty_on_hand===9);
    const usage=await (actor.client as any).from('case_implant_teeth').select('id,clinic_id').eq('id',used.id).single();
    record('company_usage_inherits_owner',!usage.error&&usage.data?.clinic_id===own.clinic_id);
    const undone=requireResult(await actor.client.rpc('remove_case_implant_tooth' as any,{_id:used.id}),'OWNERSHIP_REVERSAL_FAILED') as any;
    const again=requireResult(await actor.client.rpc('remove_case_implant_tooth' as any,{_id:used.id}),'OWNERSHIP_REPEATED_REVERSAL_FAILED') as any;
    record('company_reversal_restores_balance_once',undone?.success===true&&again?.success===true&&(await balance(own)).qty_on_hand===10);
    const movements=await actor.client.from('stock_movements').select('id,clinic_id').eq('stock_item_id',own.ids.stock_items);
    record('company_movements_inherit_owner',!movements.error&&movements.data?.length===2&&movements.data.every((r:any)=>r.clinic_id===own.clinic_id));
    const hidden=await actor.client.from('stock_movements').select('id').eq('stock_item_id',other.ids.stock_items);
    record('company_foreign_movements_hidden',!hidden.error&&hidden.data?.length===0);
   }
  });
 } catch(error) {
  checks.push({check:'company_ownership_flow',passed:false,code:error instanceof FixtureFailure?error.safeCode:'OWNERSHIP_EXECUTION_FAILED'});
 } finally {
  // Delete only UUIDs allocated before this job's requests. No company, Auth
  // identity, subscription, existing item or historical clinical record is deleted.
  let clean=true;
  try {
   if(seeded.has('cases')) requireResult(await admin.from('cases').delete().in('id',models.map(m=>m.ids.case)).in('patient_id',models.map(m=>m.ids.patient)),'OWNERSHIP_CASE_CLEANUP_FAILED');
   for(const table of [...domains].reverse()) {
    const ids=models.map(m=>m.ids[table]);if(table==='stock_items')ids.push(...models.map(m=>m.ids.unexpected_stock));
    if(!seeded.has(table)&&table!=='stock_items')continue;
    requireResult(await (admin as any).from(table).delete().in('id',ids).in('clinic_id',models.map(m=>m.clinic_id)),'OWNERSHIP_RESOURCE_CLEANUP_FAILED');
    const left=await (admin as any).from(table).select('id').in('id',ids);clean=clean&&!left.error&&left.data?.length===0;
   }
   if(seeded.has('patients')) requireResult(await admin.from('patients').delete().in('id',models.map(m=>m.ids.patient)).in('clinic_id',models.map(m=>m.clinic_id)),'OWNERSHIP_PATIENT_CLEANUP_FAILED');
   const cases=await admin.from('cases').select('id').in('id',models.map(m=>m.ids.case));
   const patients=await admin.from('patients').select('id').in('id',models.map(m=>m.ids.patient));
   clean=clean&&!cases.error&&cases.data?.length===0&&!patients.error&&patients.data?.length===0;
  } catch {clean=false;}
  checks.push({check:'company_ownership_fixture_cleanup',passed:clean});
 }
 return checks;
}
