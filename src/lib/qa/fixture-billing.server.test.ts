import {describe,it,expect,vi} from 'vitest';
import {AsaasClient,loadAsaasConfig} from '@/lib/billing/asaas.server';
import {assertFixturePayment,simulateFixturePayment} from './fixture-billing.server';
const sandbox=loadAsaasConfig({ASAAS_ENVIRONMENT:'sandbox',ASAAS_API_KEY:'$aact_hmlg_fixture_not_real_12345',ASAAS_WEBHOOK_TOKEN:'fixture_webhook_012345678901234567890123',ASAAS_USER_AGENT:'DentalFlow/QA'});
const contract={id:'4b2821a8-cd61-4c50-8f2d-ea55eb2b6c89',clinic_id:'081d3db4-1606-40f7-a878-19b51556317d',provider_environment:'sandbox',external_customer_id:'cus_fixture',external_subscription_id:'sub_fixture',status:'pending_checkout',plan_code:'company_growth',current_period_end:null};
const payment={id:'pay_fixture',customer:'cus_fixture',subscription:'sub_fixture',value:449,status:'PENDING'};
describe('fixed Sandbox fixture financial boundary',()=>{
  it.each([{...payment,customer:'cus_other'},{...payment,subscription:'sub_other'},{...payment,value:1},{...payment,deleted:true},{...payment,id:'../../payments/real'}])('refuses a provider resource outside the exact fixture contract',p=>expect(()=>assertFixturePayment(p,contract)).toThrow('FIXTURE_PROVIDER_PAYMENT_MISMATCH'));
  it.each([{...contract,provider_environment:'production'},{...contract,clinic_id:'a3d86f21-f1c0-4c08-82d2-dd405a6e2426'}])('refuses Production and other companies',c=>expect(()=>assertFixturePayment(payment,c)).toThrow());
  it('uses the official Sandbox simulation with one non-retried write',async()=>{
    const transport=vi.fn<typeof fetch>().mockResolvedValue(Response.json({id:'pay_fixture'}));await simulateFixturePayment(sandbox,'pay_fixture','confirm',transport);
    expect(transport).toHaveBeenCalledTimes(1);expect(String(transport.mock.calls[0][0])).toBe('https://api-sandbox.asaas.com/v3/sandbox/payment/pay_fixture/confirm');expect(transport.mock.calls[0][1]?.method).toBe('POST');
  });
  it('never sends a simulation to Production',async()=>{
    const transport=vi.fn<typeof fetch>();await expect(simulateFixturePayment({...sandbox,environment:'production',baseUrl:'https://api.asaas.com/v3'},'pay_fixture','confirm',transport)).rejects.toThrow('FIXTURE_SANDBOX_REQUIRED');expect(transport).not.toHaveBeenCalled();
  });
  it('does not retry an inconclusive simulation',async()=>{
    const transport=vi.fn<typeof fetch>().mockResolvedValue(Response.json({},{status:503}));await expect(simulateFixturePayment(sandbox,'pay_fixture','confirm',transport)).rejects.toThrow('FIXTURE_SIMULATION_CONFIRM_FAILED');expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each(['sandbox','production'] as const)('disables only Sandbox customer notifications: %s',async environment=>{
    const transport=vi.fn<typeof fetch>().mockResolvedValue(Response.json({id:'cus_fixture',notificationDisabled:true}));
    const client=new AsaasClient({...sandbox,environment,baseUrl:environment==='sandbox'?'https://api-sandbox.asaas.com/v3':'https://api.asaas.com/v3',minRequestIntervalMs:0},{fetch:transport});
    await client.createCustomer({name:'Fixture',cpfCnpj:'11144477735',email:'fixture@example.invalid',mobilePhone:'11000000000',address:'Fixture',addressNumber:'1',province:'Fixture',postalCode:'01310000',externalReference:'dentalflow:fixture'});
    const body=JSON.parse(String(transport.mock.calls[0][1]?.body));if(environment==='sandbox') expect(body.notificationDisabled).toBe(true);else expect(body).not.toHaveProperty('notificationDisabled');
  });
});
