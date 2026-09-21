import {
  AsaasProvisioningError,
  createSupabaseAsaasProvisioningStore,
  provisionAsaasResources,
} from "./asaas-provisioning.server";
import { AsaasApiError, AsaasClient, loadAsaasConfig, type AsaasPayment } from "./asaas.server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUSTOMER_ID_PATTERN = /^cus_[A-Za-z0-9]+$/;
const SUBSCRIPTION_ID_PATTERN = /^sub_[A-Za-z0-9]+$/;
const PAYMENT_ID_PATTERN = /^pay_[A-Za-z0-9]+$/;
const MAX_REQUEST_BYTES = 2_048;

type CheckoutContext = {
  checkout_intent_id: string;
  subscription_id: string;
  clinic_id: string;
  plan_code: string;
  plan_name: string;
  amount_cents: number;
  currency: string;
  status: "pending" | "provider_created";
  expires_at: string;
  provider_environment: "sandbox" | "production";
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  provider_payment_id: string | null;
  provider_payment_url: string | null;
};

export type AsaasCheckoutResult = {
  checkoutIntentId: string;
  subscriptionId: string;
  paymentId: string;
  paymentUrl: string;
  dueDate: string;
  amountCents: number;
  currency: "BRL";
  environment: "sandbox" | "production";
  customerReused: boolean;
  subscriptionReused: boolean;
  paymentConfirmed: false;
};

type CheckoutPaymentSelection = {
  paymentId: string;
  paymentUrl: string;
  dueDate: string;
};

type CheckoutErrorBody = { error: string; code: string };

class CheckoutRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "CheckoutRequestError";
    this.code = code;
    this.status = status;
  }
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function isAllowedRequestOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  if (
    (url.protocol === "tauri:" || url.protocol === "capacitor:") &&
    url.hostname === "localhost"
  ) {
    return true;
  }

  if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
    return true;
  }

  if (url.protocol !== "https:") return false;
  return (
    url.hostname === "dtfipo.lovable.app" ||
    url.hostname.endsWith(".lovable.app") ||
    url.hostname.endsWith(".lovableproject.com") ||
    url.hostname.endsWith(".lovableproject-dev.com") ||
    url.hostname.endsWith(".gpt-eng.com") ||
    url.hostname.endsWith(".gptengineer.run")
  );
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  });
  const origin = request.headers.get("origin");
  if (origin && isAllowedRequestOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, content-type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Max-Age", "600");
  }
  return headers;
}

function jsonResponse(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
}

function requestOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin === null || isAllowedRequestOrigin(origin);
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._~-]{20,4096})$/.exec(authorization);
  return match?.[1] ?? null;
}

async function readCheckoutBody(request: Request): Promise<{ checkoutIntentId?: unknown }> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new CheckoutRequestError(
      "UNSUPPORTED_MEDIA_TYPE",
      "Envie a solicitação no formato JSON.",
      415,
    );
  }

  if (!request.body) {
    throw new CheckoutRequestError("INVALID_REQUEST_BODY", "Requisição inválida.", 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_REQUEST_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new CheckoutRequestError("REQUEST_TOO_LARGE", "Requisição muito grande.", 413);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid body");
    }
    return parsed as { checkoutIntentId?: unknown };
  } catch {
    throw new CheckoutRequestError("INVALID_REQUEST_BODY", "Requisição inválida.", 400);
  }
}

