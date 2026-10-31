import { AsaasClient, loadAsaasConfig, type AsaasPayment } from "./asaas.server";
import { AsaasProvisioningError } from "./asaas-provisioning.server";
import { z } from "zod";
import {
  loadAuthenticatedUserId,
  readCheckoutBody,
  requestOriginAllowed,
} from "./asaas-checkout.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUBSCRIPTION = /^sub_[A-Za-z0-9]+$/;
const CUSTOMER = /^cus_[A-Za-z0-9]+$/;
const PAYMENT = /^pay_[A-Za-z0-9]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type RenewalContext = {
  subscription_id: string;
  external_subscription_id: string;
  external_customer_id: string;
  provider_environment: "sandbox" | "production";
  monthly_price_cents: number;
  current_period_end: string;
  provider_price_cents?: number;
  price_periods?: { effective_date: string; amount_cents: number }[];
};

const priceContextSchema = z.object({ provider_amount_cents: z.number().int().positive(),
  periods: z.array(z.object({ effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount_cents: z.number().int().positive() })).max(100)
}).refine(p => new Set(p.periods.map(v => v.effective_date)).size === p.periods.length
  && p.periods.every(v => Number.isFinite(Date.parse(v.effective_date + "T00:00:00Z"))
    && new Date(v.effective_date + "T00:00:00Z").toISOString().slice(0,10) === v.effective_date));
export function parseRenewalPriceContext(value: unknown) { return priceContextSchema.parse(value); }
function expectedInvoiceAmount(context: RenewalContext, due: string): number {
  const period = context.price_periods?.filter(v => v.effective_date <= due).sort((a,b) => b.effective_date.localeCompare(a.effective_date))[0];
  return period?.amount_cents ?? context.monthly_price_cents;
}

export type RenewalInvoice = {
  paymentId: string;
  paymentUrl: string;
  dueDate: string;
  amountCents: number;
  environment: "sandbox" | "production";
};

export type RenewalResult =
  | { ok: true; invoice: RenewalInvoice | null; nextPeriodDate: string; billingType?: string }
  | { ok: false; code: string; error: string; status: number };

const failure = (code: string, error: string, status: number): RenewalResult =>
  ({ ok: false, code, error, status });

function parseContext(value: unknown): RenewalContext {
  const context = value as Partial<RenewalContext> | null;
  if (!context || !UUID.test(context.subscription_id ?? "") ||
    !SUBSCRIPTION.test(context.external_subscription_id ?? "") ||
    !CUSTOMER.test(context.external_customer_id ?? "") ||
    !["sandbox", "production"].includes(context.provider_environment ?? "") ||
    !Number.isSafeInteger(context.monthly_price_cents) || Number(context.monthly_price_cents) <= 0 ||
    !DATE.test(context.current_period_end?.slice(0, 10) ?? "")) {
    throw new Error("BILLING_RENEWAL_CONTEXT_INVALID");
  }
  return context as RenewalContext;
}

/** The provider's calendar can differ after an overdue simulation, a changed
 * due day or a short month. Never select a prior paid period or an invoice
 * beyond the lifecycle processor's 31-day prepayment window. */
export function upcomingMonthlyInvoices(payments: AsaasPayment[], periodEnd: string, now = Date.now()): AsaasPayment[] {
  const start = Date.parse(periodEnd.slice(0, 10) + "T00:00:00Z");
  if (!Number.isFinite(start) || !Number.isFinite(now)) throw new Error("BILLING_RENEWAL_CONTEXT_INVALID");
  const last = Math.min(start + 31 * 86400000, now + 31 * 86400000);
  return payments.filter(payment => {
    if (!DATE.test(payment.dueDate ?? "")) return false;
    const due = Date.parse(payment.dueDate + "T00:00:00Z");
    return Number.isFinite(due) && new Date(due).toISOString().slice(0, 10) === payment.dueDate
      && due >= start && due <= last;
  }).sort((a,b) => a.dueDate!.localeCompare(b.dueDate!));
}

/** Only the earliest unpaid invoice on the upcoming provider calendar. */
export function selectRenewalInvoice(input: {
  payments: AsaasPayment[];
  context: RenewalContext;
  validateUrl: (value: string) => string;
  now?: number;
}): RenewalInvoice | null {
  const { context } = input;
  const upcoming = upcomingMonthlyInvoices(input.payments, context.current_period_end, input.now)
    .filter(payment => ["PENDING", "OVERDUE"].includes(payment.status ?? ""));
  const due = upcoming[0]?.dueDate;
  const candidates = upcoming.filter(payment => payment.dueDate === due);
  if (candidates.length === 0) return null;
  if (candidates.length !== 1) throw new Error("BILLING_RENEWAL_AMBIGUOUS_INVOICE");
  const payment = candidates[0];
  const expectedAmount = expectedInvoiceAmount(context, payment.dueDate!);
  if (!PAYMENT.test(payment.id) || payment.customer !== context.external_customer_id ||
    payment.subscription !== context.external_subscription_id ||
    !Number.isFinite(payment.value) ||
    Math.round(Number(payment.value) * 100) !== expectedAmount ||
    payment.deleted || !payment.invoiceUrl) {
    throw new Error("BILLING_RENEWAL_INVOICE_MISMATCH");
  }
  return {
    paymentId: payment.id,
    paymentUrl: input.validateUrl(payment.invoiceUrl),
    dueDate: payment.dueDate!,
    amountCents: expectedAmount,
    environment: context.provider_environment,
  };
}

