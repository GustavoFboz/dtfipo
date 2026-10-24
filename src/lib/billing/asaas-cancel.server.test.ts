import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeAsaasCancelRequest } from "./asaas-cancel.server";

const requestId = "80600000-0000-4000-8000-000000000001";
const subscriptionId = "80600000-0000-4000-8000-000000000002";
const claim = { done: false as const, request_id: requestId, subscription_id: subscriptionId,
  lease_token: "80600000-0000-4000-8000-000000000003", external_subscription_id: "sub_Cancel",
  external_customer_id: "cus_Cancel", amount_cents: 24900, environment: "sandbox" as const, reconcile_only: false };
const active = { id: "sub_Cancel", customer: "cus_Cancel", value: 249, deleted: false,
  externalReference: `dentalflow:subscription:${subscriptionId}`, cycle: "MONTHLY", status: "ACTIVE" };
const inactive = { ...active, status: "INACTIVE" };
const input = { requestId, environment: "sandbox", reason: "Solicitação de cancelamento conferida pelo operador", reconcileOnly: false };
const http = new Request("https://dtfipo.lovable.app/api/billing/asaas-cancel", { method: "POST" });
let deps: Parameters<typeof executeAsaasCancelRequest>[2];
beforeEach(() => {
  deps = { environment: "sandbox", claim: vi.fn().mockResolvedValue(claim), beginWrite: vi.fn().mockResolvedValue(true),
    finish: vi.fn().mockImplementation(async (_c, proof) => proof ? "completed" : "review_required"),
    client: { getSubscription: vi.fn().mockResolvedValueOnce(active).mockResolvedValue(inactive),
      updateSubscription: vi.fn().mockResolvedValue(inactive) } };
});

