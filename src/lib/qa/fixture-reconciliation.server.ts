import {randomBytes} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {AsaasClient,AsaasApiError,loadAsaasConfig,type AsaasConfig,type AsaasPayment} from '@/lib/billing/asaas.server';
import {processAsaasInbox,type WorkerDependencies} from '@/lib/billing/asaas-webhook.server';
import {upcomingMonthlyInvoices} from '@/lib/billing/asaas-renewal.server';
import {FixtureFailure,requireResult,type Check,type Job} from './fixture-acceptance.server';
import {assertFixturePayment,simulateFixturePayment} from './fixture-billing.server';
import {withFixtureSessions} from './fixture-sessions.server';

const companies=['081d3db4-1606-40f7-a878-19b51556317d','3fc86c40-697e-4725-a9e9-633fc882aadc'];
type Contract={id:string;clinic_id:string;provider_environment:string;external_customer_id:string;
 external_subscription_id:string;status:string;plan_code:string;current_period_end:string;current_period_start:string};

/** Explicit projection; never mutates process.env or borrows Production keys. */
export function loadIsolatedSandboxConfig(source:Record<string,string|undefined>=process.env):AsaasConfig {
 return loadAsaasConfig({ASAAS_ENVIRONMENT:'sandbox',ASAAS_API_KEY:source.ASAAS_API_KEY,
  ASAAS_WEBHOOK_TOKEN:source.ASAAS_WEBHOOK_TOKEN,ASAAS_USER_AGENT:source.ASAAS_USER_AGENT,
  ASAAS_TIMEOUT_MS:'5000',ASAAS_MAX_GET_RETRIES:'0',ASAAS_MIN_REQUEST_INTERVAL_MS:'50'});
}

export function selectFixtureRenewal(payments:AsaasPayment[],contract:Contract):AsaasPayment|null {
 const due=contract.current_period_end?.slice(0,10);
 if(!companies.includes(contract.clinic_id)||contract.provider_environment!=='sandbox'||contract.plan_code!=='company_growth'
  ||contract.status!=='active'||!/^\d{4}-\d{2}-\d{2}$/.test(due??''))throw new FixtureFailure('FIXTURE_RENEWAL_CONTRACT_INVALID');
 const upcoming=upcomingMonthlyInvoices(payments,contract.current_period_end);
 const found=upcoming.filter(p=>p.dueDate===upcoming[0]?.dueDate);
 if(found.length===0)return null;
 if(found.length!==1)throw new FixtureFailure('FIXTURE_RENEWAL_AMBIGUOUS');
 assertFixturePayment(found[0],contract);
 if(!['PENDING','CONFIRMED','RECEIVED'].includes(found[0].status??''))throw new FixtureFailure('FIXTURE_RENEWAL_STATUS_INVALID');
 return found[0];
}

function expectedPeriodEnd(due:string){
 const [y,m,d]=due.split('-').map(Number),last=new Date(Date.UTC(y,m+1,0)).getUTCDate();
 return new Date(Date.UTC(y,m,Math.min(d,last))).toISOString();
}

export function fixtureRenewalApplied(rows:any[],paymentId:string,due:string):boolean {
 return rows.length===1&&rows[0].provider_payment_id===paymentId&&rows[0].status==='paid'&&rows[0].amount_cents===44900
  &&Date.parse(rows[0].period_start)===Date.parse(due+'T00:00:00Z')
  &&Date.parse(rows[0].period_end)===Date.parse(expectedPeriodEnd(due));
}

/** This GET has a documented Sandbox side effect. No automatic retries, no
 * arbitrary URL/month, and never beyond the immediately upcoming period. */
