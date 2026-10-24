import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {loadIsolatedSandboxConfig,selectFixtureRenewal,fixtureRenewalApplied,generateFixtureRenewal,fixtureReconciliationWorker} from './fixture-reconciliation.server';
import {processAsaasInbox} from '@/lib/billing/asaas-webhook.server';

const source={ASAAS_ENVIRONMENT:'production',ASAAS_PRODUCTION_ENABLED:'true',ASAAS_API_KEY:'$aact_hmlg_fixture_not_real_12345',
 ASAAS_WEBHOOK_TOKEN:'fixture_webhook_012345678901234567890123',ASAAS_USER_AGENT:'DentalFlow/QA',
 ASAAS_PRODUCTION_API_KEY:'$aact_prod_must_never_be_used_12345',ASAAS_PRODUCTION_WEBHOOK_TOKEN:'production_webhook_never_used_1234567890'};
const c={id:'92400000-0000-4000-8000-000000000010',clinic_id:'081d3db4-1606-40f7-a878-19b51556317d',
 provider_environment:'sandbox',external_customer_id:'cus_scopeA',external_subscription_id:'sub_scopeA',status:'active',
 plan_code:'company_growth',current_period_start:'2026-10-16T00:00:00Z',current_period_end:'2026-11-16T00:00:00Z'};
const p={id:'pay_scopeA',customer:'cus_scopeA',subscription:'sub_scopeA',value:449,status:'PENDING',dueDate:'2026-11-16'};
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));});
afterEach(()=>vi.useRealTimers());

describe('isolated Sandbox configuration and exact renewal selection',()=>{
 it('keeps the complete Production source untouched and uses only the old Sandbox group',()=>{
  const frozen=Object.freeze({...source});const config=loadIsolatedSandboxConfig(frozen);
  expect(config.environment).toBe('sandbox');expect(config.baseUrl).toBe('https://api-sandbox.asaas.com/v3');
  expect(config.apiKey).toBe(source.ASAAS_API_KEY);expect(config.webhookToken).toBe(source.ASAAS_WEBHOOK_TOKEN);
  expect(config.maxGetRetries).toBe(0);expect(frozen).toEqual(source);
 });
 it.each([{...source,ASAAS_API_KEY:undefined},{...source,ASAAS_API_KEY:source.ASAAS_PRODUCTION_API_KEY},
  {...source,ASAAS_WEBHOOK_TOKEN:undefined}])('never falls back to Production credentials',s=>expect(()=>loadIsolatedSandboxConfig(s)).toThrow());
 it('selects only the invoice for the next paid-period boundary',()=>{
  expect(selectFixtureRenewal([{...p,id:'pay_old',dueDate:'2026-10-16',status:'RECEIVED'},p],c)).toEqual(p);
  expect(selectFixtureRenewal([{...p,dueDate:'2026-12-16'}],c)).toBeNull();
 });
 it('uses the first real provider date after a shifted initial due day',()=>{
  expect(selectFixtureRenewal([{...p,dueDate:'2026-11-17'}],c)?.dueDate).toBe('2026-11-17');
  expect(selectFixtureRenewal([{...p,dueDate:'2026-11-15'}],c)).toBeNull();
  expect(selectFixtureRenewal([{...p,dueDate:'2026-11-25'}],c)).toBeNull();
 });
 it.each([{...p,value:5},{...p,customer:'cus_foreign'},{...p,subscription:'sub_foreign'},
  {...p,deleted:true},{...p,status:'REFUNDED'},{...p,id:'../../production'}])('rejects a mismatched renewal before any simulation',x=>expect(()=>selectFixtureRenewal([x],c)).toThrow());
 it('refuses an ambiguous duplicate upcoming invoice',()=>expect(()=>selectFixtureRenewal([p,{...p,id:'pay_second'}],c)).toThrow('FIXTURE_RENEWAL_AMBIGUOUS'));
 it.each([{...c,provider_environment:'production'},{...c,clinic_id:'92400000-0000-4000-8000-000000000099'},
  {...c,plan_code:'company_initial'},{...c,status:'canceled'}])('requires an active fixed Sandbox Growth contract',x=>expect(()=>selectFixtureRenewal([p],x)).toThrow());
 it('requires one exact monthly ledger period and handles the last day of a month',()=>{
  const row={provider_payment_id:p.id,status:'paid',amount_cents:44900,period_start:'2027-01-31T00:00:00Z',period_end:'2027-02-28T00:00:00Z'};
  expect(fixtureRenewalApplied([row],p.id,'2027-01-31')).toBe(true);
  expect(fixtureRenewalApplied([row,row],p.id,'2027-01-31')).toBe(false);
  expect(fixtureRenewalApplied([{...row,period_end:'2027-03-03T00:00:00Z'}],p.id,'2027-01-31')).toBe(false);
  expect(fixtureRenewalApplied([{...row,amount_cents:500}],p.id,'2027-01-31')).toBe(false);
 });
});

