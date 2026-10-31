import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
import {AsaasClient,AsaasApiError} from '@/lib/billing/asaas.server';
import {FixtureFailure,requireResult,type Check,type Job} from './fixture-acceptance.server';
import {loadIsolatedSandboxConfig} from './fixture-reconciliation.server';
import {withFixtureSessions,type FixtureSession} from './fixture-sessions.server';

const company='3fc86c40-697e-4725-a9e9-633fc882aadc';
const owner='24e7cdf9-457e-4af2-b1cb-cf366abbddb0';
const target='company_initial';
const contractSchema=z.object({id:z.string().uuid(),clinic_id:z.literal(company),scope_type:z.literal('company'),
 provider_environment:z.literal('sandbox'),billing_provider:z.literal('asaas'),billing_cycle:z.literal('MONTHLY'),
 plan_code:z.literal('company_growth'),status:z.literal('active'),
 external_subscription_id:z.string().regex(/^sub_[A-Za-z0-9]+$/),external_customer_id:z.string().regex(/^cus_[A-Za-z0-9]+$/),
 current_period_start:z.string().datetime({offset:true}),current_period_end:z.string().datetime({offset:true})});
type Dependencies={provider:Pick<AsaasClient,'getCustomer'|'getSubscription'|'listPaymentsForReconciliation'>;
 readContract:()=>Promise<unknown>;readLedger:()=>Promise<any[]>;readPrices:(id:string)=>Promise<any>;readAudit:(id:string)=>Promise<any[]>;
 sessions:(run:(sessions:FixtureSession[])=>Promise<void>)=>Promise<void>};
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function dependencies(job:Job):Promise<Dependencies>{
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const admin=supabaseAdmin as SupabaseClient;
 return {provider:new AsaasClient({...loadIsolatedSandboxConfig(),minRequestIntervalMs:500}),
  readContract:async()=>requireResult(await admin.from('account_subscriptions').select('*').eq('clinic_id',company).single(),'FIXTURE_PLAN_CONTRACT_READ_FAILED'),
  readLedger:async()=>requireResult(await admin.from('billing_payments').select('*').eq('clinic_id',company).order('id'),'FIXTURE_PLAN_LEDGER_READ_FAILED') as any[],
  readPrices:async id=>requireResult(await admin.rpc('billing_subscription_price_context',{p_subscription_id:id}),'FIXTURE_PLAN_PRICE_READ_FAILED'),
  readAudit:async id=>requireResult(await admin.from('billing_plan_change_executions').select('outcome,provider_write_started_at,provider_proof_hash,invoice_digest,invoice_count')
   .eq('request_id',id).order('created_at'),'FIXTURE_PLAN_AUDIT_READ_FAILED') as any[],
  sessions:run=>withFixtureSessions(job,run)};
}

/** Fixed fixture B, Sandbox, Growth -> Initial. Only provider GETs and one
 * normal customer request, if eligible. No financial executor, MFA/role edit,
 * invoice generation/deletion, calendar change, payment or clock override. */
