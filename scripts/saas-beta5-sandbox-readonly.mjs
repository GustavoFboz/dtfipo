#!/usr/bin/env node
// DentalFlow Stage 5: two GETs against Asaas Sandbox, never production.
// No billing writes, paymentBook, checkout, webhook calls or raw provider logs.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SANDBOX_BASE = "https://api-sandbox.asaas.com";
const PAID = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH", "DUNNING_RECEIVED"]);
export class SandboxProbeError extends Error {
  constructor(code) { super(code); this.name = "SandboxProbeError"; this.code = code; }
}
function refuse(code) { throw new SandboxProbeError(code); }
function checkConfig(key, id, amount) {
  if (typeof key !== "string" || !/^\$aact_hmlg_[^\s]{16,}$/.test(key))
    refuse("SANDBOX_KEY_NOT_CONFIRMED");
  if (typeof id !== "string" || !/^sub_[A-Za-z0-9]{6,70}$/.test(id))
    refuse("SUBSCRIPTION_ID_INVALID");
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000000)
    refuse("EXPECTED_AMOUNT_INVALID");
}
function dueMonth(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    refuse("DUE_DATE_INVALID");
  const date = new Date(value + "T00:00:00Z");
  if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    refuse("DUE_DATE_INVALID");
  return value.slice(0, 7);
}
function amountInCents(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) refuse("AMOUNT_INVALID");
  const cents = Math.round(value * 100);
  if (Math.abs(cents - value * 100) > 0.00001) refuse("AMOUNT_INVALID");
  return cents;
}
function adjacentMonths(a, b) {
  const first = a.split("-").map(Number);
  const second = b.split("-").map(Number);
  return (second[0] - first[0]) * 12 + second[1] - first[1] === 1;
}
export function assessSandboxInvoicePair({subscription, payments, id, expectedCents}) {
  if (!subscription || subscription.id !== id || subscription.cycle !== "MONTHLY" ||
    !/^cus_[A-Za-z0-9]{3,70}$/.test(subscription.customer ?? "") ||
    subscription.deleted === true) refuse("SUBSCRIPTION_MISMATCH");
  if (!payments || payments.hasMore !== false || !Array.isArray(payments.data) ||
    payments.data.length > 100) refuse("PAYMENT_LIST_INCOMPLETE");
  const ids = new Set(), dueMonths = new Set();
  let paidCount = 0;
  for (const p of payments.data) {
    if (!p || !/^pay_[A-Za-z0-9]{3,70}$/.test(p.id ?? "") || ids.has(p.id))
      refuse("PAYMENT_ID_INVALID_OR_DUPLICATE");
    ids.add(p.id);
    if (p.subscription !== id || p.customer !== subscription.customer ||
      p.deleted === true || amountInCents(p.value) !== expectedCents)
      refuse("PAYMENT_LINK_OR_PRICE_MISMATCH");
    const month = dueMonth(p.dueDate);
    if (dueMonths.has(month)) refuse("MONTHLY_INVOICE_DUPLICATED");
    dueMonths.add(month);
    if (PAID.has(p.status)) paidCount++;
  }
  const sorted = [...dueMonths].sort();
  const secondInvoice = sorted.some((m,i) => i>0 && adjacentMonths(sorted[i-1],m));
  return {
    schema:"dentalflow-stage5-sandbox-readback-v1",
    environment:"sandbox", mode:"read_only",
    checked_at:new Date().toISOString(),
    provider_get_requests:2,
    invoice_count:ids.size, paid_invoice_count:paidCount,
    successive_months_verified:secondInvoice,
    level:secondInvoice && paidCount>0 ? "provider_second_invoice_readback" : "partial_readback",
    webhook_confirmed:false, ledger_reconciled:false,
    entitlement_renewal_confirmed:false, cancellation_confirmed:false,
    stage5_done:false, sandbox_mutations:0, production_mutations:0,
    release_authorized:false
  };
}
async function readSandboxJson(id, suffix, key, fetchImpl) {
  const path="/v3/subscriptions/"+id+suffix;
  const url=new URL(path,SANDBOX_BASE);
  if (url.origin!==SANDBOX_BASE || !/^\/v3\/subscriptions\/sub_[A-Za-z0-9]{6,70}(\/payments)?$/.test(path))
    refuse("UNSAFE_ENDPOINT");
  let response;
  try {
    response=await fetchImpl(url.toString(),{
      method:"GET",redirect:"error",signal:AbortSignal.timeout(9000),
      headers:{"access_token":key,"accept":"application/json",
        "User-Agent":"DentalFlowBeta5Readback/1.0"}
    });
  } catch { refuse("SANDBOX_TRANSPORT_UNAVAILABLE"); }
  if (response.status!==200) refuse("SANDBOX_HTTP_"+String(response.status));
  let raw;
  try { raw=await response.text(); } catch { refuse("SANDBOX_RESPONSE_UNREADABLE"); }
  if (raw.length>64000) refuse("SANDBOX_RESPONSE_TOO_LARGE");
  try { return JSON.parse(raw); } catch { refuse("SANDBOX_JSON_INVALID"); }
}
export async function probeSandbox({key,id,expectedCents,fetchImpl=fetch}) {
  checkConfig(key,id,expectedCents);
  const subscription=await readSandboxJson(id,"",key,fetchImpl);
  const payments=await readSandboxJson(id,"/payments",key,fetchImpl);
  return assessSandboxInvoicePair({subscription,payments,id,expectedCents});
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const result=await probeSandbox({
      key:process.env.ASAAS_SANDBOX_READONLY_API_KEY,
      id:process.env.ASAAS_SANDBOX_SUBSCRIPTION_ID,
      expectedCents:Number(process.env.ASAAS_SANDBOX_EXPECTED_CENTS)
    });
    console.log(JSON.stringify(result,null,2));
    if (result.level!=="provider_second_invoice_readback") process.exitCode=2;
  } catch (error) {
    console.error(JSON.stringify({
      schema:"dentalflow-stage5-sandbox-readback-v1",environment:"sandbox",
      status:"blocked",code:error instanceof SandboxProbeError?error.code:"UNEXPECTED_ERROR",
      stage5_done:false,sandbox_mutations:0,production_mutations:0
    }));
    process.exitCode=1;
  }
}
