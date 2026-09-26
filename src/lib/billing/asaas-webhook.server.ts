import { timingSafeEqual } from "node:crypto";
import {
  AsaasClient,
  loadAsaasConfig,
  type AsaasPayment,
  type AsaasSubscription,
} from "./asaas.server";
import { classifyAsaasPaymentEvent, type AsaasProviderEnvironment } from "./asaas-contract";

const MAX_BODY_BYTES = 32_768;
const EVENT_ID = /^evt_[A-Za-z0-9&_-]{1,150}$/;
const EVENT_TYPE = /^[A-Z_]{3,100}$/;
const PAYMENT_ID = /^pay_[A-Za-z0-9]+$/;
const SUBSCRIPTION_ID = /^sub_[A-Za-z0-9]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONFIRMATION_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const LIFECYCLE_PAYMENT_EVENTS = new Set([
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
  "PAYMENT_REFUNDED",
]);
const SUBSCRIPTION_EVENTS = new Set([
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_UPDATED",
  "SUBSCRIPTION_INACTIVATED",
]);

type InboxEvent = {
  id: string;
  event_type: string;
  payload: { paymentId?: string; subscriptionId?: string };
  lease_token: string;
  attempt_count: number;
};

type WebhookDependencies = {
  environment: AsaasProviderEnvironment;
  webhookToken: string;
  receive: (input: {
    environment: AsaasProviderEnvironment;
    eventId: string;
    eventType: string;
    payload: { paymentId?: string; subscriptionId?: string };
  }) => Promise<void>;
};

type WorkerDependencies = {
  environment: AsaasProviderEnvironment;
  workerToken: string;
  claim: () => Promise<InboxEvent[]>;
  getPayment: (id: string) => Promise<AsaasPayment>;
  getSubscription: (id: string) => Promise<AsaasSubscription>;
  applyPayment: (event: InboxEvent, payment: AsaasPayment, cents: number) => Promise<void>;
  applySubscription: (
    event: InboxEvent,
    subscription: AsaasSubscription,
    cents: number,
  ) => Promise<void>;
  listExpiredGrace: () => Promise<{ subscription_id: string; payment_id: string }[]>;
  suspendGrace: (
    candidate: {
      subscription_id: string;
      payment_id: string;
    },
    payment: AsaasPayment,
  ) => Promise<boolean>;
  enqueueRecovery: (eventId: string, eventType: string, paymentId: string) => Promise<void>;
  finish: (event: InboxEvent, outcome: "ignored" | "failed", code?: string) => Promise<void>;
};

function equalSecret(provided: string | null, expected: string): boolean {
  if (!provided || expected.length < 32) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function readBoundedJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new Error("INVALID_CONTENT_TYPE");
  }
  if (!request.body) throw new Error("INVALID_BODY");
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("BODY_TOO_LARGE");
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new Error("INVALID_BODY");
  }
}

/** Returns 200 only after the authenticated event was committed to the inbox. */
export async function receiveAsaasWebhook(
  request: Request,
  dependencies?: WebhookDependencies,
): Promise<Response> {
  if (request.method !== "POST") return json({ received: false }, 405);
  let deps: WebhookDependencies;
  try {
    if (dependencies) {
      deps = dependencies;
    } else {
      const config = loadAsaasConfig();
      deps = {
        environment: config.environment,
        webhookToken: config.webhookToken,
        receive: async ({ environment, eventId, eventType, payload }) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.rpc("billing_receive_asaas_event", {
            p_environment: environment,
            p_event_id: eventId,
            p_event_type: eventType,
            p_payload: payload,
          });
          if (error) throw error;
        },
      };
    }
  } catch {
    console.error("[Asaas webhook] CONFIGURATION_FAILED");
    return json({ received: false }, 503);
  }
  if (!equalSecret(request.headers.get("asaas-access-token"), deps.webhookToken)) {
    return json({ received: false }, 401);
  }
  try {
    const event = await readBoundedJson(request);
    if (
      typeof event.id !== "string" ||
      !EVENT_ID.test(event.id) ||
      typeof event.event !== "string" ||
      !EVENT_TYPE.test(event.event)
    ) {
      return json({ received: false }, 400);
    }
    const payment = event.payment;
    const paymentId =
      payment && typeof payment === "object" && !Array.isArray(payment)
        ? (payment as { id?: unknown }).id
        : undefined;
    const subscription = event.subscription;
    const subscriptionId =
      subscription && typeof subscription === "object" && !Array.isArray(subscription)
        ? (subscription as { id?: unknown }).id
        : undefined;
    const payload: { paymentId?: string; subscriptionId?: string } = {};
    if (typeof paymentId === "string" && PAYMENT_ID.test(paymentId)) {
      payload.paymentId = paymentId;
    }
    if (typeof subscriptionId === "string" && SUBSCRIPTION_ID.test(subscriptionId)) {
      payload.subscriptionId = subscriptionId;
    }
    await deps.receive({
      environment: deps.environment,
      eventId: event.id,
      eventType: event.event,
      payload,
    });
    return json({ received: true }, 200);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "INVALID_BODY" || code === "INVALID_CONTENT_TYPE")
      return json({ received: false }, 400);
    if (code === "BODY_TOO_LARGE") return json({ received: false }, 413);
    console.error("[Asaas webhook] INBOX_WRITE_FAILED");
    return json({ received: false }, 503);
  }
}

