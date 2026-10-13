import { describe, expect, it, vi } from "vitest";
import { AsaasApiError } from "./asaas.server";
import { processAsaasInbox, receiveAsaasWebhook, replayAsaasEvent } from "./asaas-webhook.server";

const webhookToken = "webhook-test-token-0123456789-0123456789";
const workerToken = "worker-test-token-0123456789-0123456789";
const replayToken = "replay-test-token-0123456789-0123456789";
const eventId = "evt_05b708f961d739ea7eba7e4db318f621&368604920";
const paymentId = "pay_080225913252";

function webhook(body: unknown, token = webhookToken) {
  return new Request("https://dtfipo.lovable.app/api/billing/asaas-webhook", {
    method: "POST",
    headers: { "asaas-access-token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function worker(token = workerToken) {
  return new Request("https://dtfipo.lovable.app/api/billing/asaas-worker", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

function replay(body: unknown, token = replayToken) {
  return new Request("https://dtfipo.lovable.app/api/billing/asaas-replay", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const received = {
  id: eventId,
  event_type: "PAYMENT_CONFIRMED",
  payload: { paymentId },
  lease_token: "516fa448-e46a-4628-83a8-b71576ac4b10",
  attempt_count: 1,
};
const confirmed = {
  id: paymentId,
  customer: "cus_ABC123",
  subscription: "sub_ABC123",
  value: 99.9,
  dueDate: "2026-09-26",
  status: "CONFIRMED",
};

describe("Asaas webhook inbox", () => {
  it("rejects unauthenticated deliveries before reading or writing data", async () => {
    const receive = vi.fn();
    const result = await receiveAsaasWebhook(webhook({ id: eventId }, "wrong"), {
      environment: "sandbox",
      webhookToken,
      receive,
    });
    expect(result.status).toBe(401);
    expect(receive).not.toHaveBeenCalled();
  });

  it("persists only safe linkage metadata and acknowledges after the write", async () => {
    const receive = vi.fn().mockResolvedValue(undefined);
    const result = await receiveAsaasWebhook(
      webhook({
        id: eventId,
        event: "PAYMENT_CONFIRMED",
        payment: {
          id: paymentId,
          customer: "cus_ABC123",
          subscription: "sub_ABC123",
          externalReference: "dentalflow:payment:test",
          cpfCnpj: "sensitive",
        },
      }),
      { environment: "sandbox", webhookToken, receive },
    );
    expect(result.status).toBe(200);
    expect(receive).toHaveBeenCalledWith({
      environment: "sandbox",
      eventId,
      eventType: "PAYMENT_CONFIRMED",
      payload: {
        paymentId,
        subscriptionId: "sub_ABC123",
        customerId: "cus_ABC123",
        externalReference: "dentalflow:payment:test",
      },
    });
  });

  it("persists only the subscription ID for an authenticated lifecycle event", async () => {
    const receive = vi.fn().mockResolvedValue(undefined);
    const result = await receiveAsaasWebhook(
      webhook({
        id: eventId,
        event: "SUBSCRIPTION_INACTIVATED",
        subscription: { id: "sub_ABC123", customer: "private", cpfCnpj: "sensitive" },
      }),
      { environment: "sandbox", webhookToken, receive },
    );
    expect(result.status).toBe(200);
    expect(receive).toHaveBeenCalledWith({
      environment: "sandbox",
      eventId,
      eventType: "SUBSCRIPTION_INACTIVATED",
      payload: { subscriptionId: "sub_ABC123" },
    });
  });

  it("returns a retryable error when the inbox is unavailable", async () => {
    const result = await receiveAsaasWebhook(
      webhook({
        id: eventId,
        event: "PAYMENT_CONFIRMED",
        payment: { id: paymentId },
      }),
      {
        environment: "sandbox",
        webhookToken,
        receive: vi.fn().mockRejectedValue(new Error("DB failed")),
      },
    );
    expect(result.status).toBe(503);
  });

  it("rejects oversized payloads even with an incorrect content-length", async () => {
    const receive = vi.fn();
    const result = await receiveAsaasWebhook(
      webhook({
        id: eventId,
        event: "PAYMENT_CONFIRMED",
        ignored: "x".repeat(35_000),
      }),
      { environment: "sandbox", webhookToken, receive },
    );
    expect(result.status).toBe(413);
    expect(receive).not.toHaveBeenCalled();
  });
});

describe("Asaas inbox worker", () => {
  const deps = () => ({
    environment: "sandbox" as const,
    workerToken,
    claim: vi.fn().mockResolvedValue([received]),
    getPayment: vi.fn().mockResolvedValue(confirmed),
    getSubscription: vi.fn(),
    applyPayment: vi.fn().mockResolvedValue(undefined),
    applySubscription: vi.fn().mockResolvedValue(undefined),
    listExpiredGrace: vi.fn().mockResolvedValue([]),
    suspendGrace: vi.fn().mockResolvedValue(true),
    claimReconciliation: vi.fn().mockResolvedValue([]),
    listPaymentsForReconciliation: vi.fn().mockResolvedValue([]),
    enqueueRecovery: vi.fn().mockResolvedValue(true),
    finish: vi.fn().mockResolvedValue(undefined),
  });

  it("records an authenticated run and only safe counters after processing", async () => {
    const recordHealth = vi.fn().mockResolvedValue(true);
    const dependencies = { ...deps(), recordHealth };
    expect((await processAsaasInbox(worker("wrong"), dependencies)).status).toBe(401);
    expect(recordHealth).not.toHaveBeenCalled();
    const result = await processAsaasInbox(worker(), dependencies);
    expect(await result.json()).toMatchObject({ monitoringRecorded: true, processed: 1 });
    const runId = recordHealth.mock.calls[0][0];
    expect(recordHealth).toHaveBeenNthCalledWith(1, runId, "running", {});
    expect(recordHealth).toHaveBeenNthCalledWith(2, runId, "ok", expect.objectContaining({ processed: 1, failed: 0 }));
    expect(JSON.stringify(recordHealth.mock.calls)).not.toContain(paymentId);
    expect(recordHealth.mock.invocationCallOrder[0]).toBeLessThan(dependencies.claim.mock.invocationCallOrder[0]);
    expect(recordHealth.mock.invocationCallOrder[1]).toBeGreaterThan(dependencies.applyPayment.mock.invocationCallOrder[0]);
  });
  it("records reviewed events and fatal claim failures without private error text", async () => {
    const recordHealth = vi.fn().mockResolvedValue(true);
    const dependencies = { ...deps(), recordHealth };
    dependencies.getPayment.mockRejectedValue(new Error("private-provider-detail"));
    await processAsaasInbox(worker(), dependencies);
    expect(recordHealth).toHaveBeenLastCalledWith(expect.any(String), "review", expect.objectContaining({ failed: 1 }));
    dependencies.claim.mockRejectedValue(new Error("private-database-detail"));
    expect((await processAsaasInbox(worker(), dependencies)).status).toBe(503);
    expect(recordHealth).toHaveBeenLastCalledWith(expect.any(String), "failed", expect.objectContaining({ processed: 0 }));
    expect(JSON.stringify(recordHealth.mock.calls)).not.toContain("private-");
  });
  it("processes verified payments even when the telemetry store fails", async () => {
    const dependencies = { ...deps(), recordHealth: vi.fn().mockRejectedValue(new Error("private-detail")) };
    const result = await processAsaasInbox(worker(), dependencies);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ monitoringRecorded: false, processed: 1 });
    expect(dependencies.applyPayment).toHaveBeenCalledOnce();
  });
  it("bounds a hung telemetry transport without blocking the financial processor", async () => {
    vi.useFakeTimers();
    try {
      const dependencies = { ...deps(), recordHealth: vi.fn().mockImplementation(() => new Promise(() => {})) };
      const pending = processAsaasInbox(worker(), dependencies);
      await vi.advanceTimersByTimeAsync(7_001);
      const result = await pending;
      expect(result.status).toBe(200);
      expect(await result.json()).toMatchObject({ monitoringRecorded: false, processed: 1 });
      expect(dependencies.applyPayment).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
  it("refuses a scheduler pointed at the other environment before recording or claiming", async () => {
    const dependencies = { ...deps(), recordHealth: vi.fn() };
    const request = worker(); request.headers.set("X-Billing-Environment", "production");
    expect((await processAsaasInbox(request, dependencies)).status).toBe(409);
    expect(dependencies.claim).not.toHaveBeenCalled(); expect(dependencies.recordHealth).not.toHaveBeenCalled();
  });

  it("requires an independent worker token before claiming an event", async () => {
    const dependencies = deps();
    const result = await processAsaasInbox(worker("wrong"), dependencies);
    expect(result.status).toBe(401);
    expect(dependencies.claim).not.toHaveBeenCalled();
  });

  it("fetches the authoritative payment before applying the first checkout", async () => {
    const dependencies = deps();
    const result = await processAsaasInbox(worker(), dependencies);
    expect(result.status).toBe(200);
    expect(dependencies.getPayment).toHaveBeenCalledWith(paymentId);
    expect(dependencies.applyPayment).toHaveBeenCalledWith(received, confirmed, 9_990);
    expect(dependencies.finish).not.toHaveBeenCalled();
  });

  it("does not activate for a payment that is still pending in Asaas", async () => {
    const dependencies = deps();
    dependencies.getPayment.mockResolvedValue({ ...confirmed, status: "PENDING" });
    await processAsaasInbox(worker(), dependencies);
    expect(dependencies.applyPayment).not.toHaveBeenCalled();
    expect(dependencies.finish).toHaveBeenCalledWith(
      received,
      "failed",
      "PAYMENT_NOT_CONFIRMED_OR_INVALID",
    );
  });

  it("keeps a paid standalone invoice for review without granting any entitlement", async () => {
    const dependencies = deps();
    dependencies.getPayment.mockResolvedValue({ ...confirmed, value: 5, subscription: null });
    const response = await processAsaasInbox(worker(), dependencies);
    expect(await response.json()).toMatchObject({ failed: 1, processed: 0, ignored: 0 });
    expect(dependencies.applyPayment).not.toHaveBeenCalled();
    expect(dependencies.finish).toHaveBeenCalledWith(received, "failed", "PAYMENT_SUBSCRIPTION_MISSING");
  });

  it("separates a rejected contract amount from an Asaas lookup failure", async () => {
    const dependencies = deps();
    dependencies.applyPayment.mockRejectedValue({ message: "BILLING_LIFECYCLE_PLAN_MISMATCH", details: "private" });
    await processAsaasInbox(worker(), dependencies);
    expect(dependencies.getPayment).toHaveBeenCalledWith(paymentId);
    expect(dependencies.finish).toHaveBeenCalledWith(received, "failed", "BILLING_LIFECYCLE_PLAN_MISMATCH");
  });

  it("reports only the provider HTTP status and never its response text", async () => {
    const dependencies = deps();
    dependencies.getPayment.mockRejectedValue(new AsaasApiError({
      code: "untrusted_provider_code", status: 404, message: "private customer and credential details",
    }));
    await processAsaasInbox(worker(), dependencies);
    expect(dependencies.applyPayment).not.toHaveBeenCalled();
    expect(dependencies.finish).toHaveBeenCalledWith(received, "failed", "ASAAS_HTTP_404");
  });

  it("redacts unexpected database errors instead of storing their text", async () => {
    const dependencies = deps();
    dependencies.applyPayment.mockRejectedValue({ message: "BILLING_LIFECYCLE_PLAN_MISMATCH private details" });
    await processAsaasInbox(worker(), dependencies);
    expect(dependencies.finish).toHaveBeenCalledWith(received, "failed", "BILLING_APPLY_FAILED");
  });

  it("rejects deleted payments and invalid subscription IDs before the ledger write", async () => {
    for (const extra of [{ deleted: true }, { subscription: "other_company" }]) {
      const dependencies = deps();
      dependencies.getPayment.mockResolvedValue({ ...confirmed, ...extra });
      await processAsaasInbox(worker(), dependencies);
      expect(dependencies.applyPayment).not.toHaveBeenCalled();
      expect(dependencies.finish).toHaveBeenCalledWith(received, "failed", "PAYMENT_NOT_CONFIRMED_OR_INVALID");
    }
  });

  it("reconciles a full refund against the authoritative Asaas payment", async () => {
    const dependencies = deps();
    dependencies.claim.mockResolvedValue([{ ...received, event_type: "PAYMENT_REFUNDED" }]);
    dependencies.getPayment.mockResolvedValue({ ...confirmed, status: "REFUNDED" });
    await processAsaasInbox(worker(), dependencies);
    expect(dependencies.getPayment).toHaveBeenCalledWith(paymentId);
    expect(dependencies.applyPayment).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "PAYMENT_REFUNDED" }),
      expect.objectContaining({ status: "REFUNDED" }),
      9_990,
    );
  });

  it("holds a stale refund when the live payment is still confirmed", async () => {
    const dependencies = deps();
    dependencies.claim.mockResolvedValue([{ ...received, event_type: "PAYMENT_REFUNDED" }]);
    await processAsaasInbox(worker(), dependencies);
    expect(dependencies.applyPayment).not.toHaveBeenCalled();
    expect(dependencies.finish).toHaveBeenCalledWith(
      expect.anything(),
      "failed",
      "PAYMENT_NOT_CONFIRMED_OR_INVALID",
    );
  });

  it("recovers the current payment before retiring an older overdue delivery", async () => {
    const dependencies = deps();
    const overdueEvent = { ...received, event_type: "PAYMENT_OVERDUE" };
    dependencies.claim.mockResolvedValue([overdueEvent]);
    dependencies.getPayment.mockResolvedValue({ ...confirmed, status: "RECEIVED" });
    const response = await processAsaasInbox(worker(), dependencies);
    expect(dependencies.enqueueRecovery).toHaveBeenCalledWith(
      `evt_reconcile_${paymentId}_RECEIVED`, "PAYMENT_RECEIVED",
      { paymentId, source: "reconciliation" },
    );
    expect(dependencies.applyPayment).not.toHaveBeenCalled();
    expect(dependencies.finish).toHaveBeenCalledWith(overdueEvent, "ignored", "SUPERSEDED_PROVIDER_STATUS");
    expect(dependencies.enqueueRecovery.mock.invocationCallOrder[0])
      .toBeLessThan(dependencies.finish.mock.invocationCallOrder[0]);
    expect(await response.json()).toMatchObject({ ignored: 1, failed: 0 });
  });

  it("never restores access from a paid delivery after the provider refunded the invoice", async () => {
    const dependencies = deps();
    dependencies.getPayment.mockResolvedValue({ ...confirmed, status: "REFUNDED" });
    await processAsaasInbox(worker(), dependencies);
    expect(dependencies.enqueueRecovery).toHaveBeenCalledWith(
      `evt_reconcile_${paymentId}_REFUNDED`, "PAYMENT_REFUNDED",
      { paymentId, source: "reconciliation" },
    );
    expect(dependencies.applyPayment).not.toHaveBeenCalled();
    expect(dependencies.finish).toHaveBeenCalledWith(received, "ignored", "SUPERSEDED_PROVIDER_STATUS");
  });

  it("keeps a stale event retryable if the recovery event could not be persisted", async () => {
    const dependencies = deps();
    const overdueEvent = { ...received, event_type: "PAYMENT_OVERDUE" };
    dependencies.claim.mockResolvedValue([overdueEvent]);
    dependencies.enqueueRecovery.mockRejectedValue(new Error("private database details"));
    await processAsaasInbox(worker(), dependencies);
    expect(dependencies.applyPayment).not.toHaveBeenCalled();
    expect(dependencies.finish).toHaveBeenCalledWith(overdueEvent, "failed", "RECOVERY_INBOX_WRITE_FAILED");
    expect(dependencies.finish).not.toHaveBeenCalledWith(overdueEvent, "ignored", expect.anything());
  });

  it("reuses the idempotent recovery identity when the current payment is already queued", async () => {
    const dependencies = deps();
    dependencies.claim.mockResolvedValue([{ ...received, event_type: "PAYMENT_OVERDUE" }]);
    dependencies.enqueueRecovery.mockResolvedValue(false);
    const response = await processAsaasInbox(worker(), dependencies);
    expect(dependencies.applyPayment).not.toHaveBeenCalled();
    expect(dependencies.enqueueRecovery).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({ ignored: 1 });
  });

  it("holds unknown risk statuses and standalone invoices instead of synthesizing paid events", async () => {
    for (const extra of [{ status: "CHARGEBACK_REQUESTED" }, { subscription: null }, { deleted: true }]) {
      const dependencies = deps();
      dependencies.claim.mockResolvedValue([{ ...received, event_type: "PAYMENT_OVERDUE" }]);
      dependencies.getPayment.mockResolvedValue({ ...confirmed, ...extra });
      await processAsaasInbox(worker(), dependencies);
      expect(dependencies.applyPayment).not.toHaveBeenCalled();
      expect(dependencies.enqueueRecovery).not.toHaveBeenCalled();
      expect(dependencies.finish).toHaveBeenCalledWith(expect.anything(), "failed", expect.any(String));
    }
  });

  it("continues another claimed payment when the first event loses its processing lease", async () => {
    const dependencies = deps();
    const other = { ...received, id: "second-event", payload: { paymentId: "pay_Second123" } };
    dependencies.claim.mockResolvedValue([received, other]);
    dependencies.getPayment.mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ ...confirmed, id: "pay_Second123" });
    dependencies.finish.mockRejectedValueOnce(new Error("LEASE_EXPIRED"));
    const response = await processAsaasInbox(worker(), dependencies);
    expect(response.status).toBe(503);
    expect(dependencies.applyPayment).toHaveBeenCalledWith(other, expect.objectContaining({ id: "pay_Second123" }), 9_990);
    expect(await response.json()).toMatchObject({ processed: 1, workerReview: 1 });
  });

  it("reconciles an overdue payment without granting a paid entitlement", async () => {
    const dependencies = deps();
    dependencies.claim.mockResolvedValue([{ ...received, event_type: "PAYMENT_OVERDUE" }]);
    dependencies.getPayment.mockResolvedValue({ ...confirmed, status: "OVERDUE" });
    await processAsaasInbox(worker(), dependencies);
    expect(dependencies.applyPayment).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "PAYMENT_OVERDUE" }),
      expect.objectContaining({ status: "OVERDUE" }),
      9_990,
    );
  });

  it("reconciles an inactivated subscription only after fetching it", async () => {
    const dependencies = deps();
    dependencies.claim.mockResolvedValue([
      {
        ...received,
        event_type: "SUBSCRIPTION_INACTIVATED",
        payload: { subscriptionId: "sub_ABC123" },
      },
    ]);
    const inactive = {
      id: "sub_ABC123",
      customer: "cus_ABC123",
      value: 99.9,
      cycle: "MONTHLY",
      status: "INACTIVE",
      externalReference: "dentalflow:subscription:123e4567-e89b-42d3-a456-426614174000",
    };
    dependencies.getSubscription.mockResolvedValue(inactive);
    await processAsaasInbox(worker(), dependencies);
    expect(dependencies.applySubscription).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "SUBSCRIPTION_INACTIVATED" }),
      inactive,
      9_990,
    );
    expect(dependencies.getPayment).not.toHaveBeenCalled();
  });

  it("checks an expired grace invoice before suspension", async () => {
    const dependencies = deps();
    dependencies.claim.mockResolvedValue([]);
    const candidate = {
      subscription_id: "123e4567-e89b-42d3-a456-426614174000",
      payment_id: paymentId,
    };
    dependencies.listExpiredGrace.mockResolvedValue([candidate]);
    const overdue = { ...confirmed, status: "OVERDUE" };
    dependencies.getPayment.mockResolvedValue(overdue);
    const result = await processAsaasInbox(worker(), dependencies);
    expect(result.status).toBe(200);
    expect(dependencies.suspendGrace).toHaveBeenCalledWith(candidate, overdue);
    expect(await result.json()).toMatchObject({ suspended: 1, recoveryQueued: 0 });
  });

  it("enqueues recovery if Asaas shows an invoice paid before the grace sweep", async () => {
    const dependencies = deps();
    dependencies.claim.mockResolvedValue([]);
    dependencies.listExpiredGrace.mockResolvedValue([
      { subscription_id: "123e4567-e89b-42d3-a456-426614174000", payment_id: paymentId },
    ]);
    const result = await processAsaasInbox(worker(), dependencies);
    expect(dependencies.suspendGrace).not.toHaveBeenCalled();
    expect(dependencies.enqueueRecovery).toHaveBeenCalledWith(
      "evt_reconcile_pay_080225913252_CONFIRMED",
      "PAYMENT_CONFIRMED",
      { paymentId, source: "reconciliation" },
    );
    expect(await result.json()).toMatchObject({ recoveryQueued: 1 });
  });

  it("isolates a failed grace lookup while preserving successful work and the next candidate", async () => {
    const dependencies = deps();
    dependencies.listExpiredGrace.mockResolvedValue([
      { subscription_id: "first-company", payment_id: "pay_Unavailable123" },
      { subscription_id: "second-company", payment_id: "pay_Overdue123" },
    ]);
    dependencies.getPayment.mockResolvedValueOnce(confirmed)
      .mockRejectedValueOnce(new Error("sensitive provider failure"))
      .mockResolvedValueOnce({ ...confirmed, id: "pay_Overdue123", status: "OVERDUE" });
    const response = await processAsaasInbox(worker(), dependencies);
    expect(response.status).toBe(503);
    expect(dependencies.suspendGrace).toHaveBeenCalledTimes(1);
    expect(dependencies.suspendGrace).toHaveBeenCalledWith(
      { subscription_id: "second-company", payment_id: "pay_Overdue123" },
      expect.objectContaining({ id: "pay_Overdue123", status: "OVERDUE" }),
    );
    expect(await response.json()).toMatchObject({ processed: 1, graceReview: 1, suspended: 1 });
  });

  it("queues a verified refund during grace instead of suspending as overdue", async () => {
    const dependencies = deps();
    dependencies.claim.mockResolvedValue([]);
    dependencies.listExpiredGrace.mockResolvedValue([{ subscription_id: "test-company", payment_id: paymentId }]);
    dependencies.getPayment.mockResolvedValue({ ...confirmed, status: "REFUNDED" });
    const response = await processAsaasInbox(worker(), dependencies);
    expect(dependencies.suspendGrace).not.toHaveBeenCalled();
    expect(dependencies.enqueueRecovery).toHaveBeenCalledWith(
      `evt_reconcile_${paymentId}_REFUNDED`, "PAYMENT_REFUNDED", { paymentId, source: "reconciliation" },
    );
    expect(await response.json()).toMatchObject({ recoveryQueued: 1, graceReview: 0 });
  });

  it("preserves the processed payment if the grace candidate query fails", async () => {
    const dependencies = deps();
    dependencies.listExpiredGrace.mockRejectedValue(new Error("database unavailable"));
    const response = await processAsaasInbox(worker(), dependencies);
    expect(response.status).toBe(503);
    expect(dependencies.applyPayment).toHaveBeenCalledTimes(1);
    expect(dependencies.claimReconciliation).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({ processed: 1, graceReview: 1 });
  });

  it("preserves paid and suspended results if the missing-webhook candidate query fails", async () => {
    const dependencies = deps();
    dependencies.listExpiredGrace.mockResolvedValue([{ subscription_id: "test-company", payment_id: "pay_Overdue123" }]);
    dependencies.getPayment.mockResolvedValueOnce(confirmed)
      .mockResolvedValueOnce({ ...confirmed, id: "pay_Overdue123", status: "OVERDUE" });
    dependencies.claimReconciliation.mockRejectedValue(new Error("database unavailable"));
    const response = await processAsaasInbox(worker(), dependencies);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ processed: 1, suspended: 1, reconciliationReview: 1 });
  });

  it("recovers a lost payment webhook through the existing inbox, without activating access", async () => {
    const dependencies = deps();
    dependencies.claim.mockResolvedValue([]);
    dependencies.claimReconciliation.mockResolvedValue([{
      subscription_id: "123e4567-e89b-42d3-a456-426614174000",
      provider_subscription_id: "sub_ABC123",
      customer_id: "cus_ABC123",
    }]);
    dependencies.getSubscription.mockResolvedValue({
      id: "sub_ABC123", customer: "cus_ABC123", cycle: "MONTHLY", status: "ACTIVE",
      externalReference: "dentalflow:subscription:123e4567-e89b-42d3-a456-426614174000",
    });
    dependencies.listPaymentsForReconciliation.mockResolvedValue([
      { ...confirmed, status: "PENDING" },
      { ...confirmed, id: "pay_Second123", status: "RECEIVED" },
    ]);
    const response = await processAsaasInbox(worker(), dependencies);
    expect(response.status).toBe(200);
    expect(dependencies.enqueueRecovery).toHaveBeenCalledTimes(1);
    expect(dependencies.enqueueRecovery).toHaveBeenCalledWith(
      "evt_reconcile_pay_Second123_RECEIVED", "PAYMENT_RECEIVED",
      { paymentId: "pay_Second123", source: "reconciliation" },
    );
    expect(dependencies.applyPayment).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ reconciliationScanned: 1, reconciliationQueued: 1 });
  });

  it("holds every candidate payment for review if ownership or status is inconsistent", async () => {
    const dependencies = deps();
    dependencies.claim.mockResolvedValue([]);
    dependencies.claimReconciliation.mockResolvedValue([{
      subscription_id: "123e4567-e89b-42d3-a456-426614174000",
      provider_subscription_id: "sub_ABC123", customer_id: "cus_ABC123",
    }]);
    dependencies.getSubscription.mockResolvedValue({
      id: "sub_ABC123", customer: "cus_ABC123", cycle: "MONTHLY", status: "ACTIVE",
      externalReference: "dentalflow:subscription:123e4567-e89b-42d3-a456-426614174000",
    });
    dependencies.listPaymentsForReconciliation.mockResolvedValue([
      confirmed, { ...confirmed, id: "pay_Other123", customer: "cus_Other" },
    ]);
    const response = await processAsaasInbox(worker(), dependencies);
    expect(response.status).toBe(503);
    expect(dependencies.enqueueRecovery).not.toHaveBeenCalled();
    expect(dependencies.applyPayment).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ reconciliationReview: 1, reconciliationQueued: 0 });
  });

  it("recovers a lost subscription inactivation without granting access", async () => {
    const dependencies = deps();
    dependencies.claim.mockResolvedValue([]);
    dependencies.claimReconciliation.mockResolvedValue([{
      subscription_id: "123e4567-e89b-42d3-a456-426614174000",
      provider_subscription_id: "sub_ABC123", customer_id: "cus_ABC123",
    }]);
    dependencies.getSubscription.mockResolvedValue({
      id: "sub_ABC123", customer: "cus_ABC123", cycle: "MONTHLY", status: "INACTIVE",
      externalReference: "dentalflow:subscription:123e4567-e89b-42d3-a456-426614174000",
    });
    const response = await processAsaasInbox(worker(), dependencies);
    expect(response.status).toBe(200);
    expect(dependencies.enqueueRecovery).toHaveBeenCalledWith(
      "evt_reconcile_sub_ABC123_INACTIVE", "SUBSCRIPTION_INACTIVATED",
      { subscriptionId: "sub_ABC123", source: "reconciliation" },
    );
    expect(dependencies.applySubscription).not.toHaveBeenCalled();
  });

  it("does not count a synthetic event already present in the inbox twice", async () => {
    const dependencies = deps();
    dependencies.claim.mockResolvedValue([]);
    dependencies.enqueueRecovery.mockResolvedValue(false);
    dependencies.claimReconciliation.mockResolvedValue([{
      subscription_id: "123e4567-e89b-42d3-a456-426614174000",
      provider_subscription_id: "sub_ABC123", customer_id: "cus_ABC123",
    }]);
    dependencies.getSubscription.mockResolvedValue({
      id: "sub_ABC123", customer: "cus_ABC123", cycle: "MONTHLY", status: "INACTIVE",
      externalReference: "dentalflow:subscription:123e4567-e89b-42d3-a456-426614174000",
    });
    const response = await processAsaasInbox(worker(), dependencies);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reconciliationQueued: 0 });
  });
});

