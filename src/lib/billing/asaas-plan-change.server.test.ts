import {beforeEach,describe,expect,it,vi} from 'vitest';
import {executeAsaasPlanChange} from './asaas-plan-change.server';
const requestId='92800000-0000-4000-8000-000000000001';
const c={done:false as const,request_id:requestId,subscription_id:'92800000-0000-4000-8000-000000000002',lease_token:'92800000-0000-4000-8000-000000000003',
 external_subscription_id:'sub_Plan',external_customer_id:'cus_Plan',current_amount_cents:44900,provider_amount_cents:44900,target_amount_cents:24900,
 effective_date:'2030-11-18',environment:'sandbox' as const,reconcile_only:false,write_started:false};
const old={id:'sub_Plan',customer:'cus_Plan',value:449,cycle:'MONTHLY',deleted:false,status:'ACTIVE',billingType:'UNDEFINED' as const,
 nextDueDate:'2030-11-18',externalReference:`dentalflow:subscription:${c.subscription_id}`};
const updated={...old,value:249};
const invoice={id:'pay_Old',customer:'cus_Plan',subscription:'sub_Plan',value:449,dueDate:'2030-10-18',deleted:false,status:'RECEIVED'};
const input={requestId,environment:'sandbox',reason:'Troca solicitada pelo responsável e conferida pelo operador',reconcileOnly:false};
const request=new Request('https://dtfipo.lovable.app/api/billing/asaas-plan-change',{method:'POST'});
let deps:NonNullable<Parameters<typeof executeAsaasPlanChange>[2]>;
beforeEach(()=>{deps={environment:'sandbox',claim:vi.fn().mockResolvedValue(c),beginWrite:vi.fn().mockResolvedValue(true),
 finish:vi.fn().mockImplementation(async(_c,proof)=>proof?'completed':'review_required'),
 client:{getSubscription:vi.fn().mockResolvedValueOnce(old).mockResolvedValue(updated),updateSubscription:vi.fn().mockResolvedValue(updated),
 listPaymentsForReconciliation:vi.fn().mockResolvedValue([invoice])}};});