describe("leased Asaas cancellation", () => {
  it("performs exactly one inactivation and requires fresh readback", async () => {
    expect(await executeAsaasCancelRequest(http, input, deps)).toEqual({ ok: true, requestId, environment: "sandbox", status: "completed" });
    expect(deps!.client.updateSubscription).toHaveBeenCalledExactlyOnceWith("sub_Cancel", { status: "INACTIVE" });
    expect(deps!.client.getSubscription).toHaveBeenCalledTimes(2);
    expect(deps!.finish).toHaveBeenCalledWith(claim, inactive, null);
  });
  it("recovers a lost PUT response through GET without a second write", async () => {
    vi.mocked(deps!.client.updateSubscription).mockRejectedValue(new Error("ASAAS_TIMEOUT"));
    expect(await executeAsaasCancelRequest(http, input, deps)).toMatchObject({ ok: true, status: "completed" });
    expect(deps!.client.updateSubscription).toHaveBeenCalledTimes(1);
  });
  it("does not trust a successful PUT when provider still reports ACTIVE", async () => {
    vi.mocked(deps!.client.getSubscription).mockReset().mockResolvedValue(active);
    expect(await executeAsaasCancelRequest(http, input, deps)).toMatchObject({ ok: true, status: "review_required" });
    expect(deps!.finish).toHaveBeenCalledWith(claim, null, "PROVIDER_STILL_ACTIVE");
  });
  it.each([true, false])("an expired/review claim forces reads regardless of the client instruction (%s)", async (clientReadonly) => {
    vi.mocked(deps!.claim).mockResolvedValue({ ...claim, reconcile_only: true });
    vi.mocked(deps!.client.getSubscription).mockReset().mockResolvedValue(active);
    expect(await executeAsaasCancelRequest(http, { ...input, reconcileOnly: clientReadonly }, deps)).toMatchObject({ ok: true, status: "review_required" });
    expect(deps!.beginWrite).not.toHaveBeenCalled(); expect(deps!.client.updateSubscription).not.toHaveBeenCalled();
  });
  it("does not accept a claim allowing writes during explicit reconciliation", async () => {
    expect(await executeAsaasCancelRequest(http, { ...input, reconcileOnly: true }, deps)).toMatchObject({ ok: false });
    expect(deps!.client.getSubscription).not.toHaveBeenCalled(); expect(deps!.client.updateSubscription).not.toHaveBeenCalled();
  });
  it("does not mutate an already inactive resource", async () => {
    vi.mocked(deps!.client.getSubscription).mockReset().mockResolvedValue(inactive);
    expect(await executeAsaasCancelRequest(http, input, deps)).toMatchObject({ ok: true, status: "completed" });
    expect(deps!.beginWrite).not.toHaveBeenCalled(); expect(deps!.client.updateSubscription).not.toHaveBeenCalled();
  });
  it.each([{ customer: "cus_Other" }, { id: "sub_Other" }, { value: 1 }, { value: 249.00001 },
    { deleted: true }, { deleted: undefined }, { cycle: "YEARLY" }, { externalReference: "other-contract" }])(
    "refuses unverified ownership/contract/deletion before any write (%s)", async (fields) => {
      vi.mocked(deps!.client.getSubscription).mockReset().mockResolvedValue({ ...active, ...fields });
      expect(await executeAsaasCancelRequest(http, input, deps)).toMatchObject({ ok: false });
      expect(deps!.beginWrite).not.toHaveBeenCalled(); expect(deps!.client.updateSubscription).not.toHaveBeenCalled();
    });
  it("requires a fresh server write authorization after the lookup", async () => {
    vi.mocked(deps!.beginWrite).mockRejectedValue(new Error("BILLING_CANCEL_SESSION_REQUIRED"));
    expect(await executeAsaasCancelRequest(http, input, deps)).toMatchObject({ ok: false, status: 403 });
    expect(deps!.client.updateSubscription).not.toHaveBeenCalled();
  });
  it("keeps an unreadable post-write outcome in review without leaking raw errors", async () => {
    vi.mocked(deps!.client.getSubscription).mockRejectedValueOnce(new Error("private provider data"));
    const result = await executeAsaasCancelRequest(http, input, deps);
    expect(result).toMatchObject({ ok: false }); expect(JSON.stringify(result)).not.toContain("private provider data");
    expect(deps!.finish).toHaveBeenCalledWith(claim, null, "PROVIDER_RESULT_UNCONFIRMED");
    expect(deps!.client.updateSubscription).toHaveBeenCalledTimes(1);
  });
  it("returns the recorded completion without any provider request on retry", async () => {
    vi.mocked(deps!.claim).mockResolvedValue({ done: true, request_id: requestId });
    expect(await executeAsaasCancelRequest(http, input, deps)).toMatchObject({ ok: true, status: "completed" });
    expect(deps!.client.getSubscription).not.toHaveBeenCalled(); expect(deps!.beginWrite).not.toHaveBeenCalled();
  });
  it("does not acknowledge a completion whose persistence failed", async () => {
    vi.mocked(deps!.finish).mockRejectedValue(new Error("database unavailable"));
    expect(await executeAsaasCancelRequest(http, input, deps)).toMatchObject({ ok: false });
    expect(deps!.client.updateSubscription).toHaveBeenCalledTimes(1);
  });
  it("rejects a wrong environment or cross-origin request before claiming", async () => {
    await executeAsaasCancelRequest(http, { ...input, environment: "production" }, deps);
    await executeAsaasCancelRequest(new Request(http, { headers: { Origin: "https://example.com" } }), input, deps);
    expect(deps!.claim).not.toHaveBeenCalled(); expect(deps!.client.updateSubscription).not.toHaveBeenCalled();
  });
  it.each([{ ...input, reason: "short" }, { ...input, actorId: "forged" }, { ...input, requestId: "not-uuid" }])(
    "rejects malformed or unrequested fields (%s)", async (value) => {
      expect(await executeAsaasCancelRequest(http, value, deps)).toMatchObject({ ok: false, status: 400 });
      expect(deps!.claim).not.toHaveBeenCalled();
    });
});
