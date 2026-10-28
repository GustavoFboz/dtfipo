import {z} from 'zod';
import {createHash} from 'node:crypto';
import {AsaasClient,loadAsaasAdministrativeConfig,type AsaasSubscription,type AsaasPayment} from './asaas.server';
import {readCheckoutBody,requestOriginAllowed} from './asaas-checkout.server';

const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v);
const inputSchema=z.object({requestId:z.string().uuid(),environment:z.enum(['sandbox','production']),
 reason:z.string().trim().min(16).max(300).refine(v=>!/[\u0000-\u001f\u007f]/.test(v)),reconcileOnly:z.boolean()}).strict();
const claimSchema=z.object({done:z.literal(false),request_id:z.string().uuid(),lease_token:z.string().uuid(),subscription_id:z.string().uuid(),
 external_subscription_id:z.string().regex(/^sub_[A-Za-z0-9]+$/),external_customer_id:z.string().regex(/^cus_[A-Za-z0-9]+$/),
 current_amount_cents:z.number().int().positive(),provider_amount_cents:z.number().int().positive(),target_amount_cents:z.number().int().min(500),
 effective_date:date,environment:z.enum(['sandbox','production']),reconcile_only:z.boolean(),write_started:z.boolean()});
type Input=z.infer<typeof inputSchema>;type Claim=z.infer<typeof claimSchema>;
type PlanProof=AsaasSubscription&{invoice_digest:string;invoice_count:number};
type Dependencies={environment:Input['environment'];claim:(input:Input)=>Promise<unknown>;
 beginWrite:(claim:Claim)=>Promise<boolean>;finish:(claim:Claim,proof:PlanProof|null,code:string|null)=>Promise<unknown>;
 client:Pick<AsaasClient,'getSubscription'|'updateSubscription'|'listPaymentsForReconciliation'>};
type Result={ok:true;requestId:string;environment:Input['environment'];status:'completed'|'review_required'}
 |{ok:false;code:string;error:string;status:number};