describe('bounded Sandbox-only invoice generation',()=>{
 it('uses one documented paymentBook request, with no body or automatic retry',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
  const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response('fixture PDF'));
  await generateFixtureRenewal(loadIsolatedSandboxConfig(source),'sub_scopeA','2026-11-16',transport);
  expect(transport).toHaveBeenCalledTimes(1);const [url,init]=transport.mock.calls[0];
  expect(String(url)).toBe('https://api-sandbox.asaas.com/v3/subscriptions/sub_scopeA/paymentBook?month=11&year=2026');
  expect(init?.method).toBe('GET');expect(init).not.toHaveProperty('body');expect(init?.redirect).toBe('manual');
 });
 it.each(['2026-12-24','2026-02-30','2026-10-01','not-a-date'])('refuses an unbounded or invalid period %s',async due=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
  const transport=vi.fn<typeof fetch>();await expect(generateFixtureRenewal(loadIsolatedSandboxConfig(source),'sub_scopeA',due,transport)).rejects.toThrow();expect(transport).not.toHaveBeenCalled();
 });
 it('refuses Production and never retries an ambiguous response',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
  const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response(null,{status:503}));
  await expect(generateFixtureRenewal({...loadIsolatedSandboxConfig(source),environment:'production'},'sub_scopeA','2026-11-16',transport)).rejects.toThrow();
  expect(transport).not.toHaveBeenCalled();
  await expect(generateFixtureRenewal(loadIsolatedSandboxConfig(source),'sub_scopeA','2026-11-16',transport)).rejects.toThrow('FIXTURE_RENEWAL_GENERATION_FAILED');
  expect(transport).toHaveBeenCalledTimes(1);
 });
});

function adapter(){
 const paid={...p,status:'RECEIVED'},subscription={id:c.external_subscription_id,customer:c.external_customer_id,cycle:'MONTHLY',
  status:'ACTIVE',externalReference:`dentalflow:subscription:${c.id}`,value:449};
 const provider={getPayment:vi.fn().mockResolvedValue(paid),getSubscription:vi.fn().mockResolvedValue(subscription),
  listPaymentsForReconciliation:vi.fn().mockResolvedValue([paid])};
 const queue:any[]=[];let applied=0;
 const rpc=vi.fn(async(name:string,args:any)=>{
  if(name==='saas_claim_fixture_asaas_events'){const rows=queue.filter(e=>e.status==='received');rows.forEach(e=>e.status='processing');return {data:rows,error:null};}
  if(name==='saas_enqueue_fixture_asaas_recovery'){if(queue.length)return {data:false,error:null};
   queue.push({id:'92400000-0000-4000-8000-000000000055',payload:{paymentId:p.id,source:'reconciliation'},event_type:'PAYMENT_RECEIVED',
    lease_token:'92400000-0000-4000-8000-000000000056',attempt_count:1,status:'received'});return {data:true,error:null};}
  if(name==='billing_apply_asaas_payment_lifecycle'){applied++;queue.find(e=>e.id===args.p_event_id).status='processed';return {data:{applied:true},error:null};}
  throw Error('Unexpected RPC');
 });
 const deps=fixtureReconciliationWorker('92400000-0000-4000-8000-000000000001',c,paid,provider as any,{rpc} as any);
 const request=(environment='sandbox')=>new Request('https://dtfipo.lovable.app/api/billing/asaas-worker',{method:'POST',
  headers:{authorization:`Bearer ${deps.workerToken}`,'x-billing-environment':environment}});
 return {provider,rpc,deps,request,applied:()=>applied};
}

describe('ordinary inbox algorithm with a fixed financial fixture scope',()=>{
 it('discovers, leases and applies once, then repeats reconciliation without another application',async()=>{
  const x=adapter();const run=async()=>{const r=await processAsaasInbox(x.request(),x.deps);expect(r.status).toBe(200);return r.json() as any;};
  expect((await run()).reconciliationQueued).toBe(1);expect(x.applied()).toBe(0);
  expect((await run()).processed).toBe(1);expect(x.applied()).toBe(1);
  expect((await run()).reconciliationQueued).toBe(0);expect(x.applied()).toBe(1);
  expect(x.rpc.mock.calls.filter(([name])=>name==='billing_apply_asaas_payment_lifecycle')).toHaveLength(1);
  expect(x.rpc.mock.calls.filter(([name])=>name==='saas_claim_fixture_asaas_events').every(([,args])=>Object.keys(args).join()==='p_job_id')).toBe(true);
 });
 it('refuses a Production worker request before claiming any resource',async()=>{
  const x=adapter();expect((await processAsaasInbox(x.request('production'),x.deps)).status).toBe(409);
  expect(x.rpc).not.toHaveBeenCalled();expect(x.provider.getPayment).not.toHaveBeenCalled();
 });
 it('never sends GETs or writes for a foreign resource',async()=>{
  const x=adapter();await expect(x.deps.getPayment('pay_foreign')).rejects.toThrow();
  await expect(x.deps.getSubscription('sub_foreign')).rejects.toThrow();
  await expect(x.deps.listPaymentsForReconciliation('sub_foreign','2026-09-01')).rejects.toThrow();
  expect(x.provider.getPayment).not.toHaveBeenCalled();expect(x.provider.getSubscription).not.toHaveBeenCalled();
  expect(x.provider.listPaymentsForReconciliation).not.toHaveBeenCalled();expect(x.rpc).not.toHaveBeenCalled();
 });
 it('does not queue a divergent event even after reading a paid provider resource',async()=>{
  const x=adapter();await expect(x.deps.enqueueRecovery('evt_reconcile_pay_foreign_RECEIVED','PAYMENT_RECEIVED',{paymentId:'pay_foreign',source:'reconciliation'})).rejects.toThrow();
  expect(x.rpc).not.toHaveBeenCalled();
 });
});