function paymentAmountCents(payment: { value?: number }): number | null {
  if (typeof payment.value !== "number" || !Number.isFinite(payment.value)) return null;
  const cents = Math.round(payment.value * 100);
  return cents > 0 &&
    Number.isSafeInteger(cents) &&
    Math.abs(payment.value * 100 - cents) < 0.000001
    ? cents
    : null;
}

async function processEvent(
  event: InboxEvent,
  deps: WorkerDependencies,
): Promise<"processed" | "ignored" | "failed"> {
  if (SUBSCRIPTION_EVENTS.has(event.event_type)) {
    const subscriptionId = event.payload?.subscriptionId;
    if (!subscriptionId || !SUBSCRIPTION_ID.test(subscriptionId)) {
      await deps.finish(event, "failed", "MISSING_SUBSCRIPTION_ID");
      return "failed";
    }
    try {
      const subscription = await deps.getSubscription(subscriptionId);
      const cents = paymentAmountCents(subscription);
      if (
        subscription.id !== subscriptionId ||
        !cents ||
        !SUBSCRIPTION_ID.test(subscription.id) ||
        !/^cus_[A-Za-z0-9]+$/.test(subscription.customer) ||
        subscription.cycle !== "MONTHLY" ||
        !["ACTIVE", "INACTIVE"].includes(subscription.status ?? "") ||
        !subscription.externalReference ||
        subscription.deleted
      ) {
        await deps.finish(event, "failed", "SUBSCRIPTION_NOT_VERIFIED");
        return "failed";
      }
      await deps.applySubscription(event, subscription, cents);
      return "processed";
    } catch {
      await deps.finish(event, "failed", "SUBSCRIPTION_RECONCILIATION_FAILED");
      return "failed";
    }
  }
  if (!LIFECYCLE_PAYMENT_EVENTS.has(event.event_type)) {
    const informational = classifyAsaasPaymentEvent(event.event_type) === "informational";
    await deps.finish(
      event,
      informational ? "ignored" : "failed",
      informational ? "INFORMATIONAL_EVENT" : "LIFECYCLE_REVIEW_REQUIRED",
    );
    return informational ? "ignored" : "failed";
  }
  const paymentId = event.payload?.paymentId;
  if (!paymentId || !PAYMENT_ID.test(paymentId)) {
    await deps.finish(event, "failed", "MISSING_PAYMENT_ID");
    return "failed";
  }
  try {
    const payment = await deps.getPayment(paymentId);
    const cents = paymentAmountCents(payment);
    if (
      payment.id !== paymentId ||
      !cents ||
      !ISO_DATE.test(payment.dueDate ?? "") ||
      !(CONFIRMATION_EVENTS.has(event.event_type)
        ? ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes(payment.status ?? "")
        : event.event_type === "PAYMENT_OVERDUE"
          ? payment.status === "OVERDUE"
          : payment.status === "REFUNDED") ||
      !payment.subscription
    ) {
      await deps.finish(event, "failed", "PAYMENT_NOT_CONFIRMED_OR_INVALID");
      return "failed";
    }
    await deps.applyPayment(event, payment, cents);
    return "processed";
  } catch {
    await deps.finish(event, "failed", "PROVIDER_RECONCILIATION_FAILED");
    return "failed";
  }
}

