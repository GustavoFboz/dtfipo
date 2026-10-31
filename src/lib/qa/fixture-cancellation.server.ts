import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
import {AsaasClient,AsaasApiError,type AsaasPayment,type AsaasSubscription} from '@/lib/billing/asaas.server';
import {FixtureFailure,requireResult,type Check,type Job} from './fixture-acceptance.server';
import {loadIsolatedSandboxConfig} from './fixture-reconciliation.server';
import {fixtureAppPost,withFixtureSessions,type FixtureSession} from './fixture-sessions.server';

const company='081d3db4-1606-40f7-a878-19b51556317d';
const owner='ee083f63-1621-4b82-b7a4-fd13427c0b14';
const contractSchema=z.object({id:z.string().uuid(),clinic_id:z.literal(company),scope_type:z.literal('company'),
 provider_environment:z.literal('sandbox'),billing_provider:z.literal('asaas'),billing_cycle:z.literal('MONTHLY'),
 plan_code:z.literal('company_growth'),status:z.enum(['active','canceled']),
 external_subscription_id:z.string().regex(/^sub_[A-Za-z0-9]+$/),external_customer_id:z.string().regex(/^cus_[A-Za-z0-9]+$/),
 current_period_start:z.string().datetime({offset:true}),current_period_end:z.string().datetime({offset:true})});
type Contract=z.infer<typeof contractSchema>;
type Dependencies={provider:Pick<AsaasClient,'getCustomer'|'getSubscription'|'listPaymentsForReconciliation'>;
 readContract:()=>Promise<unknown>;readLedger:()=>Promise<unknown[]>;
 readAudit:(id:string)=>Promise<any[]>;
 readPrices:(id:string)=>Promise<any>;
 sessions:(run:(sessions:FixtureSession[])=>Promise<void>)=>Promise<void>;
 post:typeof fixtureAppPost};
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** All invoices in a single complete bounded page, with no links or fiscal data
 * in the receipt. The fixed fixtures were created after 2000-01-01. */
export function cancellationInvoiceDigest(payments:AsaasPayment[],contract:Contract):string {
 if(payments.length<2||new Set(payments.map(p=>p.id)).size!==payments.length
  ||payments.some(p=>!/^pay_[A-Za-z0-9]+$/.test(p.id)||p.customer!==contract.external_customer_id
   ||p.subscription!==contract.external_subscription_id||p.deleted!==false||p.value!==449
   ||!/^\d{4}-\d{2}-\d{2}$/.test(p.dueDate??'')||!p.status))
  throw new FixtureFailure('FIXTURE_CANCEL_INVOICES_MISMATCH');
 return digest(payments.map(p=>({id:p.id,customer:p.customer,subscription:p.subscription,value:p.value,
  dueDate:p.dueDate,status:p.status,deleted:p.deleted,billingType:p.billingType})).sort((a,b)=>a.id.localeCompare(b.id)));
}
function verifyProvider(value:AsaasSubscription,c:Contract){
 if(value.id!==c.external_subscription_id||value.customer!==c.external_customer_id||value.value!==449
  ||value.externalReference!==`dentalflow:subscription:${c.id}`||value.cycle!=='MONTHLY'||value.deleted!==false
  ||value.status!==(c.status==='canceled'?'INACTIVE':'ACTIVE'))throw new FixtureFailure('FIXTURE_CANCEL_PROVIDER_MISMATCH');
}
async function dependencies(job:Job):Promise<Dependencies>{
 const config=loadIsolatedSandboxConfig();
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const admin=supabaseAdmin as SupabaseClient;
 const readContract=async()=>requireResult(await admin.from('account_subscriptions').select('*').eq('clinic_id',company).single(),'FIXTURE_CANCEL_CONTRACT_READ_FAILED');
 return {provider:new AsaasClient({...config,minRequestIntervalMs:500}),readContract,
  readLedger:async()=>requireResult(await admin.from('billing_payments').select('*').eq('clinic_id',company).order('id'),'FIXTURE_CANCEL_LEDGER_READ_FAILED') as any[],
  readAudit:async id=>requireResult(await admin.from('billing_cancel_executions').select('outcome,provider_write_started_at,provider_proof_hash,reconcile_only')
   .eq('request_id',id).order('created_at'),'FIXTURE_CANCEL_AUDIT_READ_FAILED') as any[],
  readPrices:async id=>requireResult(await admin.rpc('billing_subscription_price_context',{p_subscription_id:id}),'FIXTURE_CANCEL_PRICE_CONTEXT_FAILED'),
  sessions:run=>withFixtureSessions(job,run),post:fixtureAppPost};
}