function nextDueDate(now = new Date()): string {
  return new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function publicCheckoutErrorMessage(code: string): string {
  if (code === "BILLING_PROFILE_REQUIRED") {
    return "Preencha os dados de cobrança da empresa antes de continuar.";
  }
  if (code === "PROVIDER_OPERATION_BUSY") {
    return "Outra tentativa ainda está sendo processada. Aguarde alguns segundos e tente novamente.";
  }
  if (code === "ASAAS_PAYMENT_NOT_READY") {
    return "A assinatura foi criada e o Asaas ainda está preparando a cobrança. Tente novamente em instantes.";
  }
  if (code.includes("FORBIDDEN")) return "Sua sessão não permite gerenciar esta assinatura.";
  if (code.includes("NOT_FOUND"))
    return "O checkout não foi encontrado ou não está mais disponível.";
  if (code.includes("EXPIRED"))
    return "Este checkout expirou. Gere um novo checkout para continuar.";
  if (code.includes("LOCKED")) {
    return "Esta assinatura já possui uma cobrança vinculada. Conclua a cobrança atual antes de alterar o plano.";
  }
  if (
    code.includes("UNCERTAIN") ||
    code.includes("REVIEW_REQUIRED") ||
    code.includes("CONFLICT") ||
    code.includes("DUPLICATE")
  ) {
    return "A cobrança foi bloqueada para evitar duplicidade. O registro precisa ser conferido antes de uma nova tentativa.";
  }
  if (code.startsWith("ASAAS_")) {
    return "O Asaas não aceitou a preparação da cobrança. Confira os dados da empresa e tente novamente.";
  }
  return "O checkout não pôde ser preparado com os dados atuais.";
}

function checkoutError(error: unknown): { body: CheckoutErrorBody; status: number } {
  if (error instanceof CheckoutRequestError) {
    return { body: { error: error.message, code: error.code }, status: error.status };
  }

  if (error instanceof AsaasProvisioningError || error instanceof AsaasApiError) {
    const status =
      error.code === "PROVIDER_OPERATION_BUSY"
        ? 409
        : error.code.includes("FORBIDDEN")
          ? 403
          : error.code.includes("NOT_FOUND")
            ? 404
            : error.code.includes("UNCERTAIN") || error.code.includes("REVIEW_REQUIRED")
              ? 409
              : error.code === "ASAAS_PAYMENT_NOT_READY"
                ? 503
                : error instanceof AsaasApiError &&
                    error.status &&
                    error.status >= 400 &&
                    error.status < 500
                  ? error.status
                  : 400;
    return {
      body: { error: publicCheckoutErrorMessage(error.code), code: error.code },
      status,
    };
  }

  const message = error instanceof Error ? error.message : "";
  const knownCode = /\b(BILLING_[A-Z0-9_]+)\b/.exec(message)?.[1] ?? null;
  if (knownCode) {
    return {
      body: { error: publicCheckoutErrorMessage(knownCode), code: knownCode },
      status: knownCode.includes("FORBIDDEN") ? 403 : knownCode.includes("NOT_FOUND") ? 404 : 400,
    };
  }

  return {
    body: {
      error: "Não foi possível preparar o pagamento com segurança.",
      code: "ASAAS_CHECKOUT_FAILED",
    },
    status: 500,
  };
}

function parseCheckoutContext(value: unknown): CheckoutContext {
  if (!value || typeof value !== "object") {
    throw new AsaasProvisioningError("INVALID_CHECKOUT_CONTEXT", "Checkout interno inválido.");
  }
  const context = value as Partial<CheckoutContext>;
  if (
    !UUID_PATTERN.test(context.checkout_intent_id ?? "") ||
    !UUID_PATTERN.test(context.subscription_id ?? "") ||
    !UUID_PATTERN.test(context.clinic_id ?? "") ||
    !Number.isSafeInteger(context.amount_cents) ||
    Number(context.amount_cents) <= 0 ||
    context.currency !== "BRL" ||
    !["pending", "provider_created"].includes(context.status ?? "") ||
    !["sandbox", "production"].includes(context.provider_environment ?? "")
  ) {
    throw new AsaasProvisioningError("INVALID_CHECKOUT_CONTEXT", "Checkout interno inválido.");
  }
  return context as CheckoutContext;
}

export function selectInitialSubscriptionPayment(input: {
  payments: AsaasPayment[];
  client: Pick<AsaasClient, "validatePaymentUrl">;
  subscriptionId: string;
  customerId: string;
  amountCents: number;
}): CheckoutPaymentSelection | null {
  const candidates = input.payments
    .filter(
      (payment) =>
        payment.subscription === input.subscriptionId &&
        payment.customer === input.customerId &&
        PAYMENT_ID_PATTERN.test(payment.id) &&
        typeof payment.invoiceUrl === "string" &&
        typeof payment.dueDate === "string" &&
        Math.round(Number(payment.value) * 100) === input.amountCents,
    )
    .sort((left, right) => String(left.dueDate).localeCompare(String(right.dueDate)));

  const payment = candidates[0];
  if (!payment?.invoiceUrl || !payment.dueDate) return null;
  return {
    paymentId: payment.id,
    paymentUrl: input.client.validatePaymentUrl(payment.invoiceUrl),
    dueDate: payment.dueDate,
  };
}

async function waitForInitialPayment(input: {
  client: AsaasClient;
  subscriptionId: string;
  customerId: string;
  amountCents: number;
}): Promise<CheckoutPaymentSelection> {
  for (const delay of [0, 250, 750, 1_500]) {
    if (delay > 0) await sleep(delay);
    const payment = selectInitialSubscriptionPayment({
      ...input,
      payments: await input.client.listSubscriptionPayments(input.subscriptionId),
    });
    if (payment) return payment;
  }
  throw new AsaasProvisioningError(
    "ASAAS_PAYMENT_NOT_READY",
    "A assinatura foi criada, mas a cobrança ainda está sendo preparada. Tente novamente em instantes.",
  );
}

async function loadAuthenticatedUserId(request: Request): Promise<string> {
  const token = bearerToken(request);
  if (!token) throw new AsaasProvisioningError("BILLING_CHECKOUT_FORBIDDEN", "Sessão inválida.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user?.id) {
    throw new AsaasProvisioningError("BILLING_CHECKOUT_FORBIDDEN", "Sessão inválida.");
  }
  return data.user.id;
}

async function loadCheckoutContext(
  checkoutIntentId: string,
  actorUserId: string,
  environment: "sandbox" | "production",
): Promise<CheckoutContext> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("billing_get_checkout_provisioning_context", {
    p_checkout_intent_id: checkoutIntentId,
    p_actor_user_id: actorUserId,
    p_provider_environment: environment,
  });
  if (error) throw new Error(error.message);
  return parseCheckoutContext(data);
}