export async function executeAsaasRenewalRequest(request: Request, subscriptionId: string): Promise<RenewalResult> {
  if (!requestOriginAllowed(request)) return failure("INVALID_REQUEST_ORIGIN", "Origem inválida.", 403);
  if (!UUID.test(subscriptionId)) return failure("INVALID_SUBSCRIPTION_ID", "Assinatura inválida.", 400);
  try {
    const actorUserId = await loadAuthenticatedUserId(request);
    const config = loadAsaasConfig();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("billing_get_asaas_provisioning_context", {
      p_subscription_id: subscriptionId,
      p_actor_user_id: actorUserId,
      p_provider_environment: config.environment,
    });
    if (error) throw new Error(error.message);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("BILLING_RENEWAL_CONTEXT_INVALID");
    }
    const { data: stored, error: storedError } = await supabaseAdmin
      .from("account_subscriptions")
      .select("id,status,current_period_end,billing_provider,provider_environment,billing_cycle")
      .eq("id", subscriptionId).single();
    if (storedError || !stored || !["active", "past_due", "grace", "suspended"].includes(stored.status) ||
      stored.billing_provider !== "asaas" || stored.provider_environment !== config.environment ||
      stored.billing_cycle !== "MONTHLY" || !stored.current_period_end) {
      throw new Error("BILLING_RENEWAL_NOT_AVAILABLE");
    }
    const { data: paid, error: paidError } = await supabaseAdmin
      .from("billing_payments")
      .select("id")
      .eq("subscription_id", subscriptionId).eq("provider", "asaas")
      .eq("provider_environment", config.environment).eq("status", "paid").limit(1);
    if (paidError || !paid?.length) throw new Error("BILLING_RENEWAL_NOT_AVAILABLE");
    const { data: prices, error: priceError } = await (supabaseAdmin as any).rpc("billing_subscription_price_context", { p_subscription_id: subscriptionId });
    if (priceError) throw new Error("BILLING_RENEWAL_PRICE_REVIEW");
    const pricing = parseRenewalPriceContext(prices);
    const context = parseContext({ ...data, current_period_end: stored.current_period_end,
      provider_price_cents: pricing.provider_amount_cents, price_periods: pricing.periods });
    if (context.provider_environment !== config.environment) throw new Error("BILLING_RENEWAL_ENVIRONMENT_MISMATCH");
    const client = new AsaasClient(config);
    const subscription = await client.getSubscription(context.external_subscription_id);
    if (subscription.id !== context.external_subscription_id ||
      subscription.customer !== context.external_customer_id ||
      subscription.cycle !== "MONTHLY" || subscription.status !== "ACTIVE" ||
      subscription.deleted ||
      subscription.externalReference !== `dentalflow:subscription:${context.subscription_id}` ||
      Math.round(Number(subscription.value) * 100) !== (context.provider_price_cents ?? context.monthly_price_cents)) {
      throw new Error("BILLING_RENEWAL_SUBSCRIPTION_MISMATCH");
    }
    const payments = await client.listPaymentsForReconciliation(
      context.external_subscription_id, context.current_period_end.slice(0, 10),
    );
    const invoice = selectRenewalInvoice({
        payments,
        context,
        validateUrl: (url) => client.validatePaymentUrl(url),
      });
    return {
      ok: true,
      invoice,
      nextPeriodDate: invoice?.dueDate ?? context.current_period_end.slice(0, 10),
      billingType: subscription.billingType,
    };
  } catch (error) {
    const code = error instanceof AsaasProvisioningError ? error.code
      : error instanceof Error ? error.message : "BILLING_RENEWAL_FAILED";
    if (code.includes("FORBIDDEN") || code === "BILLING_RENEWAL_NOT_AVAILABLE") {
      return failure("BILLING_RENEWAL_FORBIDDEN", "Esta sessão não pode abrir a cobrança da empresa.", 403);
    }
    console.error("[Asaas renewal]", /^[A-Z_]+$/.test(code) ? code : "PROVIDER_REVIEW_REQUIRED");
    return failure("BILLING_RENEWAL_REVIEW_REQUIRED", "A cobrança ainda não pôde ser conferida no Asaas. Tente novamente mais tarde.", 503);
  }
}

function json(request: Request, body: unknown, status: number): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Vary: "Origin" });
  const origin = request.headers.get("origin");
  if (origin && requestOriginAllowed(request)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, content-type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export async function handleAsaasRenewalRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return requestOriginAllowed(request) ? new Response(null, { status: 204, headers: json(request, null, 200).headers }) : json(request, {}, 403);
  }
  if (request.method !== "POST") return json(request, {}, 405);
  if (!requestOriginAllowed(request)) return json(request, {}, 403);
  try {
    const body = await readCheckoutBody(request);
    const result = await executeAsaasRenewalRequest(request, String(body.subscriptionId ?? ""));
    return json(request, result, result.ok ? 200 : result.status);
  } catch {
    return json(request, failure("INVALID_REQUEST_BODY", "Requisição inválida.", 400), 400);
  }
}
