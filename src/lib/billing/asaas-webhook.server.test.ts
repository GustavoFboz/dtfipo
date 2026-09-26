import { describe, expect, it, vi } from "vitest";
import { processAsaasInbox, receiveAsaasWebhook } from "./asaas-webhook.server";

const webhookToken = "webhook-test-token-0123456789-0123456789";
const workerToken = "worker-test-token-0123456789-0123456789";
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

  it("persists only the resource ID and acknowledges after the write", async () => {
    const receive = vi.fn().mockResolvedValue(undefined);
    const result = await receiveAsaasWebhook(
      webhook({
        id: eventId,
        event: "PAYMENT_CONFIRMED",
        payment: { id: paymentId, customer: "private", cpfCnpj: "sensitive" },
      }),
      { environment: "sandbox", webhookToken, receive },
    );
    expect(result.status).toBe(200);
    expect(receive).toHaveBeenCalledWith({
      environment: "sandbox",
      eventId,
      eventType: "PAYMENT_CONFIRMED",
      payload: { paymentId },
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
    enqueueRecovery: vi.fn().mockResolvedValue(undefined),
    finish: vi.fn().mockResolvedValue(undefined),
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
      paymentId,
    );
    expect(await result.json()).toMatchObject({ recoveryQueued: 1 });
  });
});
