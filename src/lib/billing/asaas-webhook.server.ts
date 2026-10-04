import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  AsaasClient,
  AsaasApiError,
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
  payload: { paymentId?: string; subscriptionId?: string; customerId?: string; externalReference?: string };
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
    payload: { paymentId?: string; subscriptionId?: string; customerId?: string; externalReference?: string };
  }) => Promise<void>;
};

type WorkerDependencies = {
  environment: AsaasProviderEnvironment;
  workerToken: string;
  recordHealth?: (runId: string, status: "running" | "ok" | "review" | "failed", counters: Record<string, number>) => Promise<boolean>;
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
    const paymentObject = payment && typeof payment === "object" && !Array.isArray(payment)
      ? payment as { customer?: unknown; subscription?: unknown; externalReference?: unknown }
      : undefined;
    const subscription = event.subscription;
    const subscriptionId =
      subscription && typeof subscription === "object" && !Array.isArray(subscription)
        ? (subscription as { id?: unknown }).id
        : undefined;
    const payload: { paymentId?: string; subscriptionId?: string; customerId?: string; externalReference?: string } = {};
    if (typeof paymentId === "string" && PAYMENT_ID.test(paymentId)) {
      payload.paymentId = paymentId;
    }
    if (typeof subscriptionId === "string" && SUBSCRIPTION_ID.test(subscriptionId)) {
      payload.subscriptionId = subscriptionId;
    } else if (typeof paymentObject?.subscription === "string" && SUBSCRIPTION_ID.test(paymentObject.subscription)) {
      payload.subscriptionId = paymentObject.subscription;
    }
    if (typeof paymentObject?.customer === "string" && /^cus_[A-Za-z0-9]+$/.test(paymentObject.customer)) {
      payload.customerId = paymentObject.customer;
    }
    if (typeof paymentObject?.externalReference === "string" && paymentObject.externalReference.length <= 200) {
      payload.externalReference = paymentObject.externalReference;
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

// Store fixed diagnostic codes, never provider response text, SQL detail or PII.
// A successful provider GET followed by a rejected ledger write is a different
// failure from an unavailable Asaas API and must remain distinguishable.
const BILLING_REJECTION_CODES = new Set([
  "BILLING_LIFECYCLE_PAYMENT_NOT_VERIFIED",
  "BILLING_LIFECYCLE_PROVIDER_STATUS_CHANGED",
  "BILLING_LIFECYCLE_OWNERSHIP_MISMATCH",
  "BILLING_LIFECYCLE_PLAN_MISMATCH",
  "BILLING_LIFECYCLE_PAYMENT_CONFLICT",
  "BILLING_LIFECYCLE_PERIOD_REVIEW_REQUIRED",
  "BILLING_LIFECYCLE_INITIAL_PAYMENT_REQUIRED",
  "BILLING_LIFECYCLE_OVERDUE_REVIEW_REQUIRED",
  "BILLING_LIFECYCLE_REVERSAL_REVIEW_REQUIRED",
  "BILLING_SUBSCRIPTION_NOT_VERIFIED",
  "BILLING_SUBSCRIPTION_OWNERSHIP_MISMATCH",
  "BILLING_SUBSCRIPTION_PLAN_MISMATCH",
  "BILLING_SUBSCRIPTION_STATE_REVIEW_REQUIRED",
]);

function providerFailureCode(error: unknown): string {
  if (error instanceof AsaasApiError) {
    if (Number.isInteger(error.status) && error.status! >= 400 && error.status! <= 599) {
      return `ASAAS_HTTP_${error.status}`;
    }
    if (["ASAAS_TIMEOUT", "ASAAS_NETWORK_ERROR", "ASAAS_INVALID_RESPONSE", "ASAAS_EMPTY_RESPONSE"].includes(error.code)) {
      return error.code;
    }
  }
  return "ASAAS_LOOKUP_FAILED";
}

function billingFailureCode(error: unknown): string {
  const message = error && typeof error === "object" && "message" in error ? error.message : null;
  return typeof message === "string" && BILLING_REJECTION_CODES.has(message)
    ? message : "BILLING_APPLY_FAILED";
}

function recoveryPaymentEvent(status: string | undefined): string | null {
  return status === "CONFIRMED" ? "PAYMENT_CONFIRMED"
    : ["RECEIVED", "RECEIVED_IN_CASH"].includes(status ?? "") ? "PAYMENT_RECEIVED"
    : status === "OVERDUE" ? "PAYMENT_OVERDUE"
    : status === "REFUNDED" ? "PAYMENT_REFUNDED" : null;
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
    let subscription: AsaasSubscription;
    try {
      subscription = await deps.getSubscription(subscriptionId);
    } catch (error) {
      await deps.finish(event, "failed", providerFailureCode(error));
      return "failed";
    }
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
    try {
      await deps.applySubscription(event, subscription, cents);
      return "processed";
    } catch (error) {
      await deps.finish(event, "failed", billingFailureCode(error));
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
  let payment: AsaasPayment;
  try {
    payment = await deps.getPayment(paymentId);
  } catch (error) {
    await deps.finish(event, "failed", providerFailureCode(error));
    return "failed";
  }
  // A standalone invoice is not a DentalFlow subscription payment. Hold it for
  // review even when Asaas says paid; never attach it to a company by guessing.
  if (payment.id === paymentId && !payment.subscription) {
    await deps.finish(event, "failed", "PAYMENT_SUBSCRIPTION_MISSING");
    return "failed";
  }
  const cents = paymentAmountCents(payment);
  if (
      payment.id !== paymentId ||
      !cents ||
      payment.deleted ||
      !/^cus_[A-Za-z0-9]+$/.test(payment.customer) ||
      !SUBSCRIPTION_ID.test(payment.subscription ?? "") ||
      !ISO_DATE.test(payment.dueDate ?? "")
  ) {
    await deps.finish(event, "failed", "PAYMENT_NOT_CONFIRMED_OR_INVALID");
    return "failed";
  }

  // Asaas delivers at least once and can deliver an older overdue/paid event
  // after payment or refund. Persist the CURRENT effect in the normal inbox
  // before retiring the stale event. The new event must GET the payment again
  // and pass the existing owner, contract, period and idempotency checks.
  // A refund followed by a paid status is deliberately held for manual review.
  const currentEvent = recoveryPaymentEvent(payment.status);
  const superseded = (event.event_type === "PAYMENT_OVERDUE" &&
    (CONFIRMATION_EVENTS.has(currentEvent ?? "") || currentEvent === "PAYMENT_REFUNDED")) ||
    (CONFIRMATION_EVENTS.has(event.event_type) && currentEvent === "PAYMENT_REFUNDED");
  if (superseded && currentEvent) {
    try {
      const recoveryId = `evt_reconcile_${payment.id}_${payment.status}`;
      if (!EVENT_ID.test(recoveryId)) throw new Error("RECOVERY_EVENT_ID_INVALID");
      await deps.enqueueRecovery(recoveryId, currentEvent, {
        paymentId: payment.id, source: "reconciliation",
      });
    } catch {
      await deps.finish(event, "failed", "RECOVERY_INBOX_WRITE_FAILED");
      return "failed";
    }
    await deps.finish(event, "ignored", "SUPERSEDED_PROVIDER_STATUS");
    return "ignored";
  }
  if (!(CONFIRMATION_EVENTS.has(event.event_type)
        ? ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes(payment.status ?? "")
        : event.event_type === "PAYMENT_OVERDUE"
          ? payment.status === "OVERDUE"
          : payment.status === "REFUNDED")) {
    await deps.finish(event, "failed", "PAYMENT_NOT_CONFIRMED_OR_INVALID");
    return "failed";
  }
  try {
    await deps.applyPayment(event, payment, cents);
    return "processed";
  } catch (error) {
    await deps.finish(event, "failed", billingFailureCode(error));
    return "failed";
  }
}

async function reconcileExpiredGrace(
  deps: WorkerDependencies,
): Promise<{ suspended: number; recoveryQueued: number; graceReview: number }> {
  const counts = { suspended: 0, recoveryQueued: 0, graceReview: 0 };
  for (const candidate of await deps.listExpiredGrace()) {
    try {
      const payment = await deps.getPayment(candidate.payment_id);
      if (
        payment.id !== candidate.payment_id ||
        payment.deleted || !PAYMENT_ID.test(payment.id) ||
        !SUBSCRIPTION_ID.test(payment.subscription ?? "") ||
        !/^cus_[A-Za-z0-9]+$/.test(payment.customer) ||
        !paymentAmountCents(payment) || !ISO_DATE.test(payment.dueDate ?? "")
      ) {
        throw new Error("GRACE_PAYMENT_NOT_VERIFIED");
      }
      if (payment.status === "OVERDUE") {
        if (await deps.suspendGrace(candidate, payment)) counts.suspended += 1;
      } else if (["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH", "REFUNDED"].includes(payment.status ?? "")) {
        const eventType = recoveryPaymentEvent(payment.status)!;
        const eventId = "evt_reconcile_" + payment.id + "_" + payment.status;
        if (!EVENT_ID.test(eventId)) throw new Error("RECOVERY_EVENT_ID_INVALID");
        const inserted = await deps.enqueueRecovery(
          eventId,
          eventType,
          { paymentId: payment.id, source: "reconciliation" },
        );
        if (inserted) counts.recoveryQueued += 1;
      } else {
        throw new Error("GRACE_PROVIDER_STATUS_REVIEW_REQUIRED");
      }
    } catch {
      counts.graceReview += 1;
      console.error("[Asaas worker] GRACE_CANDIDATE_REVIEW_REQUIRED");
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
        const type = recoveryPaymentEvent(payment.status);
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
        recordHealth: async (runId, status, counters) => {
          const { data, error } = await (await admin()).rpc("billing_record_worker_health", {
            p_environment: config.environment, p_run_id: runId, p_status: status, p_counters: counters,
          }).abortSignal(AbortSignal.timeout(3_000));
          if (error) throw error;
          return data === true;
        },
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
            ...(code === undefined ? {} : { p_error_code: code }),
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
  const requestedEnvironment = request.headers.get("x-billing-environment");
  if (requestedEnvironment !== null && requestedEnvironment !== deps.environment) return json({ processed: 0 }, 409);
  const runId = randomUUID();
  // Telemetry is independent of the financial processor. An unavailable monitor
  // must not prevent a verified event from being applied or expose error text.
  const record = async (status: "running" | "ok" | "review" | "failed", counters: Record<string, number>) => {
    if (!deps.recordHealth) return undefined;
    try {
      // Bound even a transport/dependency that ignores its abort signal.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([deps.recordHealth(runId, status, counters),
          new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), 3_500); })]);
      } finally { if (timer) clearTimeout(timer); }
    } catch { console.error("[Asaas worker] HEALTH_RECORD_FAILED"); return false; }
  };
  const began = await record("running", {});
  const monitoring = async (status: "ok" | "review" | "failed", counters: Record<string, number>) => {
    const finished = await record(status, counters);
    return began === undefined ? {} : { monitoringRecorded: began === true && finished === true };
  };
  const totals = { processed: 0, ignored: 0, failed: 0, workerReview: 0, suspended: 0,
    recoveryQueued: 0, graceReview: 0, reconciliationScanned: 0, reconciliationQueued: 0, reconciliationReview: 0 };
  try {
    const events = await deps.claim();
    const counts = { processed: 0, ignored: 0, failed: 0, workerReview: 0 };
    for (const event of events) {
      try {
        counts[await processEvent(event, deps)] += 1;
      } catch {
        // A lost lease or failed final inbox write remains claimable after its
        // lease expires. Continue the batch and expose the partial failure.
        counts.workerReview += 1;
        console.error("[Asaas worker] EVENT_PROCESSING_INCOMPLETE");
      }
    }
    let grace = { suspended: 0, recoveryQueued: 0, graceReview: 0 };
    try {
      grace = await reconcileExpiredGrace(deps);
    } catch {
      grace.graceReview += 1;
      console.error("[Asaas worker] GRACE_SCAN_FAILED");
    }
    let reconciliation = { reconciliationScanned: 0, reconciliationQueued: 0, reconciliationReview: 0 };
    try {
      reconciliation = await reconcileMissingWebhooks(deps);
    } catch {
      reconciliation.reconciliationReview += 1;
      console.error("[Asaas worker] RECONCILIATION_SCAN_FAILED");
    }
    Object.assign(totals, counts, grace, reconciliation);
    const incomplete = totals.reconciliationReview > 0 || totals.graceReview > 0 || totals.workerReview > 0;
    return json({ ...totals, ...await monitoring(incomplete || totals.failed > 0 ? "review" : "ok", totals) }, incomplete ? 503 : 200);
  } catch {
    console.error("[Asaas worker] WORKER_FAILED");
    return json({ processed: 0, ...await monitoring("failed", totals) }, 503);
  }
}
