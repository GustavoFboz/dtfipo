import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AsaasClient, loadAsaasConfig, loadAsaasWorkerToken, type AsaasConfig, type AsaasPayment } from '@/lib/billing/asaas.server';
import { FixtureFailure, requireResult, type Check, type Job } from './fixture-acceptance.server';
import { fixtureAppPost, withFixtureSessions, type FixtureSession } from './fixture-sessions.server';

const fixtureCompanies = ['081d3db4-1606-40f7-a878-19b51556317d','3fc86c40-697e-4725-a9e9-633fc882aadc'];
const paidStates = new Set(['RECEIVED','CONFIRMED']);
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
type Contract = { id: string; clinic_id: string; provider_environment: string; external_customer_id: string;
  external_subscription_id: string; status: string; plan_code: string; current_period_end: string | null };

export function assertFixturePayment(payment: AsaasPayment, contract: Contract): void {
  if (contract.provider_environment !== 'sandbox' || !fixtureCompanies.includes(contract.clinic_id)
    || !/^pay_[A-Za-z0-9]+$/.test(payment.id) || payment.customer !== contract.external_customer_id
    || payment.subscription !== contract.external_subscription_id || payment.deleted
    || Math.round(Number(payment.value) * 100) !== 44900)
    throw new FixtureFailure('FIXTURE_PROVIDER_PAYMENT_MISMATCH');
}
/** The simulator is Sandbox-only even if the ordinary app later uses Production. */
export async function simulateFixturePayment(config: AsaasConfig, paymentId: string, action: 'overdue' | 'confirm', transport: typeof fetch = fetch): Promise<void> {
  if (config.environment !== 'sandbox' || config.baseUrl !== 'https://api-sandbox.asaas.com/v3'
    || !/^pay_[A-Za-z0-9]+$/.test(paymentId) || !['overdue','confirm'].includes(action))
    throw new FixtureFailure('FIXTURE_SANDBOX_REQUIRED');
  const response = await transport(`${config.baseUrl}/sandbox/payment/${paymentId}/${action}`, {
    method: 'POST', headers: { 'Content-Type':'application/json', 'User-Agent':config.userAgent, access_token:config.apiKey },
    body:'{}', signal:AbortSignal.timeout(10000) });
  // A non-idempotent simulation is never automatically retried.
  if (!response.ok) throw new FixtureFailure(`FIXTURE_SIMULATION_${action.toUpperCase()}_FAILED`, response.status);
  await response.arrayBuffer();
}
async function businessDigest(admin: SupabaseClient) {
  const filter = `(${fixtureCompanies.join(',')})`;
  const ledger = requireResult(await admin.from('billing_payments').select('id,subscription_id,clinic_id,amount_cents,status,paid_at,period_start,period_end').not('clinic_id','in',filter).order('id'), 'FIXTURE_BUSINESS_LEDGER_READ_FAILED');
  const contracts = requireResult(await admin.from('account_subscriptions').select('id,clinic_id,plan_code,status,current_period_start,current_period_end,canceled_at').not('clinic_id','in',filter).order('id'), 'FIXTURE_BUSINESS_CONTRACT_READ_FAILED');
  return createHash('sha256').update(JSON.stringify({ledger,contracts})).digest('hex');
}
async function worker() {
  const response = await fetch('https://dtfipo.lovable.app/api/billing/asaas-worker', { method:'POST',
    headers:{Authorization:`Bearer ${loadAsaasWorkerToken()}`}, signal:AbortSignal.timeout(45000) });
  if (!response.ok) throw new FixtureFailure('FIXTURE_WORKER_FAILED',response.status);
  await response.arrayBuffer();
}
function syntheticCpf(seed: string) {
  let digits=seed;
  for(let n=9;n<=10;n++) { const sum=[...digits].reduce((s,d,i)=>s+Number(d)*(n+1-i),0);const v=(sum*10)%11;digits+=v===10?'0':String(v); }
  return digits;
}
async function prepare(admin: SupabaseClient, fixture: FixtureSession, checks: Check[]): Promise<Contract> {
  const existing = requireResult(await admin.from('account_subscriptions').select('*').eq('clinic_id',fixture.clinic_id).order('created_at',{ascending:false}).limit(1), 'FIXTURE_CONTRACT_READ_FAILED');
  if (existing[0]?.external_subscription_id) {
    if (existing[0].provider_environment !== 'sandbox' || existing[0].plan_code !== 'company_growth')
      throw new FixtureFailure('FIXTURE_EXISTING_CONTRACT_MISMATCH');
    return existing[0] as Contract;
  }
  requireResult(await fixture.client.rpc('billing_upsert_company_profile', {
    p_clinic_id:fixture.clinic_id, p_legal_name:'DentalFlow Acceptance Sandbox Fixture',
    p_tax_id:syntheticCpf(fixture.user_id.startsWith('ee08')?'872000001':'872000002'),
    p_billing_email:fixture.email,p_billing_phone:'11999990000',p_postal_code:'01310000',
    p_address_line:'Endereco ficticio Sandbox',p_address_number:'1',p_address_complement:'Fixture sem entrega',
    p_district:'Fixture',p_city:'Sao Paulo',p_state:'SP' }), 'FIXTURE_BILLING_PROFILE_FAILED');
  const intent = requireResult(await fixture.client.rpc('create_checkout_intent', {
    p_plan_code:'company_growth',p_clinic_id:fixture.clinic_id,p_session_types:['laboratory'] }), 'FIXTURE_CHECKOUT_INTENT_FAILED') as any;
  if (!intent?.checkout_intent_id || intent.amount_cents!==44900) throw new FixtureFailure('FIXTURE_CHECKOUT_AMOUNT_MISMATCH');
  const result=await fixtureAppPost('/api/billing/asaas-checkout',fixture,{checkoutIntentId:intent.checkout_intent_id});
  if (result.status!==200 || result.body?.ok!==true || result.body.checkout?.environment!=='sandbox')
    throw new FixtureFailure('FIXTURE_CHECKOUT_TRANSPORT_FAILED',result.status);
  checks.push({check:'authenticated_checkout_created',passed:true,resource_id:intent.checkout_intent_id,amount_cents:intent.amount_cents});
  return requireResult(await admin.from('account_subscriptions').select('*').eq('id',intent.subscription_id).single(), 'FIXTURE_CONTRACT_LINK_FAILED') as Contract;
}
async function events(admin: SupabaseClient, paymentId: string) {
  return requireResult(await admin.from('billing_events').select('id,provider_event_id,event_type,payload,status,processed_at')
    .eq('provider_environment','sandbox').contains('payload',{paymentId}).order('received_at'), 'FIXTURE_EVENT_READ_FAILED');
}
async function ledger(admin: SupabaseClient, paymentId: string) {
  return requireResult(await admin.from('billing_payments').select('id,status,amount_cents,period_start,period_end')
    .eq('provider_environment','sandbox').eq('provider_payment_id',paymentId), 'FIXTURE_LEDGER_READ_FAILED');
}
async function verifyDocuments(fixture: FixtureSession, foreign: FixtureSession, payment: AsaasPayment, local: any, checks: Check[]) {
  const history = requireResult(await fixture.client.rpc('billing_company_history',{p_clinic_id:fixture.clinic_id}), 'FIXTURE_HISTORY_FAILED') as any;
  checks.push({check:'billing_manager_history',passed:Array.isArray(history.payments)&&history.payments.some((p:any)=>p.id===local.id&&p.amount_cents===44900),resource_id:local.id});
  const forbidden = await foreign.client.rpc('billing_company_history',{p_clinic_id:fixture.clinic_id});
  checks.push({check:'other_company_history_denied',passed:!!forbidden.error});
  const document=await fixtureAppPost('/api/billing/asaas-document',fixture,{paymentId:local.id});
  if(document.status!==200 || document.body?.ok!==true || document.body.environment!=='sandbox') throw new FixtureFailure('FIXTURE_DOCUMENT_FAILED',document.status);
  // The production document endpoint already GETs and verifies the provider.
  // Fetch only the exact URL returned and independently checked against GET.
  if(document.body.paymentUrl!==payment.invoiceUrl) throw new FixtureFailure('FIXTURE_DOCUMENT_URL_MISMATCH');
  const url=new URL(document.body.paymentUrl);
  if(url.protocol!=='https:' || url.hostname!=='sandbox.asaas.com' || url.username || url.password) throw new FixtureFailure('FIXTURE_DOCUMENT_HOST_MISMATCH');
  const opened=await fetch(url,{signal:AbortSignal.timeout(10000),redirect:'manual'});
  await opened.arrayBuffer();
  checks.push({check:'provider_document_opened',passed:opened.status===200,http_status:opened.status,resource_id:local.id});
  const denied=await fixtureAppPost('/api/billing/asaas-document',foreign,{paymentId:local.id});
  checks.push({check:'other_company_document_denied',passed:denied.status===403,http_status:denied.status});
}

