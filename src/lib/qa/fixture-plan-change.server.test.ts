import {describe,it,expect,vi} from 'vitest';
import {runFixturePlanChange} from './fixture-plan-change.server';
import type {Job} from './fixture-acceptance.server';
import type {FixtureSession} from './fixture-sessions.server';

const company='3fc86c40-697e-4725-a9e9-633fc882aadc';
const owner='24e7cdf9-457e-4af2-b1cb-cf366abbddb0';
const c={id:'4579343f-7ba7-49a0-b316-638ef16fbcc5',clinic_id:company,scope_type:'company',provider_environment:'sandbox',
 billing_provider:'asaas',billing_cycle:'MONTHLY',plan_code:'company_growth',status:'active',
 external_subscription_id:'sub_fixtureB',external_customer_id:'cus_fixtureB',
 current_period_start:'2030-11-18T00:00:00Z',current_period_end:'2030-12-18T00:00:00Z'};
const job={id:'76cf0047-b60c-4f87-86aa-932eb0da633b',kind:'plan_change',fixtures:[
 {user_id:'ee083f63-1621-4b82-b7a4-fd13427c0b14',clinic_id:'081d3db4-1606-40f7-a878-19b51556317d',email:'fixture-a@example.invalid'},
 {user_id:owner,clinic_id:company,email:'fixture-b@example.invalid'}]} satisfies Job;