function verifiedSubscription(value:AsaasSubscription,c:Claim){
 if(value?.id!==c.external_subscription_id||value.customer!==c.external_customer_id
  ||value.externalReference!==`dentalflow:subscription:${c.subscription_id}`||value.cycle!=='MONTHLY'
  ||value.status!=='ACTIVE'||value.deleted!==false||!['UNDEFINED','BOLETO','PIX'].includes(value.billingType??'')
  ||!Number.isFinite(value.value)||!Number.isSafeInteger(Math.round(value.value!*100))
  ||Math.abs(value.value!*100-Math.round(value.value!*100))>0.000001
  ||![c.provider_amount_cents,c.target_amount_cents].includes(Math.round(value.value!*100)))
  throw new Error('BILLING_PLAN_PROVIDER_MISMATCH');
 return value;
}
function invoiceState(payments:AsaasPayment[],c:Claim,allowNewPeriod=false){
 const seen=new Set<string>(),futureDates=new Set<string>();
 const values=payments.map(p=>{
  if(!/^pay_[A-Za-z0-9]+$/.test(p.id)||seen.has(p.id)||p.customer!==c.external_customer_id
   ||p.subscription!==c.external_subscription_id||p.deleted!==false||!date.safeParse(p.dueDate).success
   ||!Number.isFinite(p.value)||Math.abs(p.value!*100-Math.round(p.value!*100))>0.000001)
   throw new Error('BILLING_PLAN_PROVIDER_MISMATCH');
  seen.add(p.id);
  // Existing future invoices require their own financial review. This endpoint
  // never reprices, deletes or generates an invoice to make a plan change fit.
  if(p.dueDate!>=c.effective_date){
   if(!allowNewPeriod||Math.round(p.value!*100)!==c.target_amount_cents||futureDates.has(p.dueDate!))throw new Error('FUTURE_INVOICE_REVIEW');
   futureDates.add(p.dueDate!);
  }
  return JSON.stringify([p.id,p.customer,p.subscription,p.value,p.dueDate,p.billingType,p.deleted]);
 }).sort();
 if(futureDates.size>0&&![...futureDates].includes(c.effective_date))throw new Error('FUTURE_INVOICE_REVIEW');
 return values;
}
function failure(error:unknown):Extract<Result,{ok:false}>{
 const code=/\b(?:BILLING_PLAN_[A-Z_]+|BILLING_CANCEL_[A-Z_]+)\b/.exec(error instanceof Error?error.message:'')?.[0]??'BILLING_PLAN_UNAVAILABLE';
 const status=/FORBIDDEN|MFA|SESSION|PRODUCTION_DISABLED/.test(code)?403:/BUSY|STALE|NOT_ELIGIBLE/.test(code)?409:503;
 return {ok:false,code,status,error:status===403?'Confirme a sessão Master e o autenticador. A execução em Produção depende da homologação Sandbox.'
  :status===409?'O contrato, a vigência ou os limites mudaram. Atualize e revise a solicitação.'
  :'O resultado não foi confirmado. Atualize e confira a troca antes de qualquer nova tentativa.'};
}
async function dependencies(request:Request,environment:Input['environment']):Promise<Dependencies>{
 if(environment==='production'&&process.env.ASAAS_PLAN_CHANGES_PRODUCTION_ENABLED!=='true')throw new Error('BILLING_PLAN_PRODUCTION_DISABLED');
 const token=/^Bearer ([A-Za-z0-9._~-]{20,4096})$/.exec(request.headers.get('authorization')??'')?.[1];
 if(!token||token.split('.').length!==3)throw new Error('BILLING_PLAN_FORBIDDEN');
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new Error('BILLING_PLAN_CONFIGURATION');
 const {createClient}=await import('@supabase/supabase-js');
 const actor=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const {data,error}=await actor.auth.getUser(token);if(error||!data.user)throw new Error('BILLING_PLAN_FORBIDDEN');
 const config=loadAsaasAdministrativeConfig(environment);
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const rpc=async(client:typeof actor,name:string,args:Record<string,unknown>)=>{
  const {data,error}=await client.rpc(name,args);if(error)throw new Error(error.message);return data;};
 return {environment:config.environment,client:new AsaasClient({...config,timeoutMs:2500,maxGetRetries:0,minRequestIntervalMs:500}),
  claim:i=>rpc(actor,'platform_master_claim_plan_change',{p_request_id:i.requestId,p_environment:i.environment,p_reason:i.reason,p_reconcile_only:i.reconcileOnly}),
  beginWrite:async c=>(await rpc(actor,'platform_master_begin_plan_change_write',{p_request_id:c.request_id,p_lease_token:c.lease_token}))===true,
  finish:(c,proof,code)=>rpc(supabaseAdmin as unknown as typeof actor,'billing_finish_plan_change',{
   p_request_id:c.request_id,p_lease_token:c.lease_token,p_error_code:code,
   p_verified_subscription:proof?{id:proof.id,customer:proof.customer,externalReference:proof.externalReference,value:proof.value,
    cycle:proof.cycle,status:proof.status,deleted:proof.deleted,nextDueDate:proof.nextDueDate,billingType:proof.billingType,
    invoice_digest:proof.invoice_digest,invoice_count:proof.invoice_count}:null})};
}

/** A leased, single price update. Ambiguous/expired operations can only GET.
 * Price is scheduled; current plan, paid ledger and offline grants stay intact. */