export async function generateFixtureRenewal(config:AsaasConfig,subscriptionId:string,due:string,transport:typeof fetch=fetch){
 if(config.environment!=='sandbox'||config.baseUrl!=='https://api-sandbox.asaas.com/v3'||!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)
  ||!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due+'T00:00:00Z'))
  ||new Date(due+'T00:00:00Z').toISOString().slice(0,10)!==due
  ||Date.parse(due+'T00:00:00Z')<Date.now()||Date.parse(due+'T00:00:00Z')>Date.now()+31*86400000)
  throw new FixtureFailure('FIXTURE_RENEWAL_GENERATION_FORBIDDEN');
 const url=new URL(`${config.baseUrl}/subscriptions/${subscriptionId}/paymentBook`);
 url.searchParams.set('month',String(Number(due.slice(5,7))));url.searchParams.set('year',due.slice(0,4));
 let response:Response;
 try{response=await transport(url.toString(),{method:'GET',headers:{accept:'application/pdf','User-Agent':config.userAgent,access_token:config.apiKey},
  signal:AbortSignal.timeout(10000),redirect:'manual'});}catch{throw new FixtureFailure('FIXTURE_RENEWAL_GENERATION_UNCONFIRMED');}
 // A document redirect is never followed with API credentials. Invoice GET,
 // rather than a downloaded PDF, must prove whether generation committed.
 if(!response.ok&&![302,303].includes(response.status))throw new FixtureFailure('FIXTURE_RENEWAL_GENERATION_FAILED',response.status);
 try{await response.body?.cancel();}catch{ /* Only invoice GET establishes the financial result. */ }
}

/** The production algorithm with real Asaas GETs and SQL lifecycle writes.
 * Only fixed, registered Sandbox resources can enter its lease/inbox. */
export function fixtureReconciliationWorker(jobId:string,contract:Contract,target:AsaasPayment,
 provider:AsaasClient,admin:SupabaseClient):WorkerDependencies {
 const verify=(p:AsaasPayment)=>{assertFixturePayment(p,contract);if(p.id!==target.id||p.dueDate!==target.dueDate)
  throw new FixtureFailure('FIXTURE_WORKER_PAYMENT_OUTSIDE_SCOPE');return p;};
 const getPayment=async(id:string)=>{if(id!==target.id)throw new FixtureFailure('FIXTURE_WORKER_PAYMENT_OUTSIDE_SCOPE');return verify(await provider.getPayment(id));};
 return {environment:'sandbox',workerToken:randomBytes(32).toString('hex'),
  claim:async()=>{const rows=requireResult(await admin.rpc('saas_claim_fixture_asaas_events' as any,{p_job_id:jobId}),'FIXTURE_SCOPED_CLAIM_FAILED') as any[];
   if(rows.some(r=>r.payload?.paymentId!==target.id))throw new FixtureFailure('FIXTURE_SCOPED_CLAIM_MISMATCH');return rows;},
  getPayment,getSubscription:async(id)=>{if(id!==contract.external_subscription_id)throw new FixtureFailure('FIXTURE_SUBSCRIPTION_OUTSIDE_SCOPE');return provider.getSubscription(id);},
  applyPayment:async(event,p,cents)=>{verify(p);requireResult(await admin.rpc('billing_apply_asaas_payment_lifecycle' as any,{
   p_event_id:event.id,p_lease_token:event.lease_token,p_payment_id:p.id,p_customer_id:p.customer,
   p_subscription_id:p.subscription!,p_amount_cents:cents,p_due_date:p.dueDate!,p_payment_status:p.status!}),'FIXTURE_RECOVERY_APPLY_FAILED');},
  applySubscription:async()=>{throw new FixtureFailure('FIXTURE_SUBSCRIPTION_MUTATION_NOT_ALLOWED');},
  listExpiredGrace:async()=>[],suspendGrace:async()=>false,
  claimReconciliation:async()=>[{subscription_id:contract.id,provider_subscription_id:contract.external_subscription_id,customer_id:contract.external_customer_id}],
  listPaymentsForReconciliation:async(id,since)=>{if(id!==contract.external_subscription_id)throw new FixtureFailure('FIXTURE_SUBSCRIPTION_OUTSIDE_SCOPE');
   const all=await provider.listPaymentsForReconciliation(id,since);return all.filter(p=>p.id===target.id).map(verify);},
  enqueueRecovery:async(eventId,eventType,payload)=>{
   const current=await getPayment(target.id),type=current.status==='CONFIRMED'?'PAYMENT_CONFIRMED':'PAYMENT_RECEIVED';
   if(!['CONFIRMED','RECEIVED'].includes(current.status??'')||eventId!==`evt_reconcile_${target.id}_${current.status}`
    ||eventType!==type||payload.paymentId!==target.id||payload.source!=='reconciliation')throw new FixtureFailure('FIXTURE_RECOVERY_EVENT_INVALID');
   return requireResult(await admin.rpc('saas_enqueue_fixture_asaas_recovery' as any,{p_job_id:jobId,p_payment_id:target.id,p_provider_status:current.status}),'FIXTURE_RECOVERY_ENQUEUE_FAILED')===true;},
  finish:async(event,outcome,code)=>{if(event.payload?.paymentId!==target.id)throw new FixtureFailure('FIXTURE_EVENT_OUTSIDE_SCOPE');
   const r=requireResult(await admin.rpc('billing_finish_asaas_event' as any,{p_id:event.id,p_lease_token:event.lease_token,p_outcome:outcome,p_error_code:code??null}),'FIXTURE_RECOVERY_FINISH_FAILED');
   if(!r)throw new FixtureFailure('FIXTURE_RECOVERY_LEASE_EXPIRED');},
 };
}

