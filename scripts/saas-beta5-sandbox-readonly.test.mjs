import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {assessSandboxInvoicePair,probeSandbox} from "./saas-beta5-sandbox-readonly.mjs";

const id="sub_ABCDEF123456",customer="cus_ABCDEF123";
const key="$aact_hmlg_"+"x".repeat(24);
const subscription={id,customer,cycle:"MONTHLY",status:"ACTIVE"};
const a={id:"pay_ABCDEF111",subscription:id,customer,value:199,dueDate:"2026-10-15",status:"RECEIVED"};
const b={id:"pay_ABCDEF222",subscription:id,customer,value:199,dueDate:"2026-11-15",status:"PENDING"};
const payments={hasMore:false,data:[a,b]};
const assess=(sub=subscription,p=payments)=>
  assessSandboxInvoicePair({subscription:sub,payments:p,id,expectedCents:19900});

describe("stage 5 Asaas Sandbox readback without side effects",()=>{
 it("recognizes next month but never claims full lifecycle or release",()=>{
   const x=assess();
   assert.equal(x.level,"provider_second_invoice_readback");
   assert.equal(x.invoice_count,2);assert.equal(x.paid_invoice_count,1);
   assert.equal(x.stage5_done,false);
   assert.equal(x.webhook_confirmed,false);
   assert.equal(x.ledger_reconciled,false);
   assert.equal(x.sandbox_mutations,0);assert.equal(x.production_mutations,0);
 });
 it("keeps a single invoice or nonadjacent months partial",()=>{
   assert.equal(assess(subscription,{hasMore:false,data:[a]}).level,"partial_readback");
   assert.equal(assess(subscription,{hasMore:false,data:[a,{...b,dueDate:"2027-01-15"}]}).level,"partial_readback");
 });
 it("rejects wrong subscription, client, cycle, price, duplicate and pagination",()=>{
   assert.throws(()=>assess({...subscription,cycle:"WEEKLY"}),/SUBSCRIPTION_MISMATCH/);
   assert.throws(()=>assess(subscription,{hasMore:false,data:[a,{...b,customer:"cus_FAKE"}]}),/PAYMENT_LINK_OR_PRICE_MISMATCH/);
   assert.throws(()=>assess(subscription,{hasMore:false,data:[a,{...b,subscription:"sub_WRONG"}]}),/PAYMENT_LINK_OR_PRICE_MISMATCH/);
   assert.throws(()=>assess(subscription,{hasMore:false,data:[a,{...b,value:299}]}),/PAYMENT_LINK_OR_PRICE_MISMATCH/);
   assert.throws(()=>assess(subscription,{hasMore:false,data:[a,{...b,id:a.id}]}),/PAYMENT_ID_INVALID_OR_DUPLICATE/);
   assert.throws(()=>assess(subscription,{hasMore:false,data:[a,{...b,dueDate:a.dueDate}]}),/MONTHLY_INVOICE_DUPLICATED/);
   assert.throws(()=>assess(subscription,{hasMore:true,data:[a,b]}),/PAYMENT_LIST_INCOMPLETE/);
 });
 it("rejects invalid provider dates without unsafe normalization",()=>{
   assert.throws(()=>assess(subscription,{hasMore:false,data:[{...a,dueDate:"2026-02-30"}]}),/DUE_DATE_INVALID/);
 });
 it("uses exactly two GET requests against fixed Sandbox API URLs",async()=>{
   const requests=[];
   const fetchImpl=async(url,init)=>{
     requests.push({url,init});
     return new Response(JSON.stringify(url.endsWith("/payments")?payments:subscription),
       {status:200,headers:{"Content-Type":"application/json"}});
   };
   const result=await probeSandbox({key,id,expectedCents:19900,fetchImpl});
   assert.equal(result.level,"provider_second_invoice_readback");
   assert.deepEqual(requests.map(r=>r.url),[
     "https://api-sandbox.asaas.com/v3/subscriptions/"+id,
     "https://api-sandbox.asaas.com/v3/subscriptions/"+id+"/payments"
   ]);
   assert.ok(requests.every(r=>r.init.method==="GET"&&r.init.redirect==="error"&&!r.init.body));
   assert.ok(!JSON.stringify(result).includes(id));
   assert.ok(!JSON.stringify(result).includes(customer));
 });
 it("rejects production keys, invalid IDs and prices before any provider request",async()=>{
   let called=false;const fetchImpl=async()=>{called=true;};
   await assert.rejects(probeSandbox({key:"$aact_prod_"+"x".repeat(24),id,expectedCents:19900,fetchImpl}),/SANDBOX_KEY_NOT_CONFIRMED/);
   await assert.rejects(probeSandbox({key,id:"sub_../../production",expectedCents:19900,fetchImpl}),/SUBSCRIPTION_ID_INVALID/);
   await assert.rejects(probeSandbox({key,id,expectedCents:NaN,fetchImpl}),/EXPECTED_AMOUNT_INVALID/);
   assert.equal(called,false);
 });
 it("does not leak provider bodies in an HTTP error",async()=>{
   await assert.rejects(probeSandbox({key,id,expectedCents:19900,
     fetchImpl:async()=>new Response("secret customer details",{status:401})}),error=>{
      assert.equal(error.code,"SANDBOX_HTTP_401");
      assert.ok(!error.message.includes("customer"));return true;
   });
 });
});