/** Prepares the normal customer request OR observes its completed outcome.
 * There is deliberately no Master credential, synthetic MFA, provider mutation,
 * worker replay or automatic cancellation in this test job. */
export async function runFixtureCancellation(job:Job,injected?:Dependencies):Promise<Check[]>{
 const checks:Check[]=[];const runtime=process.env.ASAAS_ENVIRONMENT;
 const record=(check:string,passed:boolean,extra:Partial<Check>={})=>{
  checks.push({check,passed,...extra});if(!passed)throw new FixtureFailure('FIXTURE_CANCEL_CHECK_FAILED');};
 try{
  if(job.kind!=='cancellation'||job.fixtures.filter(f=>f.user_id===owner&&f.clinic_id===company).length!==1)
   throw new FixtureFailure('FIXTURE_CANCEL_SCOPE_INVALID');
  const deps=injected??await dependencies(job);
  const c=contractSchema.parse(await deps.readContract());
  record('fixed_sandbox_paid_contract',Date.parse(c.current_period_end)>Date.now()&&Date.parse(c.current_period_start)<Date.parse(c.current_period_end),{resource_id:c.id,period_end:c.current_period_end});
  const ledger=await deps.readLedger();const ledgerHash=digest(ledger);
  record('paid_ledger_snapshot',ledger.length>=2&&ledger.every((p:any)=>p.subscription_id===c.id&&p.clinic_id===company
   &&p.provider==='asaas'&&p.provider_environment==='sandbox'&&p.amount_cents===44900&&p.status==='paid'),{count:ledger.length,digest:ledgerHash});
  const customer=await deps.provider.getCustomer(c.external_customer_id);
  record('sandbox_delivery_disabled',customer.id===c.external_customer_id&&customer.externalReference===`dentalflow:company:${company}`
   &&customer.deleted===false&&customer.notificationDisabled===true);
  const subscription=await deps.provider.getSubscription(c.external_subscription_id);verifyProvider(subscription,c);
  record('provider_contract_verified',true,{state:subscription.status,amount_cents:44900});
  const pricing=await deps.readPrices(c.id);
  record('period_price_context_preserves_fixture_contract',pricing?.provider_amount_cents===44900&&Array.isArray(pricing.periods)&&pricing.periods.length===0);
  const invoices=await deps.provider.listPaymentsForReconciliation(c.external_subscription_id,'2000-01-01');
  record('provider_invoice_snapshot',true,{count:invoices.length,digest:cancellationInvoiceDigest(invoices,c)});
  await deps.sessions(async sessions=>{
   const actor=sessions.find(f=>f.user_id===owner&&f.clinic_id===company);
   const foreign=sessions.find(f=>f.clinic_id!==company);
   if(!actor||!foreign)throw new FixtureFailure('FIXTURE_CANCEL_SESSION_SCOPE_INVALID');
   const context=requireResult(await actor.client.rpc('billing_company_change_context',{p_clinic_id:company}),'FIXTURE_CANCEL_CONTEXT_FAILED') as any;
   const existing=context.requests??[];
   record('request_history_unambiguous',Array.isArray(existing)&&existing.length<=1&&existing.every((r:any)=>r.kind==='cancel'
    &&r.subscription_id===c.id&&r.provider_environment==='sandbox'&&r.current_amount_cents===44900));
   let request=existing[0];
   if(!request){
    const q=context.cancellation_quote;
    record('fresh_customer_quote',c.status==='active'&&q?.subscription_id===c.id&&q.provider_environment==='sandbox'
     &&q.kind==='cancel'&&q.current_plan_code===c.plan_code&&q.current_amount_cents===44900&&q.block_reason===null
     &&Date.parse(q.paid_period_end)===Date.parse(c.current_period_end)&&typeof q.quote_token==='string');
    // One normal authenticated submission. On ambiguity the job stops; a later
    // run reads the customer's history first, rather than blindly submitting.
    request=requireResult(await actor.client.rpc('billing_submit_change_request',{p_clinic_id:company,p_subscription_id:c.id,
     p_kind:'cancel',p_target_plan_code:null,p_quote_token:q.quote_token}),'FIXTURE_CANCEL_SUBMIT_UNCONFIRMED') as any;
   }
   record('authenticated_customer_request',z.string().uuid().safeParse(request?.id).success&&request.kind==='cancel'
    &&request.subscription_id===c.id&&request.provider_environment==='sandbox'&&request.current_amount_cents===44900
    &&typeof request.current_plan_name==='string'&&Date.parse(request.paid_period_end)===Date.parse(c.current_period_end)
    &&request.status===(c.status==='canceled'?'completed':'awaiting_provider'),{resource_id:request?.id,state:request?.status});
   const denied=await foreign.client.rpc('billing_company_change_context',{p_clinic_id:company});
   record('foreign_company_request_history_denied',!!denied.error);
   const cancel=await deps.post('/api/billing/asaas-cancel',actor,{requestId:request.id,environment:'sandbox',
    reason:'Teste Sandbox: gestor comum não pode executar cancelamento Master',reconcileOnly:true});
   record('ordinary_fixture_cannot_execute_master_action',cancel.status===403&&cancel.body?.ok===false,{http_status:cancel.status});
   const plan=await deps.post('/api/billing/asaas-plan-change',actor,{requestId:request.id,environment:'sandbox',
    reason:'Teste Sandbox: gestor comum não pode executar troca financeira Master',reconcileOnly:true});
   record('ordinary_fixture_cannot_execute_plan_change',plan.status===403&&plan.body?.ok===false,{http_status:plan.status});
   const access=requireResult(await actor.client.rpc('my_subscription_context'),'FIXTURE_CANCEL_ACCESS_READ_FAILED') as any;
   record('authenticated_paid_access_preserved',access.active_clinic_id===company&&access.effective_access==='full'
    &&access.company?.subscription_id===c.id&&access.company?.access_mode==='full');
   const history=requireResult(await actor.client.rpc('billing_company_history',{p_clinic_id:company}),'FIXTURE_CANCEL_HISTORY_READ_FAILED') as any;
   record('customer_paid_history_preserved',Array.isArray(history.payments)&&ledger.every((p:any)=>history.payments.some((h:any)=>h.id===p.id&&h.amount_cents===44900)));
   const audit=await deps.readAudit(request.id);
   if(c.status==='canceled'){
    record('master_single_write_and_confirmed_audit',audit.length>=1&&audit.filter(e=>e.provider_write_started_at).length===1
     &&audit.some(e=>e.outcome==='completed'&&/^[a-f0-9]{32}$/.test(e.provider_proof_hash??'')),{count:audit.length});
   }else record('preparation_has_no_financial_execution',audit.length===0,{count:audit.length});
   record('cancellation_phase',true,{state:c.status==='canceled'?'COMPLETED':'AWAITING_MASTER',resource_id:request.id});
  });
  record('ledger_unchanged_during_observation',ledgerHash===digest(await deps.readLedger()),{digest:ledgerHash});
  record('contract_unchanged_during_observation',digest(c)===digest(contractSchema.parse(await deps.readContract())));
 }catch(error){checks.push({check:'fixture_cancellation_flow',passed:false,
  code:error instanceof FixtureFailure?error.safeCode:error instanceof AsaasApiError?'FIXTURE_CANCEL_PROVIDER_UNAVAILABLE':'FIXTURE_CANCEL_FLOW_FAILED',
  ...(error instanceof AsaasApiError&&error.status?{http_status:error.status}:{})});}
 checks.push({check:'global_environment_unchanged',passed:runtime===process.env.ASAAS_ENVIRONMENT});
 return checks;
}
