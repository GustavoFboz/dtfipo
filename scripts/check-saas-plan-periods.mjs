import fs from 'node:fs';
const migration='20261028210000_saas_plan_price_periods.sql';
const sql=fs.readFileSync(`supabase/migrations/${migration}`,'utf8');
if(sql!==fs.readFileSync(`public/restore/migrations/${migration}`,'utf8'))throw new Error('Plan period restore differs');
const seal=fs.readFileSync('public/restore/migrations/20260718000001_zzz_self_heal_v2.sql','utf8');
for(const marker of ['public.billing_plan_periods,public.billing_plan_change_executions','public.billing_subscription_period_amount(uuid,date)',
 'public.platform_master_claim_plan_change(uuid,text,text,boolean)','public.billing_finish_plan_change(uuid,uuid,jsonb,text)'])
 if(!seal.includes(marker))throw new Error(`Plan period grant is not resealed: ${marker}`);
for(const path of ['docs/saas/PLAN-PRICE-PERIODS.md','docs/saas/sql/plan-price-periods-assertions.sql','docs/saas/sql/plan-price-periods-rehearsal.sql',
 'src/lib/billing/asaas-plan-change.server.ts','src/lib/billing/asaas-plan-change.server.test.ts','src/lib/billing-plan-change.test.ts','src/components/master/MasterPlanChangeRequest.test.tsx'])
 if(!fs.existsSync(path))throw new Error(`Plan period artifact missing: ${path}`);
const executor=fs.readFileSync('src/lib/billing/asaas-plan-change.server.ts','utf8');
for(const marker of ['maxGetRetries:0','ASAAS_PLAN_CHANGES_PRODUCTION_ENABLED',"await deps.beginWrite(c)","{value:c.target_amount_cents/100}",
 'FUTURE_INVOICE_REVIEW','PROVIDER_CALENDAR_REVIEW'])if(!executor.includes(marker))throw new Error(`Plan executor guard missing: ${marker}`);
if(/\.(?:createSubscription|createCustomer|deletePayment|updatePayment)\s*\(/.test(executor))throw new Error('Plan executor may not reissue invoices or contracts');
console.log('Plan price periods, private grants and single-write executor: OK');