describe('single leased plan price update',()=>{
 it('reconciles an already written price after invoice generation, without another mutation',async()=>{
  vi.mocked(deps.claim).mockResolvedValue({...c,reconcile_only:true,write_started:true});
  vi.mocked(deps.client.getSubscription).mockReset().mockResolvedValue({...updated,nextDueDate:'2030-12-18'});
  vi.mocked(deps.client.listPaymentsForReconciliation).mockResolvedValue([invoice,{...invoice,id:'pay_New',value:249,dueDate:c.effective_date,status:'PENDING'}]);
  expect(await executeAsaasPlanChange(request,{...input,reconcileOnly:true},deps)).toMatchObject({ok:true,status:'completed'});
  expect(deps.client.updateSubscription).not.toHaveBeenCalled();expect(deps.beginWrite).not.toHaveBeenCalled();
 });
 it('does not accept a wrong-price future invoice or duplicate period during recovery',async()=>{
  vi.mocked(deps.claim).mockResolvedValue({...c,reconcile_only:true,write_started:true});
  vi.mocked(deps.client.getSubscription).mockReset().mockResolvedValue({...updated,nextDueDate:'2030-12-18'});
  vi.mocked(deps.client.listPaymentsForReconciliation).mockResolvedValue([invoice,{...invoice,id:'pay_New',value:449,dueDate:c.effective_date}]);
  expect(await executeAsaasPlanChange(request,{...input,reconcileOnly:true},deps)).toMatchObject({ok:false});
  expect(deps.client.updateSubscription).not.toHaveBeenCalled();
 });
 it('changes only the recurring value once, verifies it and preserves existing invoices',async()=>{
  expect(await executeAsaasPlanChange(request,input,deps)).toMatchObject({ok:true,status:'completed'});
  expect(deps.client.updateSubscription).toHaveBeenCalledExactlyOnceWith('sub_Plan',{value:249});
  expect(deps.client.getSubscription).toHaveBeenCalledTimes(2);
  expect(deps.client.listPaymentsForReconciliation).toHaveBeenCalledTimes(2);
  expect(deps.finish).toHaveBeenCalledWith(c,expect.objectContaining({...updated,invoice_digest:expect.stringMatching(/^[a-f0-9]{64}$/),invoice_count:1}),null);
 });
 it('recovers a lost PUT response with fresh GETs and never repeats the mutation',async()=>{
  vi.mocked(deps.client.updateSubscription).mockRejectedValue(new Error('provider response lost'));
  expect(await executeAsaasPlanChange(request,input,deps)).toMatchObject({ok:true,status:'completed'});
  expect(deps.client.updateSubscription).toHaveBeenCalledTimes(1);
 });
 it('keeps an acknowledged but unapplied update in review',async()=>{
  vi.mocked(deps.client.getSubscription).mockReset().mockResolvedValue(old);
  expect(await executeAsaasPlanChange(request,input,deps)).toMatchObject({ok:true,status:'review_required'});
  expect(deps.finish).toHaveBeenCalledWith(c,null,'PROVIDER_STILL_OLD_PRICE');
 });
 it.each([true,false])('an expired/review lease forces GET even if the client requests writes (%s)',async reconcileOnly=>{
  vi.mocked(deps.claim).mockResolvedValue({...c,reconcile_only:true});
  vi.mocked(deps.client.getSubscription).mockReset().mockResolvedValue(old);
  expect(await executeAsaasPlanChange(request,{...input,reconcileOnly},deps)).toMatchObject({ok:true,status:'review_required'});
  expect(deps.beginWrite).not.toHaveBeenCalled();expect(deps.client.updateSubscription).not.toHaveBeenCalled();
 });
 it('cannot receive a write-capable claim during explicit read-only recovery',async()=>{
  expect(await executeAsaasPlanChange(request,{...input,reconcileOnly:true},deps)).toMatchObject({ok:false});
  expect(deps.client.getSubscription).not.toHaveBeenCalled();
 });
 it.each(['PENDING','RECEIVED'])('does not rewrite an already issued future invoice (%s)',async status=>{
  vi.mocked(deps.client.listPaymentsForReconciliation).mockResolvedValue([{...invoice,dueDate:c.effective_date,status}]);
  expect(await executeAsaasPlanChange(request,input,deps)).toMatchObject({ok:false});
  expect(deps.finish).toHaveBeenCalledWith(c,null,'FUTURE_INVOICE_REVIEW');
  expect(deps.beginWrite).not.toHaveBeenCalled();expect(deps.client.updateSubscription).not.toHaveBeenCalled();
 });
 it('refuses a shifted provider calendar instead of backdating a new invoice',async()=>{
  vi.mocked(deps.client.getSubscription).mockReset().mockResolvedValue({...old,nextDueDate:'2030-12-18'});
  expect(await executeAsaasPlanChange(request,input,deps)).toMatchObject({ok:false});
  expect(deps.finish).toHaveBeenCalledWith(c,null,'PROVIDER_CALENDAR_REVIEW');expect(deps.client.updateSubscription).not.toHaveBeenCalled();
 });
 it('does not claim success if existing invoices change during the operation',async()=>{
  vi.mocked(deps.client.listPaymentsForReconciliation).mockReset().mockResolvedValueOnce([invoice]).mockResolvedValue([{...invoice,value:500}]);
  expect(await executeAsaasPlanChange(request,input,deps)).toMatchObject({ok:true,status:'review_required'});
  expect(deps.client.updateSubscription).toHaveBeenCalledTimes(1);
 });
 it.each([{...old,customer:'cus_Foreign'},{...old,status:'INACTIVE'},{...old,value:999},
  {...old,billingType:'CREDIT_CARD'},{...old,externalReference:'foreign'}])('requires the exact supported provider contract (%j)',async value=>{
  vi.mocked(deps.client.getSubscription).mockReset().mockResolvedValue(value as any);
  expect(await executeAsaasPlanChange(request,input,deps)).toMatchObject({ok:false});expect(deps.beginWrite).not.toHaveBeenCalled();
 });
 it('does not write when the caller loses authorization at the final fence',async()=>{
  vi.mocked(deps.beginWrite).mockResolvedValue(false);
  expect(await executeAsaasPlanChange(request,input,deps)).toMatchObject({ok:false});expect(deps.client.updateSubscription).not.toHaveBeenCalled();
 });
 it('does not resend an already confirmed provider price or completed request',async()=>{
  vi.mocked(deps.client.getSubscription).mockReset().mockResolvedValue(updated);
  expect(await executeAsaasPlanChange(request,input,deps)).toMatchObject({ok:true,status:'completed'});
  expect(deps.client.updateSubscription).not.toHaveBeenCalled();
  vi.mocked(deps.claim).mockResolvedValue({done:true,request_id:requestId});vi.mocked(deps.client.getSubscription).mockClear();
  expect(await executeAsaasPlanChange(request,input,deps)).toMatchObject({ok:true,status:'completed'});
  expect(deps.client.getSubscription).not.toHaveBeenCalled();
 });
 it.each([{...input,requestId:'invalid'},{...input,reason:'short'},{...input,companyId:'selected-from-http'}])('rejects extra selectors and invalid instructions (%j)',async value=>{
  expect(await executeAsaasPlanChange(request,value,deps)).toMatchObject({ok:false,status:400});expect(deps.claim).not.toHaveBeenCalled();
 });
 it('refuses a different environment and foreign browser origin before claiming',async()=>{
  await executeAsaasPlanChange(request,{...input,environment:'production'},deps);
  await executeAsaasPlanChange(new Request(request,{headers:{Origin:'https://foreign.invalid'}}),input,deps);
  expect(deps.claim).not.toHaveBeenCalled();
 });
 it('leaves Production disabled until its separate rollout flag is explicitly enabled',async()=>{
  vi.stubEnv('ASAAS_PLAN_CHANGES_PRODUCTION_ENABLED','false');
  try{expect(await executeAsaasPlanChange(request,{...input,environment:'production'})).toMatchObject({ok:false,status:403,code:'BILLING_PLAN_PRODUCTION_DISABLED'});}
  finally{vi.unstubAllEnvs();}
 });
 it('redacts provider messages and refuses an unconfirmed database finish',async()=>{
  vi.mocked(deps.client.getSubscription).mockReset().mockRejectedValue(new Error('Bearer private provider payload'));
  const result=await executeAsaasPlanChange(request,input,deps);expect(JSON.stringify(result)).not.toContain('private provider');
  expect(deps.client.updateSubscription).not.toHaveBeenCalled();
 });
});
