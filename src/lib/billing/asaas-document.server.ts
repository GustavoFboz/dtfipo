import { AsaasClient, loadAsaasConfig, type AsaasPayment } from "./asaas.server";
import { loadAuthenticatedUserId, readCheckoutBody, requestOriginAllowed } from "./asaas-checkout.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT = /^pay_[A-Za-z0-9]+$/;
type DocumentContext = {
  payment_id: string; customer_id: string; subscription_id: string;
  amount_cents: number; environment: "sandbox" | "production";
};
export type DocumentResult =
  | { ok: true; paymentUrl: string; environment: "sandbox" | "production" }
  | { ok: false; code: string; error: string; status: number };

export function selectHostedDocument(payment: AsaasPayment, context: DocumentContext,
  validateUrl: (value: string) => string): string {
  if (!PAYMENT.test(context.payment_id) || payment.id !== context.payment_id ||
    payment.customer !== context.customer_id || payment.subscription !== context.subscription_id ||
    !Number.isSafeInteger(context.amount_cents) || context.amount_cents <= 0 ||
    Math.round(Number(payment.value) * 100) !== context.amount_cents ||
    payment.deleted || !payment.invoiceUrl) {
    throw new Error("BILLING_DOCUMENT_PROVIDER_MISMATCH");
  }
  return validateUrl(payment.invoiceUrl);
}

const failure = (status: number): DocumentResult => ({ ok: false, status,
  code: status === 403 ? "BILLING_DOCUMENT_FORBIDDEN" : "BILLING_DOCUMENT_REVIEW_REQUIRED",
  error: status === 403 ? "Acesso não autorizado à cobrança." : "Não foi possível conferir a cobrança no Asaas.",
});

export async function executeAsaasDocumentRequest(request: Request, paymentId: string): Promise<DocumentResult> {
  if (!requestOriginAllowed(request)) return failure(403);
  if (!UUID.test(paymentId)) return failure(403);
  try {
    const actor = await loadAuthenticatedUserId(request);
    const config = loadAsaasConfig();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc("billing_get_asaas_payment_document_context", {
      p_payment_id: paymentId, p_actor_user_id: actor, p_environment: config.environment,
    });
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return failure(403);
    const context = data as DocumentContext;
    if (context.environment !== config.environment || !PAYMENT.test(context.payment_id)) return failure(403);
    const client = new AsaasClient(config);
    const payment = await client.getPayment(context.payment_id);
    return { ok: true, environment: config.environment,
      paymentUrl: selectHostedDocument(payment, context, (url) => client.validatePaymentUrl(url)) };
  } catch {
    console.error("[Asaas document] REVIEW_REQUIRED");
    return failure(503);
  }
}

function json(request: Request, result: DocumentResult | object, status: number): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Vary: "Origin" });
  const origin = request.headers.get("origin");
  if (origin && requestOriginAllowed(request)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, content-type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return new Response(JSON.stringify(result), { status, headers });
}

export async function handleAsaasDocumentRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return requestOriginAllowed(request)
    ? new Response(null, { status: 204, headers: json(request, {}, 200).headers }) : json(request, {}, 403);
  if (request.method !== "POST") return json(request, {}, 405);
  if (!requestOriginAllowed(request)) return json(request, failure(403), 403);
  try {
    const body = await readCheckoutBody(request);
    const result = await executeAsaasDocumentRequest(request, String(body.paymentId ?? ""));
    return json(request, result, result.ok ? 200 : result.status);
  } catch { return json(request, failure(403), 403); }
}
