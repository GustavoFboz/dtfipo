import {describe,it,expect,vi} from 'vitest';
import {AsaasClient,loadAsaasConfig} from '@/lib/billing/asaas.server';
import {assertFixturePayment,simulateFixturePayment,assertFixtureCheckoutResponse,fixtureLedgerUnchanged,fixtureOldNoticeResolved,fixtureAccessMatches} from './fixture-billing.server';
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

describe('published checkout response and acceptance evidence',()=>{
  const intentId='a9d84a16-7c1b-4145-8610-7d14309d1fc5';
  const checkout={checkoutIntentId:intentId,subscriptionId:'sub_fixture',paymentId:'pay_fixture',
    paymentUrl:'https://sandbox.asaas.com/i/fixture',amountCents:44900,currency:'BRL',environment:'sandbox',paymentConfirmed:false};
  it('accepts the flat checkout returned by the HTTPS route',()=>{
    expect(()=>assertFixtureCheckoutResponse({status:200,body:checkout},intentId)).not.toThrow();
  });
  it.each([{ok:true,checkout},{ok:false},null,{...checkout,checkoutIntentId:'f18125c4-aac6-48b4-9b88-8d3ab98249fa'},
    {...checkout,environment:'production'},{...checkout,paymentConfirmed:true},{...checkout,amountCents:100},
    {...checkout,paymentUrl:'https://asaas.com/i/fixture'},{...checkout,paymentUrl:'https://sandbox.asaas.com.evil.invalid/i/fixture'},
    {...checkout,paymentUrl:'https://user@ sandbox.asaas.com/i/fixture'}, {...checkout,paymentUrl:'https://user@sandbox.asaas.com/i/fixture'}
  ])('rejects mismatched responses without promoting the checkout to a paid result: %j',body=>{
    expect(()=>assertFixtureCheckoutResponse({status:200,body},intentId)).toThrow('FIXTURE_CHECKOUT_TRANSPORT_FAILED');
  });
  it('requires a successful HTTP result even for a valid body',()=>{
    expect(()=>assertFixtureCheckoutResponse({status:503,body:checkout},intentId)).toThrow();
  });
  const row={id:'c49fca72-1252-4e54-88f2-21a5b96b1580',status:'paid',amount_cents:44900,
    period_start:'2026-10-17T13:00:00-04:00',period_end:'2026-11-17T13:00:00-04:00'};
  it('accepts one unchanged paid period, including equivalent timestamp offsets',()=>{
    expect(fixtureLedgerUnchanged([row],[{...row,period_start:'2026-10-17T17:00:00Z'}])).toBe(true);
  });
  it.each([[],[row,row],[{...row,id:'ae256819-8780-4f10-86fa-412f05f21d5e'}],
    [{...row,period_end:'2026-12-17T13:00:00-04:00'}],[{...row,period_start:row.period_end}],
    [{...row,status:'refunded'}],[{...row,amount_cents:100}]
  ].map(after=>({after})))('rejects duplicated, changed or unverified ledger outcomes: %j',({after})=>{
    expect(fixtureLedgerUnchanged([row],after)).toBe(false);
  });
  it('requires a verified baseline paid period',()=>expect(fixtureLedgerUnchanged([{...row,status:'pending'}],[row])).toBe(false));
  it.each([{status:'processed'},{status:'ignored',error_message:'SUPERSEDED_PROVIDER_STATUS'}])('recognizes a safely retired old notice',event=>{
    expect(fixtureOldNoticeResolved(event)).toBe(true);
  });
  it.each([undefined,{status:'pending'},{status:'dead_letter'},{status:'ignored'},
    {status:'ignored',error_message:'EXTERNAL_MANUAL_SANDBOX_TEST'}])('keeps other ignored or unresolved outcomes unaccepted',event=>{
    expect(fixtureOldNoticeResolved(event)).toBe(false);
  });
  const context={active_clinic_id:contract.clinic_id,effective_access:'billing_only',
    company:{subscription_id:contract.id,access_mode:'billing_only'}};
  it('requires the authenticated company to remain billing-only before confirmation',()=>{
    expect(fixtureAccessMatches(context,contract,false)).toBe(true);
    expect(fixtureAccessMatches({...context,effective_access:'full'},contract,false)).toBe(false);
    expect(fixtureAccessMatches({...context,active_clinic_id:'foreign'},contract,false)).toBe(false);
  });
  it('requires the exact subscription to expose full access after confirmation',()=>{
    const paid={...context,effective_access:'full',company:{...context.company,access_mode:'full'}};
    expect(fixtureAccessMatches(paid,contract,true)).toBe(true);
    expect(fixtureAccessMatches(context,contract,true)).toBe(false);
    expect(fixtureAccessMatches({...paid,company:{...paid.company,subscription_id:'foreign'}},contract,true)).toBe(false);
  });
});