export async function runFixtureReconciliation(job:Job):Promise<Check[]> {
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server'),admin=supabaseAdmin as SupabaseClient;
 const checks:Check[]=[];const runtime=process.env.ASAAS_ENVIRONMENT;
 const record=(check:string,passed:boolean,extra:Partial<Check>={})=>{checks.push({check,passed,...extra});if(!passed)throw new FixtureFailure(check.toUpperCase());};
 let before:string|undefined;let recovered=0;let phase='SETUP';
 const fingerprint=async()=>requireResult(await admin.rpc('saas_fixture_business_fingerprint' as any,{p_job_id:job.id}),'FIXTURE_BUSINESS_FINGERPRINT_FAILED') as string;
 const rows=async(paymentId:string)=>requireResult(await admin.from('billing_payments').select('id,provider_payment_id,status,amount_cents,period_start,period_end')
  .eq('provider_environment','sandbox').eq('provider_payment_id',paymentId),'FIXTURE_RENEWAL_LEDGER_READ_FAILED') as any[];
 try {
  record('production_runtime_retained',runtime==='production');
  const config=loadIsolatedSandboxConfig(),provider=new AsaasClient(config);
  record('sandbox_separate_configuration',config.environment==='sandbox'&&process.env.ASAAS_ENVIRONMENT===runtime);
  before=await fingerprint();
  await withFixtureSessions(job,async sessions=>{for(const actor of sessions){
   const contracts=requireResult(await admin.from('account_subscriptions').select('*').eq('clinic_id',actor.clinic_id).eq('provider_environment','sandbox')
    .order('created_at',{ascending:false}).limit(1),'FIXTURE_RENEWAL_CONTRACT_READ_FAILED') as Contract[];
   const c=contracts[0];if(!c||!companies.includes(c.clinic_id)||c.current_period_end==null)throw new FixtureFailure('FIXTURE_RENEWAL_CONTRACT_INVALID');
   selectFixtureRenewal([],c);
   let due=c.current_period_end.slice(0,10);
   if(Date.parse(due+'T00:00:00Z')<Date.now())throw new FixtureFailure('FIXTURE_NEXT_PERIOD_OUTSIDE_WINDOW');
   const customer=await provider.getCustomer(c.external_customer_id);
   record('fixture_notifications_disabled',customer.id===c.external_customer_id&&customer.notificationDisabled===true&&customer.externalReference===`dentalflow:company:${c.clinic_id}`);
   const subscription=await provider.getSubscription(c.external_subscription_id);
   record('fixture_recurring_contract_verified',subscription.id===c.external_subscription_id&&subscription.customer===customer.id&&subscription.externalReference===`dentalflow:subscription:${c.id}`
    &&subscription.status==='ACTIVE'&&subscription.cycle==='MONTHLY'&&!subscription.deleted&&Math.round(Number(subscription.value)*100)===44900,{state:subscription.nextDueDate});
   if(Date.parse(due+'T00:00:00Z')>Date.now()+31*86400000){
    const paid=requireResult(await admin.from('billing_payments').select('id').eq('subscription_id',c.id).eq('provider_environment','sandbox')
     .eq('status','paid').eq('amount_cents',44900).eq('period_end',c.current_period_end),'FIXTURE_PREPAID_PERIOD_READ_FAILED');
    record('already_renewed_fixture_no_extra_charge',(paid as any[]).length===1,{period_end:c.current_period_end,state:'NO_EXTRA_PROVIDER_WRITE'});continue;
   }
   const since=c.current_period_start.slice(0,10);phase='RENEWAL_LIST_READ';
   let payment=selectFixtureRenewal(await provider.listPaymentsForReconciliation(c.external_subscription_id,since),c);
   if(!payment){
    phase='RENEWAL_GENERATION';
    try{await generateFixtureRenewal(config,c.external_subscription_id,due);}catch(error){
     if(!(error instanceof FixtureFailure)||!['FIXTURE_RENEWAL_GENERATION_UNCONFIRMED','FIXTURE_RENEWAL_GENERATION_FAILED'].includes(error.safeCode))throw error;
     // Read back after an ambiguous response; never call paymentBook again.
    }
    phase='RENEWAL_GENERATION_READBACK';payment=selectFixtureRenewal(await provider.listPaymentsForReconciliation(c.external_subscription_id,since),c);
    record('invoice_generation_readback_without_retry',!!payment);
   }
   if(!payment)throw new FixtureFailure('FIXTURE_RENEWAL_INVOICE_MISSING');
   due=payment.dueDate!;
   record('fixture_provider_renewal_invoice',true,{resource_id:payment.id,amount_cents:44900,state:due});
   const previous=requireResult(await admin.from('billing_payments').select('*').eq('subscription_id',c.id).eq('status','paid').order('id'),'FIXTURE_PAID_HISTORY_READ_FAILED') as any[];
   record('fixture_renewal_not_in_ledger',previous.length>0&&(await rows(payment.id)).length===0,{resource_id:payment.id,count:0});
   record('fixture_resource_registered',requireResult(await admin.rpc('saas_register_fixture_reconciliation_resource' as any,{p_job_id:job.id,p_subscription_id:c.id,p_payment_id:payment.id}),'FIXTURE_RESOURCE_REGISTRATION_FAILED')===true);
   if(payment.status==='PENDING')await simulateFixturePayment(config,payment.id,'confirm');
   payment=await provider.getPayment(payment.id);assertFixturePayment(payment,c);
   record('fixture_provider_renewal_paid',payment.dueDate===due&&['CONFIRMED','RECEIVED'].includes(payment.status??''),{resource_id:payment.id,state:payment.status,amount_cents:44900});
   const paidEvents=requireResult(await admin.from('billing_events').select('id').eq('provider_environment','sandbox')
    .in('event_type',['PAYMENT_CONFIRMED','PAYMENT_RECEIVED']).contains('payload',{paymentId:payment.id}),'FIXTURE_PAID_EVENT_READ_FAILED');
   record('paid_without_payment_webhook_observed',(paidEvents as any[]).length===0&&(await rows(payment.id)).length===0,{resource_id:payment.id,count:(paidEvents as any[]).length});
   const deps=fixtureReconciliationWorker(job.id,c,payment,provider,admin);
   async function worker(){const response=await processAsaasInbox(new Request('https://dtfipo.lovable.app/api/billing/asaas-worker',{
    method:'POST',headers:{Authorization:`Bearer ${deps.workerToken}`,'x-billing-environment':'sandbox'}}),deps);
    const result=await response.json() as any;record('fixture_scoped_worker_succeeded',response.status===200&&result.failed===0&&result.workerReview===0&&result.reconciliationReview===0,{http_status:response.status});return result;}
   const discovered=await worker();record('normal_reconciler_discovered_missing_payment',discovered.reconciliationScanned===1&&discovered.reconciliationQueued===1);
   const processed=await worker();record('normal_processor_applied_recovery',processed.processed===1);
   const applied=await rows(payment.id);record('one_recovered_paid_renewal',fixtureRenewalApplied(applied,payment.id,due),{resource_id:payment.id,count:applied.length,period_end:applied[0]?.period_end});
   const recovery=requireResult(await admin.from('billing_events').select('status,payload,provider_event_id').eq('provider_environment','sandbox')
    .contains('payload',{paymentId:payment.id,source:'reconciliation'}),'FIXTURE_RECOVERY_EVENT_READ_FAILED') as any[];
   record('recovery_has_processed_audit',recovery.length===1&&recovery[0].status==='processed'&&recovery[0].provider_event_id===`evt_reconcile_${payment.id}_${payment.status}`);
   await worker();record('repeated_reconciliation_preserves_ledger',JSON.stringify(applied)===JSON.stringify(await rows(payment.id)));
   const afterPrevious=requireResult(await admin.from('billing_payments').select('*').in('id',previous.map(p=>p.id)).order('id'),'FIXTURE_PAID_HISTORY_READ_FAILED');
   record('previous_paid_periods_preserved',JSON.stringify(previous)===JSON.stringify(afterPrevious));
   const updated=requireResult(await admin.from('account_subscriptions').select('status,current_period_end,plan_code').eq('id',c.id).single(),'FIXTURE_RENEWAL_ACCESS_READ_FAILED');
   record('renewal_period_extended_once',updated.status==='active'&&updated.plan_code===c.plan_code&&Date.parse(updated.current_period_end)===Date.parse(expectedPeriodEnd(due)),{period_end:updated.current_period_end});
   const own=requireResult(await actor.client.rpc('my_subscription_context'),'FIXTURE_RENEWAL_SESSION_ACCESS_FAILED') as any;
   record('real_fixture_session_keeps_full_access',own.active_clinic_id===c.clinic_id&&own.effective_access==='full'&&own.company?.subscription_id===c.id);
   const foreign=sessions.find(s=>s.clinic_id!==actor.clinic_id)!;
   const denied=await foreign.client.from('billing_payments').select('id').eq('id',applied[0].id);
   record('foreign_company_cannot_read_renewal',!denied.error&&denied.data?.length===0);recovered++;
  }});
  record('at_least_one_missing_payment_recovered',recovered>0,{count:recovered});
 }catch(error){checks.push({check:'isolated_reconciliation_flow',passed:false,code:error instanceof FixtureFailure?error.safeCode:error instanceof AsaasApiError?'FIXTURE_PROVIDER_REQUEST_FAILED':`FIXTURE_${phase}_FAILED`,state:phase,
  ...(error instanceof FixtureFailure&&error.httpStatus?{http_status:error.httpStatus}:error instanceof AsaasApiError&&error.status?{http_status:error.status}:{})});}
 finally{
  if(before){try{const after=await fingerprint();checks.push({check:'non_fixture_business_data_preserved',passed:before===after,digest:after});}
   catch{checks.push({check:'non_fixture_business_data_preserved',passed:false,code:'FIXTURE_FINGERPRINT_UNAVAILABLE'});}}
  checks.push({check:'global_environment_unchanged',passed:runtime===process.env.ASAAS_ENVIRONMENT});
 }
 return checks;
}
