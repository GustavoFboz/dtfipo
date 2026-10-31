import {describe,it,expect,vi} from 'vitest';
import {cancellationInvoiceDigest,runFixtureCancellation} from './fixture-cancellation.server';
import type {Job} from './fixture-acceptance.server';
import type {FixtureSession} from './fixture-sessions.server';

const company='081d3db4-1606-40f7-a878-19b51556317d';
const owner='ee083f63-1621-4b82-b7a4-fd13427c0b14';
const c={id:'f089af79-cea4-4821-8497-0e594e67f3cf',clinic_id:company,scope_type:'company' as const,
 provider_environment:'sandbox' as const,billing_provider:'asaas' as const,billing_cycle:'MONTHLY' as const,
 plan_code:'company_growth' as const,status:'active' as const,external_subscription_id:'sub_fixtureA',external_customer_id:'cus_fixtureA',
 current_period_start:'2030-11-18T00:00:00Z',current_period_end:'2030-12-18T00:00:00Z'} as const;
const job={id:'76cf0047-b60c-4f87-86aa-932eb0da633b',kind:'cancellation',fixtures:[{user_id:owner,clinic_id:company,email:'fixture-a@example.invalid'},
 {user_id:'24e7cdf9-457e-4af2-b1cb-cf366abbddb0',clinic_id:'3fc86c40-697e-4725-a9e9-633fc882aadc',email:'fixture-b@example.invalid'}]} satisfies Job;
const invoices=[1,2,3].map(i=>({id:`pay_fixture${i}`,customer:c.external_customer_id,subscription:c.external_subscription_id,
 value:449,deleted:false,dueDate:`2030-${i===1?'10':i===2?'11':'12'}-18`,status:i===3?'PENDING':'RECEIVED'}));