/** Exercise the same published endpoints and real Auth/Asaas as the UI. A
 * receipt reports observations; it does not mark an acceptance criterion. */
export async function runFixtureBilling(job: Job): Promise<Check[]> {
  const config=loadAsaasConfig();
  if(config.environment!=='sandbox') throw new FixtureFailure('FIXTURE_SANDBOX_REQUIRED');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const admin=supabaseAdmin as SupabaseClient;
  const provider=new AsaasClient(config);
  const checks:Check[]=[];
  const before=await businessDigest(admin);
  try {
    await withFixtureSessions(job,async sessions=>{
      for(const fixture of sessions) {
        const contract=await prepare(admin,fixture,checks);
        const customer=await provider.getCustomer(contract.external_customer_id);
        if(customer.id!==contract.external_customer_id || customer.externalReference!==`dentalflow:company:${fixture.clinic_id}` || customer.notificationDisabled!==true) throw new FixtureFailure('FIXTURE_NOTIFICATIONS_NOT_DISABLED');
        checks.push({check:'sandbox_customer_notifications_disabled',passed:true,resource_id:customer.id});
        const recurring=await provider.getSubscription(contract.external_subscription_id);
        if(recurring.id!==contract.external_subscription_id || recurring.customer!==customer.id
          || recurring.externalReference!==`dentalflow:subscription:${contract.id}` || recurring.cycle!=='MONTHLY'
          || Math.round(Number(recurring.value)*100)!==44900 || recurring.deleted)
          throw new FixtureFailure('FIXTURE_RECURRING_CONTRACT_MISMATCH');
        const payments=await provider.listSubscriptionPayments(contract.external_subscription_id);
        const payment=payments.sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate)))[0];
        if(!payment) throw new FixtureFailure('FIXTURE_PROVIDER_PAYMENT_MISSING');
        assertFixturePayment(payment,contract);
        let current=payment;
        let oldEventId:string|undefined;
        if(current.status==='PENDING' && fixture.user_id.startsWith('ee08')) {
          await simulateFixturePayment(config,current.id,'overdue');
          current=await provider.getPayment(current.id);assertFixturePayment(current,contract);
          checks.push({check:'sandbox_overdue_observed',passed:current.status==='OVERDUE',resource_id:current.id,state:current.status});
          const pending=await events(admin,current.id);
          oldEventId=pending.find((e:any)=>e.event_type==='PAYMENT_OVERDUE'&&e.status==='pending')?.provider_event_id;
        }
        if(['PENDING','OVERDUE'].includes(current.status??'')) {
          await simulateFixturePayment(config,current.id,'confirm');
          current=await provider.getPayment(current.id);assertFixturePayment(current,contract);
        }
        checks.push({check:'sandbox_paid_observed',passed:paidStates.has(current.status??''),resource_id:current.id,state:current.status,amount_cents:44900});
        if(!paidStates.has(current.status??'')) throw new FixtureFailure('FIXTURE_PAID_NOT_CONFIRMED');
        const queued=await events(admin,current.id);
        const overdue=oldEventId ? queued.find((e:any)=>e.provider_event_id===oldEventId) : queued.find((e:any)=>e.event_type==='PAYMENT_OVERDUE'&&e.status==='pending');
        if(overdue) checks.push({check:'old_notice_queued_after_provider_paid',passed:overdue.status==='pending',resource_id:overdue.provider_event_id,state:current.status});
        for(let attempt=0;attempt<4;attempt++) {
          await worker();
          if((await ledger(admin,current.id)).length) break;
          await pause(1000);
        }
        const local=await ledger(admin,current.id);
        checks.push({check:'one_verified_paid_ledger',passed:local.length===1&&local[0].status==='paid'&&local[0].amount_cents===44900,resource_id:current.id,count:local.length});
        if(local.length!==1 || local[0].status!=='paid') throw new FixtureFailure('FIXTURE_LEDGER_NOT_READY');
        const delivered=await events(admin,current.id);
        const confirmation=delivered.find((e:any)=>['PAYMENT_RECEIVED','PAYMENT_CONFIRMED'].includes(e.event_type)&&!e.provider_event_id.startsWith('evt_reconcile_'));
        if(confirmation) {
          // Re-deliver the exact same projected real event twice. Provider
          // identity is retained; no invented payment status is accepted.
          const body=JSON.stringify({id:confirmation.provider_event_id,event:confirmation.event_type,
            payment:{id:current.id,customer:current.customer,subscription:current.subscription}});
          for(let n=0;n<2;n++) {
            const response=await fetch('https://dtfipo.lovable.app/api/billing/asaas-webhook',{method:'POST',
              headers:{'Content-Type':'application/json','asaas-access-token':config.webhookToken},body,signal:AbortSignal.timeout(10000)});
            if(response.status!==200) throw new FixtureFailure('FIXTURE_REDELIVERY_FAILED',response.status);
            await response.arrayBuffer();
          }
          await worker();
          const after=await ledger(admin,current.id);
          const duplicate=await events(admin,current.id);
          checks.push({check:'identical_redelivery_single_ledger',passed:after.length===1&&after[0].id===local[0].id&&duplicate.filter((e:any)=>e.provider_event_id===confirmation.provider_event_id).length===1,
            resource_id:confirmation.provider_event_id,count:after.length});
        }
        if(overdue) {
          const handled=(await events(admin,current.id)).find((e:any)=>e.id===overdue.id);
          checks.push({check:'old_notice_processed_using_paid_provider',passed:handled?.status==='processed'&&(await ledger(admin,current.id)).length===1,
            resource_id:overdue.provider_event_id,state:handled?.status});
        }
        const updated=requireResult(await admin.from('account_subscriptions').select('status,current_period_end').eq('id',contract.id).single(),'FIXTURE_ENTITLEMENT_READ_FAILED');
        checks.push({check:'provider_verified_paid_access',passed:['active','canceled'].includes(updated.status)&&Date.parse(updated.current_period_end)>Date.now(),resource_id:contract.id,state:updated.status,period_end:updated.current_period_end});
        await verifyDocuments(fixture,sessions.find(s=>s.user_id!==fixture.user_id)!,current,local[0],checks);
      }
    });
  } catch(error) {
    checks.push({check:'billing_flow',passed:false,code:error instanceof FixtureFailure?error.safeCode:'FIXTURE_BILLING_FLOW_FAILED',
      ...(error instanceof FixtureFailure&&error.httpStatus?{http_status:error.httpStatus}:{})});
  } finally {
    const after=await businessDigest(admin);
    checks.push({check:'business_ledger_contracts_unchanged',passed:after===before,digest:after});
  }
  return checks;
}
