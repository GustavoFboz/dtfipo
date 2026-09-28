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
  claimReconciliation: () => Promise<{
    subscription_id: string;
    provider_subscription_id: string;
    customer_id: string;
  }[]>;
  listPaymentsForReconciliation: (subscriptionId: string, sinceDueDate: string) => Promise<AsaasPayment[]>;
  enqueueRecovery: (
    eventId: string,
    eventType: string,
    payload: { paymentId?: string; subscriptionId?: string; source: "reconciliation" },
  ) => Promise<boolean>;
  finish: (event: InboxEvent, outcome: "ignored" | "failed", code?: string) => Promise<void>;
};

type ReplayDependencies = {
  environment: AsaasProviderEnvironment;
  replayToken: string;
  requeue: (input: {
    environment: AsaasProviderEnvironment;
    eventId: string;
    operatorRef: string;
    reason: string;
  }) => Promise<boolean>;
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

async function readBoundedJson(
  request: Request,
  maxBytes = MAX_BODY_BYTES,
): Promise<Record<string, unknown>> {
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
    if (size > maxBytes) {
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

/** A separate operator credential queues a dead letter for the normal worker. */
export async function replayAsaasEvent(
  request: Request,
  dependencies?: ReplayDependencies,
): Promise<Response> {
  if (request.method !== "POST") return json({ queued: false }, 405);
  let deps: ReplayDependencies;
  try {
    if (dependencies) {
      deps = dependencies;
    } else {
      const config = loadAsaasConfig();
      const replayToken = process.env.BILLING_REPLAY_TOKEN ?? "";
      if (replayToken === process.env.BILLING_WORKER_TOKEN || replayToken === config.webhookToken)
        throw new Error("REPLAY_TOKEN_REUSED");
      deps = {
        environment: config.environment,
        replayToken,
        requeue: async ({ environment, eventId, operatorRef, reason }) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.rpc("billing_replay_asaas_event", {
            p_environment: environment,
            p_event_id: eventId,
            p_operator_ref: operatorRef,
            p_reason: reason,
          });
          if (error) throw error;
          return data === true;
        },
      };
    }
  } catch {
    console.error("[Asaas replay] CONFIGURATION_FAILED");
    return json({ queued: false }, 503);
  }
  if (
    !equalSecret(
      request.headers.get("authorization")?.replace(/^Bearer /, "") ?? null,
      deps.replayToken,
    )
  ) {
    return json({ queued: false }, 401);
  }
  let body: Record<string, unknown>;
  try {
    body = await readBoundedJson(request, 2_048);
  } catch (error) {
    return json(
      { queued: false },
      error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400,
    );
  }
  const { eventId, operatorRef, reason } = body;
  if (
    typeof eventId !== "string" ||
    !EVENT_ID.test(eventId) ||
    typeof operatorRef !== "string" ||
    !/^[A-Za-z0-9_.-]{3,64}$/.test(operatorRef) ||
    typeof reason !== "string" ||
    reason.trim().length < 16 ||
    reason.trim().length > 300 ||
    /[\x00-\x1f\x7f]/.test(reason)
  )
    return json({ queued: false }, 400);
  try {
    const queued = await deps.requeue({
      environment: deps.environment,
      eventId,
      operatorRef,
      reason: reason.trim(),
    });
    return json({ queued }, queued ? 202 : 409);
  } catch {
    console.error("[Asaas replay] REQUEUE_FAILED");
    return json({ queued: false }, 503);
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
      const inserted = await deps.enqueueRecovery(
        "evt_reconcile_" + payment.id + "_" + payment.status,
        eventType,
        { paymentId: payment.id, source: "reconciliation" },
      );
      if (inserted) counts.recoveryQueued += 1;
    } else {
      throw new Error("GRACE_PROVIDER_STATUS_REVIEW_REQUIRED");
    }
  }
  return counts;
}

/** Rebuilds missing inbox events, without modifying an entitlement directly. */
async function reconcileMissingWebhooks(
  deps: WorkerDependencies,
): Promise<{ reconciliationScanned: number; reconciliationQueued: number; reconciliationReview: number }> {
  const counts = { reconciliationScanned: 0, reconciliationQueued: 0, reconciliationReview: 0 };
  const sinceDueDate = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  for (const candidate of await deps.claimReconciliation()) {
    counts.reconciliationScanned += 1;
    try {
      const subscription = await deps.getSubscription(candidate.provider_subscription_id);
      if (
        subscription.id !== candidate.provider_subscription_id ||
        subscription.customer !== candidate.customer_id ||
        subscription.cycle !== "MONTHLY" ||
        subscription.externalReference !== `dentalflow:subscription:${candidate.subscription_id}` ||
        subscription.deleted ||
        !["ACTIVE", "INACTIVE"].includes(subscription.status ?? "")
      ) throw new Error("RECONCILIATION_SUBSCRIPTION_REVIEW_REQUIRED");

      const inactiveEventId = `evt_reconcile_${subscription.id}_INACTIVE`;
      if (subscription.status === "INACTIVE" && !EVENT_ID.test(inactiveEventId)) {
        throw new Error("RECONCILIATION_EVENT_ID_INVALID");
      }

      const payments = await deps.listPaymentsForReconciliation(subscription.id, sinceDueDate);
      const pending: { eventId: string; type: string; paymentId: string; dueDate: string }[] = [];
      for (const payment of payments) {
        if (
          !PAYMENT_ID.test(payment.id) || payment.customer !== candidate.customer_id ||
          payment.subscription !== subscription.id || !paymentAmountCents(payment) ||
          !ISO_DATE.test(payment.dueDate ?? "")
        ) throw new Error("RECONCILIATION_PAYMENT_REVIEW_REQUIRED");
        const type = payment.status === "CONFIRMED" ? "PAYMENT_CONFIRMED" :
          ["RECEIVED", "RECEIVED_IN_CASH"].includes(payment.status ?? "") ? "PAYMENT_RECEIVED" :
          payment.status === "OVERDUE" ? "PAYMENT_OVERDUE" :
          payment.status === "REFUNDED" ? "PAYMENT_REFUNDED" : null;
        if (!type && payment.status !== "PENDING") {
          throw new Error("RECONCILIATION_STATUS_REVIEW_REQUIRED");
        }
        if (type) pending.push({
          eventId: `evt_reconcile_${payment.id}_${payment.status}`,
          type,
          paymentId: payment.id,
          dueDate: payment.dueDate!,
        });
      }
      // Validate the whole page before enqueuing any resource. The existing
      // leased processor will GET each one again and check plan/owner/period.
      for (const event of pending) {
        if (!EVENT_ID.test(event.eventId)) throw new Error("RECONCILIATION_EVENT_ID_INVALID");
      }
      pending.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.paymentId.localeCompare(b.paymentId));
      for (const event of pending) {
        const inserted = await deps.enqueueRecovery(event.eventId, event.type, {
          paymentId: event.paymentId,
          source: "reconciliation",
        });
        if (inserted) counts.reconciliationQueued += 1;
      }
      if (subscription.status === "INACTIVE") {
        const inserted = await deps.enqueueRecovery(inactiveEventId, "SUBSCRIPTION_INACTIVATED", {
          subscriptionId: subscription.id,
          source: "reconciliation",
        });
        if (inserted) counts.reconciliationQueued += 1;
      }
    } catch {
      counts.reconciliationReview += 1;
      console.error("[Asaas worker] RECONCILIATION_CANDIDATE_FAILED");
    }
  }
  return counts;
}