function setup(canceled=false){
 const contract={...c,status:canceled?'canceled':'active'};
 const ledger=[1,2].map(i=>({id:`ledger-${i}`,subscription_id:c.id,clinic_id:company,provider:'asaas',provider_environment:'sandbox',amount_cents:44900,status:'paid'}));
 const request={id:'7c46d4f4-2726-4ce3-b171-7f4138812625',subscription_id:c.id,provider_environment:'sandbox',kind:'cancel',
  current_plan_name:'Growth',current_amount_cents:44900,paid_period_end:c.current_period_end,status:canceled?'completed':'awaiting_provider'};
 const quote={...request,current_plan_code:c.plan_code,block_reason:null,quote_token:'fresh-quote'};
 const actorRpc=vi.fn(async(name:string)=>{
  if(name==='billing_company_change_context')return {data:{requests:canceled?[request]:[],cancellation_quote:canceled?null:quote},error:null};
  if(name==='billing_submit_change_request')return {data:request,error:null};
  if(name==='my_subscription_context')return {data:{active_clinic_id:company,effective_access:'full',company:{subscription_id:c.id,access_mode:'full'}},error:null};
  if(name==='billing_company_history')return {data:{payments:ledger},error:null};
  throw new Error('Unexpected normal-user RPC');
 });
 const foreignRpc=vi.fn().mockResolvedValue({data:null,error:{message:'BILLING_CHANGE_FORBIDDEN'}});
 const sessions=[{...job.fixtures[0],client:{rpc:actorRpc}},{...job.fixtures[1],client:{rpc:foreignRpc}}] as unknown as FixtureSession[];
 const update=vi.fn();
 const deps={provider:{getCustomer:vi.fn().mockResolvedValue({id:c.external_customer_id,externalReference:`dentalflow:company:${company}`,deleted:false,notificationDisabled:true}),
  getSubscription:vi.fn().mockResolvedValue({id:c.external_subscription_id,customer:c.external_customer_id,value:449,deleted:false,
   cycle:'MONTHLY',externalReference:`dentalflow:subscription:${c.id}`,status:canceled?'INACTIVE':'ACTIVE'}),
  listPaymentsForReconciliation:vi.fn().mockResolvedValue(invoices),updateSubscription:update},
  readContract:vi.fn().mockResolvedValue(contract),readLedger:vi.fn().mockResolvedValue(ledger),readPrices:vi.fn().mockResolvedValue({provider_amount_cents:44900,periods:[]}),
  readAudit:vi.fn().mockResolvedValue(canceled?[{outcome:'completed',provider_write_started_at:'2030-10-27T00:00:00Z',provider_proof_hash:'a'.repeat(32),reconcile_only:false}]:[]),
  sessions:vi.fn(async(run:(sessions:FixtureSession[])=>Promise<void>)=>run(sessions)),
  post:vi.fn().mockResolvedValue({status:403,body:{ok:false}})};
 return {deps,actorRpc,foreignRpc,request,ledger,update};
}
describe('fixed Sandbox cancellation preparation and observation',()=>{
 it('submits through the normal fixture session once, leaving Master execution untouched',async()=>{
  const x=setup();const checks=await runFixtureCancellation(job,x.deps);
  expect(checks.every(c=>c.passed)).toBe(true);
  expect(x.actorRpc.mock.calls.filter(([name])=>name==='billing_submit_change_request')).toHaveLength(1);
  expect(x.foreignRpc).toHaveBeenCalledWith('billing_company_change_context',{p_clinic_id:company});
  expect(x.deps.post).toHaveBeenCalledTimes(2);expect(x.deps.post.mock.calls[0][2]).toMatchObject({requestId:x.request.id,reconcileOnly:true});
  expect(x.deps.post.mock.calls[1][0]).toBe('/api/billing/asaas-plan-change');
  expect(x.update).not.toHaveBeenCalled();
  expect(checks).toContainEqual(expect.objectContaining({check:'cancellation_phase',state:'AWAITING_MASTER'}));
 });
 it('observes a completed cancellation without submitting another request or provider mutation',async()=>{
  const x=setup(true);const checks=await runFixtureCancellation(job,x.deps);
  expect(checks.every(c=>c.passed)).toBe(true);expect(x.update).not.toHaveBeenCalled();
  expect(x.actorRpc.mock.calls.some(([name])=>name==='billing_submit_change_request')).toBe(false);
  expect(checks).toContainEqual(expect.objectContaining({check:'cancellation_phase',state:'COMPLETED'}));
 });
 it('stops an ambiguous customer submission without repeating it or calling the execution endpoint',async()=>{
  const x=setup();x.actorRpc.mockImplementation(async name=>name==='billing_company_change_context'
   ?{data:{requests:[],cancellation_quote:{...x.request,current_plan_code:c.plan_code,block_reason:null,quote_token:'fresh'}},error:null}
   :{data:null,error:{message:'network response lost'}} as any);
  const checks=await runFixtureCancellation(job,x.deps);
  expect(checks.some(c=>!c.passed)).toBe(true);
  expect(x.actorRpc.mock.calls.filter(([name])=>name==='billing_submit_change_request')).toHaveLength(1);
  expect(x.deps.post).not.toHaveBeenCalled();expect(x.update).not.toHaveBeenCalled();
 });
 it.each([{...c,provider_environment:'production'},{...c,clinic_id:job.fixtures[1].clinic_id},{...c,plan_code:'company_starter'}])(
  'refuses a different environment/company/plan before contacting the provider',async contract=>{
   const x=setup();x.deps.readContract.mockResolvedValue(contract);const checks=await runFixtureCancellation(job,x.deps);
   expect(checks.some(c=>!c.passed)).toBe(true);expect(x.deps.provider.getCustomer).not.toHaveBeenCalled();expect(x.deps.sessions).not.toHaveBeenCalled();
  });
 it('refuses a provider resource with a different owner before generating fixture sessions',async()=>{
  const x=setup();x.deps.provider.getSubscription.mockResolvedValue({...await x.deps.provider.getSubscription(),customer:'cus_foreign'});
  const checks=await runFixtureCancellation(job,x.deps);expect(checks.some(c=>!c.passed)).toBe(true);expect(x.deps.sessions).not.toHaveBeenCalled();
 });
 it('does not accept multiple financial writes as a successful cancellation audit',async()=>{
  const x=setup(true);const row=(await x.deps.readAudit())[0];x.deps.readAudit.mockResolvedValue([row,row]);
  const checks=await runFixtureCancellation(job,x.deps);
  expect(checks).toContainEqual(expect.objectContaining({check:'master_single_write_and_confirmed_audit',passed:false}));
 });
 it('detects a ledger mutation during the observation',async()=>{
  const x=setup();x.deps.readLedger.mockResolvedValueOnce(x.ledger).mockResolvedValue([...x.ledger,{...x.ledger[0],amount_cents:500}]);
  expect(await runFixtureCancellation(job,x.deps)).toContainEqual(expect.objectContaining({check:'ledger_unchanged_during_observation',passed:false}));
 });
 it('hashes all invoice identities, prices and states without storing links, independent of response ordering',()=>{
  expect(cancellationInvoiceDigest(invoices,c)).toBe(cancellationInvoiceDigest([...invoices].reverse().map(p=>({...p,invoiceUrl:'https://sandbox.asaas.com/private-link'})),c));
  expect(cancellationInvoiceDigest(invoices,c)).not.toBe(cancellationInvoiceDigest(invoices.map((p,i)=>i===2?{...p,status:'RECEIVED'}:p),c));
  expect(()=>cancellationInvoiceDigest([...invoices,invoices[0]],c)).toThrow('FIXTURE_CANCEL_INVOICES_MISMATCH');
  expect(()=>cancellationInvoiceDigest(invoices.map((p,i)=>i===0?{...p,value:448}:p),c)).toThrow('FIXTURE_CANCEL_INVOICES_MISMATCH');
 });
});