async function reconcileExpiredGrace(
  deps: WorkerDependencies,
): Promise<{ suspended: number; recoveryQueued: number }> {
  const counts = { suspended: 0, recoveryQueued: 0 };
  for (const candidate of await deps.listExpiredGrace()) {
    const payment = await deps.getPayment(candidate.payment_id);
    if (
      payment.id !== candidate.payment_id ||
      !payment.subscription ||
      !/^cus_[A-Za-z0-9]+$/.test(payment.customer)
    ) {
      throw new Error("GRACE_PAYMENT_NOT_VERIFIED");
    }
    if (payment.status === "OVERDUE") {
      if (await deps.suspendGrace(candidate, payment)) counts.suspended += 1;
    } else if (["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes(payment.status ?? "")) {
      const eventType = payment.status === "CONFIRMED" ? "PAYMENT_CONFIRMED" : "PAYMENT_RECEIVED";
      await deps.enqueueRecovery(
        "evt_reconcile_" + payment.id + "_" + payment.status,
        eventType,
        payment.id,
      );
      counts.recoveryQueued += 1;
    } else {
      throw new Error("GRACE_PROVIDER_STATUS_REVIEW_REQUIRED");
    }
  }
  return counts;
}

/** Invoked by a trusted scheduler; never sends the worker credential to a client. */
export async function processAsaasInbox(
  request: Request,
  dependencies?: WorkerDependencies,
): Promise<Response> {
  if (request.method !== "POST") return json({ processed: 0 }, 405);
  let deps: WorkerDependencies;
  try {
    if (dependencies) {
      deps = dependencies;
    } else {
      const config = loadAsaasConfig();
      const workerToken = process.env.BILLING_WORKER_TOKEN ?? "";
      const client = new AsaasClient(config);
      const admin = async () =>
        (await import("@/integrations/supabase/client.server")).supabaseAdmin;
      deps = {
        environment: config.environment,
        workerToken,
        claim: async () => {
          const { data, error } = await (
            await admin()
          ).rpc("billing_claim_asaas_events", {
            p_environment: config.environment,
            p_limit: 10,
          });
          if (error) throw error;
          return (data ?? []) as InboxEvent[];
        },
        getPayment: (id) => client.getPayment(id),
        getSubscription: (id) => client.getSubscription(id),
        applyPayment: async (event, payment, cents) => {
          const { error } = await (
            await admin()
          ).rpc("billing_apply_asaas_payment_lifecycle", {
            p_event_id: event.id,
            p_lease_token: event.lease_token,
            p_payment_id: payment.id,
            p_customer_id: payment.customer,
            p_subscription_id: payment.subscription!,
            p_amount_cents: cents,
            p_due_date: payment.dueDate!,
            p_payment_status: payment.status!,
          });
          if (error) throw error;
        },
        applySubscription: async (event, subscription, cents) => {
          const { error } = await (
            await admin()
          ).rpc("billing_apply_asaas_subscription_lifecycle", {
            p_event_id: event.id,
            p_lease_token: event.lease_token,
            p_subscription_id: subscription.id,
            p_customer_id: subscription.customer,
            p_external_reference: subscription.externalReference!,
            p_amount_cents: cents,
            p_cycle: subscription.cycle!,
            p_provider_status: subscription.status!,
          });
          if (error) throw error;
        },
        listExpiredGrace: async () => {
          const { data, error } = await (
            await admin()
          ).rpc("billing_list_asaas_expired_grace", {
            p_environment: config.environment,
            p_limit: 10,
          });
          if (error) throw error;
          return data ?? [];
        },
        suspendGrace: async (candidate, payment) => {
          const { data, error } = await (
            await admin()
          ).rpc("billing_suspend_asaas_expired_grace", {
            p_subscription_id: candidate.subscription_id,
            p_environment: config.environment,
            p_payment_id: payment.id,
            p_customer_id: payment.customer,
            p_provider_subscription_id: payment.subscription!,
            p_provider_status: payment.status!,
          });
          if (error) throw error;
          return data ?? false;
        },
        enqueueRecovery: async (eventId, eventType, paymentId) => {
          const { error } = await (
            await admin()
          ).rpc("billing_receive_asaas_event", {
            p_environment: config.environment,
            p_event_id: eventId,
            p_event_type: eventType,
            p_payload: { paymentId },
          });
          if (error) throw error;
        },
        finish: async (event, outcome, code) => {
          const { data, error } = await (
            await admin()
          ).rpc("billing_finish_asaas_event", {
            p_id: event.id,
            p_lease_token: event.lease_token,
            p_outcome: outcome,
            p_error_code: code ?? null,
          });
          if (error || !data) throw error ?? new Error("LEASE_EXPIRED");
        },
      };
    }
  } catch {
    console.error("[Asaas worker] CONFIGURATION_FAILED");
    return json({ processed: 0 }, 503);
  }
  if (
    !equalSecret(
      request.headers.get("authorization")?.replace(/^Bearer /, "") ?? null,
      deps.workerToken,
    )
  ) {
    return json({ processed: 0 }, 401);
  }
  try {
    const events = await deps.claim();
    const counts = { processed: 0, ignored: 0, failed: 0 };
    for (const event of events) counts[await processEvent(event, deps)] += 1;
    const grace = await reconcileExpiredGrace(deps);
    return json({ ...counts, ...grace }, 200);
  } catch {
    console.error("[Asaas worker] WORKER_FAILED");
    return json({ processed: 0 }, 503);
  }
}