/** Invoked by a trusted scheduler; never sends the worker credential to a client. */
async function probeSandboxConnection(): Promise<
  | { state: "http"; status: number }
  | { state: "network" | "timeout"; errorName: string; causeCode: string }
  | { state: "disabled" }
> {
  const config = loadAsaasConfig();
  if (config.environment !== "sandbox") return { state: "disabled" };

  const url = new URL(`${config.baseUrl}/customers`);
  url.searchParams.set("limit", "1");
  url.searchParams.set("externalReference", "dentalflow_connectivity_probe");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 8_000));
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": config.userAgent,
        access_token: config.apiKey,
      },
      signal: controller.signal,
    });
    return { state: "http", status: response.status };
  } catch (error) {
    const name = error instanceof Error ? error.name : "Unknown";
    const cause = error && typeof error === "object" && "cause" in error ? error.cause : null;
    const code = cause && typeof cause === "object" && "code" in cause ? cause.code : null;
    return {
      state: controller.signal.aborted ? "timeout" : "network",
      errorName: /^[A-Za-z]{1,32}$/.test(name) ? name : "Unknown",
      causeCode: typeof code === "string" && /^[A-Z0-9_]{2,64}$/.test(code) ? code : "UNKNOWN",
    };
  } finally {
    clearTimeout(timeout);
  }
}

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
        claimReconciliation: async () => {
          const { data, error } = await (
            await admin()
          ).rpc("billing_claim_asaas_reconciliation_candidates", {
            p_environment: config.environment,
            p_limit: 1,
          });
          if (error) throw error;
          return data ?? [];
        },
        listPaymentsForReconciliation: (subscriptionId, sinceDueDate) =>
          client.listPaymentsForReconciliation(subscriptionId, sinceDueDate),
        enqueueRecovery: async (eventId, eventType, payload) => {
          const { data, error } = await (
            await admin()
          ).rpc("billing_receive_asaas_event", {
            p_environment: config.environment,
            p_event_id: eventId,
            p_event_type: eventType,
            p_payload: payload,
          });
          if (error) throw error;
          return data === true;
        },
        finish: async (event, outcome, code) => {
          const { data, error } = await (
            await admin()
          ).rpc("billing_finish_asaas_event", {
            p_id: event.id,
            p_lease_token: event.lease_token,
            p_outcome: outcome,
            p_error_code: code,
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
    const reconciliation = await reconcileMissingWebhooks(deps);
    // Temporary read-only Sandbox probe. Runs only after the worker secret is checked.
    const sandboxConnection = dependencies ? { state: "disabled" as const } : await probeSandboxConnection();
    return json({ ...counts, ...grace, ...reconciliation, sandboxConnection },
      reconciliation.reconciliationReview > 0 ? 503 : 200);
  } catch {
    console.error("[Asaas worker] WORKER_FAILED");
    return json({ processed: 0 }, 503);
  }
}