describe("Asaas manual dead-letter replay", () => {
  const body = {
    eventId,
    operatorRef: "platform-operator",
    reason: "Investigated the failed provider response in Sandbox.",
  };
  const deps = () => ({
    environment: "sandbox" as const,
    replayToken,
    requeue: vi.fn().mockResolvedValue(true),
  });

  it("rejects the scheduler credential before reading the request", async () => {
    const dependencies = deps();
    const response = await replayAsaasEvent(replay(body, workerToken), dependencies);
    expect(response.status).toBe(401);
    expect(dependencies.requeue).not.toHaveBeenCalled();
  });

  it("queues only a reviewed event in the configured environment", async () => {
    const dependencies = deps();
    const response = await replayAsaasEvent(replay(body), dependencies);
    expect(response.status).toBe(202);
    expect(dependencies.requeue).toHaveBeenCalledWith({ environment: "sandbox", ...body });
  });

  it("rejects malformed requests and oversized bodies before requeueing", async () => {
    const dependencies = deps();
    expect(
      (await replayAsaasEvent(replay({ ...body, reason: "retry" }), dependencies)).status,
    ).toBe(400);
    expect(
      (await replayAsaasEvent(replay({ ...body, operatorRef: "a/b" }), dependencies)).status,
    ).toBe(400);
    expect(
      (await replayAsaasEvent(replay({ ...body, reason: "x".repeat(2_050) }), dependencies)).status,
    ).toBe(413);
    expect(dependencies.requeue).not.toHaveBeenCalled();
  });

  it("does not requeue a processed or in-flight event", async () => {
    const dependencies = deps();
    dependencies.requeue.mockResolvedValue(false);
    const response = await replayAsaasEvent(replay(body), dependencies);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ queued: false });
  });

  it("reports storage failure without claiming the event was queued", async () => {
    const dependencies = deps();
    dependencies.requeue.mockRejectedValue(new Error("DB unavailable"));
    const response = await replayAsaasEvent(replay(body), dependencies);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ queued: false });
  });
});