export async function runFixturePlanChange(job:Job,injected?:Dependencies):Promise<Check[]>{
 const checks:Check[]=[];const runtime=process.env.ASAAS_ENVIRONMENT;
 const record=(check:string,passed:boolean,extra:Partial<Check>={})=>{
  checks.push({check,passed,...extra});if(!passed)throw new FixtureFailure('FIXTURE_PLAN_CHECK_FAILED');};
 try{
  if(job.kind!=='plan_change'||job.fixtures.filter(f=>f.user_id===owner&&f.clinic_id===company).length!==1)
   throw new FixtureFailure('FIXTURE_PLAN_SCOPE_INVALID');
  const deps=injected??await dependencies(job);const c=contractSchema.parse(await deps.readContract());
  record('fixed_sandbox_growth_contract',Date.parse(c.current_period_end)>Date.now()
   &&Date.parse(c.current_period_start)<Date.parse(c.current_period_end)
   &&new Date(c.current_period_end).toISOString().endsWith('T00:00:00.000Z'),{resource_id:c.id,period_end:c.current_period_end});
  const ledger=await deps.readLedger();const ledgerHash=digest(ledger);
  record('paid_ledger_snapshot',ledger.length>=2&&ledger.every(p=>p.subscription_id===c.id&&p.clinic_id===company
   &&p.provider==='asaas'&&p.provider_environment==='sandbox'&&p.amount_cents===44900&&p.status==='paid'),{count:ledger.length,digest:ledgerHash});
  const pricing=await deps.readPrices(c.id);
  const effective=new Date(c.current_period_end).toISOString().slice(0,10);
  const scheduled=Array.isArray(pricing?.periods)&&pricing.periods.length===1
   &&pricing.periods[0].effective_date===effective&&Number.isInteger(pricing.periods[0].amount_cents)
   &&pricing.periods[0].amount_cents>=500&&pricing.periods[0].amount_cents<44900
   &&pricing.provider_amount_cents===pricing.periods[0].amount_cents;
  record('price_context_consistent',scheduled||(pricing?.provider_amount_cents===44900&&Array.isArray(pricing.periods)&&pricing.periods.length===0));
  const customer=await deps.provider.getCustomer(c.external_customer_id);
  record('sandbox_delivery_disabled',customer.id===c.external_customer_id&&customer.externalReference===`dentalflow:company:${company}`
   &&customer.deleted===false&&customer.notificationDisabled===true);
  const subscription=await deps.provider.getSubscription(c.external_subscription_id);
  record('provider_contract_verified',subscription.id===c.external_subscription_id&&subscription.customer===c.external_customer_id
   &&subscription.externalReference===`dentalflow:subscription:${c.id}`&&subscription.value===pricing.provider_amount_cents/100&&subscription.cycle==='MONTHLY'
   &&subscription.deleted===false&&subscription.status==='ACTIVE');
  record('provider_calendar_read',/^\d{4}-\d{2}-\d{2}$/.test(subscription.nextDueDate??''),{state:subscription.nextDueDate});
  const invoices=await deps.provider.listPaymentsForReconciliation(c.external_subscription_id,'2000-01-01');
  record('complete_provider_invoice_snapshot',invoices.length>=2&&new Set(invoices.map(p=>p.id)).size===invoices.length
   &&invoices.every(p=>/^pay_[A-Za-z0-9]+$/.test(p.id)&&p.customer===c.external_customer_id&&p.subscription===c.external_subscription_id
    &&p.deleted===false&&p.value===449&&/^\d{4}-\d{2}-\d{2}$/.test(p.dueDate??'')&&!!p.status),
   {count:invoices.length,digest:digest(invoices.map(p=>({id:p.id,value:p.value,dueDate:p.dueDate,status:p.status,deleted:p.deleted})).sort((a,b)=>a.id.localeCompare(b.id)))});
  await deps.sessions(async sessions=>{
   const actor=sessions.find(f=>f.user_id===owner&&f.clinic_id===company);const foreign=sessions.find(f=>f.clinic_id!==company);
   if(!actor||!foreign)throw new FixtureFailure('FIXTURE_PLAN_SESSION_SCOPE_INVALID');
   const context=requireResult(await actor.client.rpc('billing_company_change_context',{p_clinic_id:company}),'FIXTURE_PLAN_CONTEXT_FAILED') as any;
   const quote=Array.isArray(context?.plan_quotes)?context.plan_quotes.find((q:any)=>q.target_plan_code===target):null;
   record('authenticated_customer_downgrade_quote',context?.clinic_id===company&&quote?.kind==='change_plan'
    &&quote.subscription_id===c.id&&quote.current_plan_code===c.plan_code&&quote.current_amount_cents===44900&&quote.currency==='BRL'
    &&quote.provider_environment==='sandbox'&&Number.isInteger(quote.target_amount_cents)&&quote.target_amount_cents>=500
    &&quote.target_amount_cents<44900&&typeof quote.target_plan_name==='string'
    &&Date.parse(quote.paid_period_end)===Date.parse(c.current_period_end)&&/^[a-f0-9]{32}$/.test(quote.quote_token??''),
    {amount_cents:quote?.target_amount_cents,period_end:quote?.paid_period_end});
   const denied=await foreign.client.rpc('billing_company_change_context',{p_clinic_id:company});
   record('foreign_company_quote_denied',!!denied.error);
   const existing=context.requests;
   record('request_history_unambiguous',Array.isArray(existing)&&existing.length<=1&&existing.every((r:any)=>r.kind==='change_plan'
    &&r.subscription_id===c.id&&r.provider_environment==='sandbox'&&r.target_amount_cents===quote.target_amount_cents
    &&r.target_plan_name===quote.target_plan_name&&r.current_amount_cents===44900));
   const access=requireResult(await actor.client.rpc('my_subscription_context'),'FIXTURE_PLAN_ACCESS_READ_FAILED') as any;
   record('paid_access_preserved',access.active_clinic_id===company&&access.effective_access==='full'
    &&access.company?.subscription_id===c.id&&access.company?.access_mode==='full');
   if(existing.length){
    record('existing_customer_request',z.string().uuid().safeParse(existing[0]?.id).success,{resource_id:existing[0]?.id,state:existing[0]?.status});
    if(scheduled||existing[0].status==='completed'){
     record('scheduled_term_matches_completed_request',scheduled&&existing[0].status==='completed'
      &&pricing.provider_amount_cents===existing[0].target_amount_cents&&Date.parse(existing[0].paid_period_end)===Date.parse(c.current_period_end));
     const audit=await deps.readAudit(existing[0].id);
     record('master_single_write_and_confirmed_audit',audit.length>=1&&audit.filter(e=>e.provider_write_started_at).length===1
      &&audit.some(e=>e.outcome==='completed'&&/^[a-f0-9]{32}$/.test(e.provider_proof_hash??'')
       &&/^[a-f0-9]{64}$/.test(e.invoice_digest??'')&&Number.isInteger(e.invoice_count)),{count:audit.length});
     record('provider_future_price_and_calendar',subscription.value===existing[0].target_amount_cents/100&&subscription.nextDueDate===effective,
      {amount_cents:existing[0].target_amount_cents,state:subscription.nextDueDate});
     record('paid_plan_not_applied_early',access.company?.plan_code==='company_growth'&&access.company?.monthly_price_cents===44900
      &&Date.parse(c.current_period_end)>Date.now());
     record('plan_change_phase',true,{state:'COMPLETED_SCHEDULED'});return;
    }
    record('plan_change_phase',true,{state:'EXISTING_REQUEST_REQUIRES_MASTER_REVIEW'});return;
   }
   record('scheduled_term_has_completed_request',!scheduled);
   if(quote.block_reason!==null){
    record('customer_quote_guard',typeof quote.block_reason==='string'&&['storage_limit','member_limit','session_limit','paid_period_required','scheduled_change'].includes(quote.block_reason),{state:quote.block_reason});
    record('plan_change_phase',true,{state:'BLOCKED_CUSTOMER_LIMITS'});return;
   }
   if(subscription.nextDueDate!==effective){
    record('provider_calendar_guard',true,{period_end:c.current_period_end,state:subscription.nextDueDate});
    record('plan_change_phase',true,{state:'BLOCKED_PROVIDER_CALENDAR'});return;
   }
   const future=invoices.filter(p=>p.dueDate! >= effective);
   if(future.length){
    record('issued_future_invoice_guard',true,{count:future.length,period_end:c.current_period_end});
    record('plan_change_phase',true,{state:'BLOCKED_FUTURE_INVOICE'});return;
   }
   // One authenticated submission. On ambiguity stop; another job reads the
   // customer's existing history first and never repeats a financial write.
   const r=requireResult(await actor.client.rpc('billing_submit_change_request',{p_clinic_id:company,p_subscription_id:c.id,
    p_kind:'change_plan',p_target_plan_code:target,p_quote_token:quote.quote_token}),'FIXTURE_PLAN_SUBMIT_UNCONFIRMED') as any;
   record('authenticated_customer_request',z.string().uuid().safeParse(r?.id).success&&r.kind==='change_plan'&&r.status==='awaiting_provider'
    &&r.subscription_id===c.id&&r.provider_environment==='sandbox'&&r.current_amount_cents===44900
    &&r.target_amount_cents===quote.target_amount_cents&&r.target_plan_name===quote.target_plan_name
    &&Date.parse(r.paid_period_end)===Date.parse(c.current_period_end),{resource_id:r?.id,state:r?.status});
   record('plan_change_phase',true,{state:'AWAITING_MASTER'});
  });
  record('ledger_unchanged_during_preparation',ledgerHash===digest(await deps.readLedger()),{digest:ledgerHash});
  record('contract_unchanged_during_preparation',digest(c)===digest(contractSchema.parse(await deps.readContract())));
 }catch(error){checks.push({check:'fixture_plan_change_flow',passed:false,
  code:error instanceof FixtureFailure?error.safeCode:error instanceof AsaasApiError?'FIXTURE_PLAN_PROVIDER_UNAVAILABLE':'FIXTURE_PLAN_FLOW_FAILED',
  ...(error instanceof AsaasApiError&&error.status?{http_status:error.status}:{})});}
 checks.push({check:'global_environment_unchanged',passed:runtime===process.env.ASAAS_ENVIRONMENT});
 return checks;
}