async function markCheckoutReady(input: {
  checkoutIntentId: string;
  actorUserId: string;
  environment: "sandbox" | "production";
  customerId: string;
  subscriptionId: string;
  payment: CheckoutPaymentSelection;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("billing_mark_asaas_checkout_ready", {
    p_checkout_intent_id: input.checkoutIntentId,
    p_actor_user_id: input.actorUserId,
    p_provider_environment: input.environment,
    p_provider_customer_id: input.customerId,
    p_provider_subscription_id: input.subscriptionId,
    p_provider_payment_id: input.payment.paymentId,
    p_provider_payment_url: input.payment.paymentUrl,
  });
  if (error) throw new Error(error.message);
}

async function provisionCheckout(
  checkoutIntentId: string,
  actorUserId: string,
): Promise<AsaasCheckoutResult> {
  const config = loadAsaasConfig();
  const checkout = await loadCheckoutContext(checkoutIntentId, actorUserId, config.environment);
  const client = new AsaasClient(config);

  if (
    checkout.status === "provider_created" &&
    checkout.provider_customer_id &&
    checkout.provider_subscription_id &&
    checkout.provider_payment_id &&
    checkout.provider_payment_url &&
    CUSTOMER_ID_PATTERN.test(checkout.provider_customer_id) &&
    SUBSCRIPTION_ID_PATTERN.test(checkout.provider_subscription_id) &&
    PAYMENT_ID_PATTERN.test(checkout.provider_payment_id)
  ) {
    const payment = await waitForInitialPayment({
      client,
      subscriptionId: checkout.provider_subscription_id,
      customerId: checkout.provider_customer_id,
      amountCents: checkout.amount_cents,
    });
    if (payment.paymentId !== checkout.provider_payment_id) {
      throw new AsaasProvisioningError(
        "BILLING_CHECKOUT_PROVIDER_CONFLICT",
        "A cobrança do checkout diverge do registro interno.",
      );
    }
    return {
      checkoutIntentId: checkout.checkout_intent_id,
      subscriptionId: checkout.provider_subscription_id,
      paymentId: checkout.provider_payment_id,
      paymentUrl: client.validatePaymentUrl(checkout.provider_payment_url),
      dueDate: payment.dueDate,
      amountCents: checkout.amount_cents,
      currency: "BRL",
      environment: config.environment,
      customerReused: true,
      subscriptionReused: true,
      paymentConfirmed: false,
    };
  }

  const store = createSupabaseAsaasProvisioningStore();
  const provisioningContext = await store.loadContext({
    subscriptionId: checkout.subscription_id,
    actorUserId,
    environment: config.environment,
  });
  const provisioned = await provisionAsaasResources(
    provisioningContext,
    { nextDueDate: nextDueDate(), billingType: "UNDEFINED" },
    { client, store },
  );
  const payment = await waitForInitialPayment({
    client,
    subscriptionId: provisioned.subscriptionId,
    customerId: provisioned.customerId,
    amountCents: checkout.amount_cents,
  });

  await markCheckoutReady({
    checkoutIntentId: checkout.checkout_intent_id,
    actorUserId,
    environment: config.environment,
    customerId: provisioned.customerId,
    subscriptionId: provisioned.subscriptionId,
    payment,
  });

  return {
    checkoutIntentId: checkout.checkout_intent_id,
    subscriptionId: provisioned.subscriptionId,
    paymentId: payment.paymentId,
    paymentUrl: payment.paymentUrl,
    dueDate: payment.dueDate,
    amountCents: checkout.amount_cents,
    currency: "BRL",
    environment: config.environment,
    customerReused: provisioned.customerReused,
    subscriptionReused: provisioned.subscriptionReused,
    paymentConfirmed: false,
  };
}

export async function handleAsaasCheckoutOptions(request: Request): Promise<Response> {
  if (!requestOriginAllowed(request))
    return jsonResponse(request, { error: "Origem inválida." }, 403);
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function handleAsaasCheckoutRequest(request: Request): Promise<Response> {
  if (!requestOriginAllowed(request))
    return jsonResponse(request, { error: "Origem inválida." }, 403);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return jsonResponse(
      request,
      { error: "Requisição muito grande.", code: "REQUEST_TOO_LARGE" },
      413,
    );
  }

  try {
    const actorUserId = await loadAuthenticatedUserId(request);
    const body = await readCheckoutBody(request);
    const checkoutIntentId = String(body?.checkoutIntentId ?? "");
    if (!UUID_PATTERN.test(checkoutIntentId)) {
      return jsonResponse(
        request,
        { error: "Checkout inválido.", code: "INVALID_CHECKOUT_INTENT" },
        400,
      );
    }
    return jsonResponse(request, await provisionCheckout(checkoutIntentId, actorUserId));
  } catch (error) {
    const normalized = checkoutError(error);
    if (normalized.status >= 500) console.error("[Asaas checkout]", normalized.body.code);
    return jsonResponse(request, normalized.body, normalized.status);
  }
}