function setup(){
 const ledger=[1,2].map(i=>({id:`ledger-${i}`,subscription_id:c.id,clinic_id:company,provider:'asaas',provider_environment:'sandbox',amount_cents:44900,status:'paid'}));
 const quote={kind:'change_plan',subscription_id:c.id,current_plan_code:'company_growth',current_amount_cents:44900,currency:'BRL',
  target_plan_code:'company_initial',target_plan_name:'Inicial',target_amount_cents:500,provider_environment:'sandbox',
  paid_period_end:c.current_period_end,quote_token:'a'.repeat(32),block_reason:null as string|null};
 const request={id:'7c46d4f4-2726-4ce3-b171-7f4138812625',kind:'change_plan',subscription_id:c.id,provider_environment:'sandbox',
  current_amount_cents:44900,target_plan_name:'Inicial',target_amount_cents:500,status:'awaiting_provider',paid_period_end:c.current_period_end};
 const context={clinic_id:company,plan_quotes:[quote],requests:[] as any[]};
 const actorRpc=vi.fn(async(name:string):Promise<any>=>{
  if(name==='billing_company_change_context')return {data:context,error:null};
  if(name==='billing_submit_change_request')return {data:request,error:null};
  if(name==='my_subscription_context')return {data:{active_clinic_id:company,effective_access:'full',company:{subscription_id:c.id,access_mode:'full'}},error:null};
  throw Error('Unexpected customer RPC');
 });
 const foreignRpc=vi.fn().mockResolvedValue({data:null,error:{message:'BILLING_CHANGE_FORBIDDEN'}});
 const sessions=[{...job.fixtures[0],client:{rpc:foreignRpc}},{...job.fixtures[1],client:{rpc:actorRpc}}] as unknown as FixtureSession[];
 const invoices=[1,2].map(i=>({id:`pay_fixture${i}`,customer:c.external_customer_id,subscription:c.external_subscription_id,
  value:449,deleted:false,dueDate:`2030-${i===1?'10':'11'}-18`,status:'RECEIVED'}));
 const update=vi.fn();
 const deps={provider:{getCustomer:vi.fn().mockResolvedValue({id:c.external_customer_id,externalReference:`dentalflow:company:${company}`,deleted:false,notificationDisabled:true}),
  getSubscription:vi.fn().mockResolvedValue({id:c.external_subscription_id,customer:c.external_customer_id,value:449,deleted:false,
   cycle:'MONTHLY',status:'ACTIVE',externalReference:`dentalflow:subscription:${c.id}`,nextDueDate:'2030-12-18'}),
  listPaymentsForReconciliation:vi.fn().mockResolvedValue(invoices),updateSubscription:update},
  readContract:vi.fn<()=>Promise<unknown>>().mockResolvedValue(c),readLedger:vi.fn().mockResolvedValue(ledger),
  readPrices:vi.fn().mockResolvedValue({provider_amount_cents:44900,periods:[]}),
  sessions:vi.fn(async(run:(sessions:FixtureSession[])=>Promise<void>)=>run(sessions))};
 return {deps,actorRpc,foreignRpc,context,quote,request,ledger,invoices,update};
}
const submissions=(x:ReturnType<typeof setup>)=>x.actorRpc.mock.calls.filter(([name])=>name==='billing_submit_change_request');
describe('fixed Sandbox plan-change preparation',()=>{
 it('submits one normal customer instruction after quote/calendar/invoice checks, never a provider write',async()=>{
  const x=setup(),checks=await runFixturePlanChange(job,x.deps);
  expect(checks.every(c=>c.passed)).toBe(true);expect(submissions(x)).toHaveLength(1);
  expect(x.actorRpc).toHaveBeenCalledWith('billing_submit_change_request',{p_clinic_id:company,p_subscription_id:c.id,p_kind:'change_plan',p_target_plan_code:'company_initial',p_quote_token:x.quote.quote_token});
  expect(x.update).not.toHaveBeenCalled();expect(checks).toContainEqual(expect.objectContaining({check:'plan_change_phase',state:'AWAITING_MASTER'}));
 });
 it('reports an already issued future invoice without submitting or mutating it',async()=>{
  const x=setup();x.deps.provider.listPaymentsForReconciliation.mockResolvedValue([...x.invoices,{...x.invoices[0],id:'pay_future',dueDate:'2030-12-18',status:'PENDING'}]);
  const checks=await runFixturePlanChange(job,x.deps);
  expect(checks.every(c=>c.passed)).toBe(true);expect(checks).toContainEqual(expect.objectContaining({check:'plan_change_phase',state:'BLOCKED_FUTURE_INVOICE'}));
  expect(submissions(x)).toHaveLength(0);expect(x.update).not.toHaveBeenCalled();
 });
 it('stops a different provider calendar without changing the date or submitting a request',async()=>{
  const x=setup();x.deps.provider.getSubscription.mockResolvedValue({...await x.deps.provider.getSubscription(),nextDueDate:'2031-01-18'});
  const checks=await runFixturePlanChange(job,x.deps);
  expect(checks).toContainEqual(expect.objectContaining({check:'plan_change_phase',state:'BLOCKED_PROVIDER_CALENDAR'}));
  expect(submissions(x)).toHaveLength(0);expect(x.update).not.toHaveBeenCalled();
 });
 it.each(['storage_limit','member_limit','session_limit'])('preserves a blocked %s quote without making a new request',async reason=>{
  const x=setup();x.quote.block_reason=reason;const checks=await runFixturePlanChange(job,x.deps);
  expect(checks.every(c=>c.passed)).toBe(true);expect(checks).toContainEqual(expect.objectContaining({check:'plan_change_phase',state:'BLOCKED_CUSTOMER_LIMITS'}));
  expect(submissions(x)).toHaveLength(0);
 });
 it('reads existing history rather than submitting again after a lost response',async()=>{
  const x=setup();x.context.requests=[x.request];const checks=await runFixturePlanChange(job,x.deps);
  expect(checks.every(c=>c.passed)).toBe(true);expect(submissions(x)).toHaveLength(0);
  expect(checks).toContainEqual(expect.objectContaining({check:'plan_change_phase',state:'EXISTING_REQUEST_REQUIRES_MASTER_REVIEW'}));
 });
 it('stops on an ambiguous submission and never retries it',async()=>{
  const x=setup();const implementation=x.actorRpc.getMockImplementation()!;
  x.actorRpc.mockImplementation(async name=>name==='billing_submit_change_request'?{data:null,error:{message:'response lost'}}:implementation(name));
  expect((await runFixturePlanChange(job,x.deps)).some(c=>!c.passed)).toBe(true);
  expect(submissions(x)).toHaveLength(1);expect(x.update).not.toHaveBeenCalled();
 });
 it.each([{...c,provider_environment:'production'},{...c,clinic_id:job.fixtures[0].clinic_id},{...c,plan_code:'company_initial'},{...c,status:'canceled'}])(
  'denies a different contract before reading the provider or generating sessions',async contract=>{
   const x=setup();x.deps.readContract.mockResolvedValue(contract);expect((await runFixturePlanChange(job,x.deps)).some(c=>!c.passed)).toBe(true);
   expect(x.deps.provider.getCustomer).not.toHaveBeenCalled();expect(x.deps.sessions).not.toHaveBeenCalled();
  });
 it('rejects a provider resource belonging to another company before sessions',async()=>{
  const x=setup();x.deps.provider.getSubscription.mockResolvedValue({...await x.deps.provider.getSubscription(),customer:'cus_foreign'});
  expect((await runFixturePlanChange(job,x.deps)).some(c=>!c.passed)).toBe(true);expect(x.deps.sessions).not.toHaveBeenCalled();
 });
 it('rejects duplicate or wrong-price invoices without submitting',async()=>{
  const x=setup();x.deps.provider.listPaymentsForReconciliation.mockResolvedValue([...x.invoices,x.invoices[0]]);
  expect((await runFixturePlanChange(job,x.deps)).some(c=>!c.passed)).toBe(true);expect(submissions(x)).toHaveLength(0);
 });
 it('rejects an unexpected target price or accepted foreign-company access',async()=>{
  const x=setup();x.quote.target_amount_cents=44900;
  expect((await runFixturePlanChange(job,x.deps)).some(c=>!c.passed)).toBe(true);expect(submissions(x)).toHaveLength(0);
  const y=setup();y.foreignRpc.mockResolvedValue({data:{},error:null});
  expect((await runFixturePlanChange(job,y.deps)).some(c=>!c.passed)).toBe(true);expect(submissions(y)).toHaveLength(0);
 });
 it('detects a ledger mutation while preserving diagnostic state',async()=>{
  const x=setup();x.deps.readLedger.mockResolvedValueOnce(x.ledger).mockResolvedValue([...x.ledger,{...x.ledger[0],amount_cents:500}]);
  expect(await runFixturePlanChange(job,x.deps)).toContainEqual(expect.objectContaining({check:'ledger_unchanged_during_preparation',passed:false}));
 });
});