export async function executeAsaasPlanChange(request:Request,input:unknown,injected?:Dependencies):Promise<Result>{
 if(!requestOriginAllowed(request))return failure(new Error('BILLING_PLAN_FORBIDDEN'));
 const parsed=inputSchema.safeParse(input);if(!parsed.success)return {ok:false,code:'BILLING_PLAN_INVALID',status:400,error:'Revise a solicitação e a justificativa.'};
 let c:Claim|undefined,deps:Dependencies|undefined;let attempted=false;
 try{
  deps=injected??await dependencies(request,parsed.data.environment);
  if(deps.environment!==parsed.data.environment)throw new Error('BILLING_PLAN_NOT_ELIGIBLE');
  const raw=await deps.claim(parsed.data);
  if(raw&&typeof raw==='object'&&'done' in raw&&raw.done===true&&'request_id' in raw&&raw.request_id===parsed.data.requestId)
   return {ok:true,requestId:parsed.data.requestId,environment:deps.environment,status:'completed'};
  c=claimSchema.parse(raw);
  if(c.request_id!==parsed.data.requestId||c.environment!==deps.environment||(parsed.data.reconcileOnly&&!c.reconcile_only))throw new Error('BILLING_PLAN_CLAIM_INVALID');
  const current=verifiedSubscription(await deps.client.getSubscription(c.external_subscription_id),c);
  const recovering=c.reconcile_only&&c.write_started;
  if(!date.safeParse(current.nextDueDate).success||(!recovering&&current.nextDueDate!==c.effective_date)
   ||current.nextDueDate!<c.effective_date)throw new Error('PROVIDER_CALENDAR_REVIEW');
  const since=new Date(Date.parse(c.effective_date+'T00:00:00Z')-31*86400000).toISOString().slice(0,10);
  const before=invoiceState(await deps.client.listPaymentsForReconciliation(c.external_subscription_id,since),c,recovering);
  if(Math.round(current.value!*100)!==c.target_amount_cents&&!c.reconcile_only){
   if(!await deps.beginWrite(c))throw new Error('BILLING_PLAN_WRITE_NOT_AUTHORIZED');
   attempted=true;
   try{await deps.client.updateSubscription(c.external_subscription_id,{value:c.target_amount_cents/100});}catch{/* GET decides; never resend PUT. */}
  }
  const proof=verifiedSubscription(await deps.client.getSubscription(c.external_subscription_id),c);
  const after=invoiceState(await deps.client.listPaymentsForReconciliation(c.external_subscription_id,since),c,recovering||attempted);
  const confirmed=Math.round(proof.value!*100)===c.target_amount_cents&&date.safeParse(proof.nextDueDate).success
   &&(proof.nextDueDate===c.effective_date||((recovering||attempted)&&proof.nextDueDate!>c.effective_date))
   &&before.every(value=>after.includes(value));
  const finished=await deps.finish(c,confirmed?{...proof,invoice_digest:createHash('sha256').update(JSON.stringify(before)).digest('hex'),invoice_count:before.length}:null,confirmed?null:'PROVIDER_STILL_OLD_PRICE');
  if(finished!==(confirmed?'completed':'review_required'))throw new Error('BILLING_PLAN_RESULT_UNCONFIRMED');
  return {ok:true,requestId:c.request_id,environment:c.environment,status:confirmed?'completed':'review_required'};
 }catch(error){
  if(c&&deps){const raw=error instanceof Error?error.message:'';
   const code=['FUTURE_INVOICE_REVIEW','PROVIDER_CALENDAR_REVIEW'].includes(raw)?raw:attempted?'PROVIDER_RESULT_UNCONFIRMED':'PROVIDER_REVIEW_REQUIRED';
   await deps.finish(c,null,code).catch(()=>undefined);}
  return failure(error);
 }
}
function json(request:Request,body:unknown,status:number){
 const headers=new Headers({'Cache-Control':'no-store',Vary:'Origin'});const origin=request.headers.get('origin');
 if(origin&&requestOriginAllowed(request)){headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Headers','authorization, content-type');headers.set('Access-Control-Allow-Methods','POST, OPTIONS');}
 return Response.json(body,{status,headers});
}
export async function handleAsaasPlanChange(request:Request):Promise<Response>{
 if(request.method==='OPTIONS')return requestOriginAllowed(request)?new Response(null,{status:204,headers:json(request,{},200).headers}):json(request,{},403);
 if(request.method!=='POST')return json(request,{},405);
 try{const r=await executeAsaasPlanChange(request,await readCheckoutBody(request));return json(request,r,r.ok?200:r.status);}
 catch{return json(request,{ok:false,code:'BILLING_PLAN_INVALID'},400);}
}
