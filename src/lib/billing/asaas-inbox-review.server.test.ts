import { afterEach, describe, expect, it, vi } from "vitest";
import { AsaasApiError } from "./asaas.server";
import { inspectAsaasInboxReview, INBOX_REVIEW_CONTRACT } from "./asaas-inbox-review.server";
const token = "inbox-review-fixture-not-a-real-secret-0123456789";
const id = "9ad8482e-eb0f-48fd-9ea5-aee5c4b776c2";
const row = { id, provider_environment: "sandbox", status: "dead_letter", event_type: "PAYMENT_OVERDUE",
  attempt_count: 6, error_message: "PROVIDER_RECONCILIATION_FAILED", payload: {
    paymentId: "pay_fixture1", subscriptionId: "sub_fixture1", customerId: "cus_fixture1",
    externalReference: "private-reference", private: "private-inbox-marker" } };
const payment = { id: "pay_fixture1", customer: "cus_fixture1", subscription: "sub_fixture1", status: "OVERDUE",
  value: 249, dueDate: "2026-10-05",
  deleted: false, invoiceUrl: "https://private.example.invalid", cpfCnpj: "private-cpf-marker", private: "private-provider-marker" };
function deps(rows: unknown = [row]) {
  return { workerToken: token, environment: "sandbox" as "sandbox" | "production", now: () => Date.parse("2026-10-05T20:00:00Z"),
    readEvents: vi.fn().mockResolvedValue(rows), getPayment: vi.fn().mockResolvedValue(payment),
    getSubscription: vi.fn().mockResolvedValue({ id: "sub_fixture1", customer: "cus_fixture1", status: "INACTIVE" }) };
}
function request(secret = token, method = "GET", environment = "sandbox", query = "check=inbox-review") {
  return new Request(`https://dtfipo.lovable.app/api/billing/asaas-worker?${query}`, {
    method, headers: { Authorization: `Bearer ${secret}`, "X-Billing-Environment": environment },
  });
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe("bounded private Sandbox dead-letter diagnosis", () => {
  it.each(["POST", "PUT", "DELETE"])("refuses %s before any database/provider read", async (method) => {
    const d = deps(); expect((await inspectAsaasInboxReview(request(token, method), d)).status).toBe(405);
    expect(d.readEvents).not.toHaveBeenCalled(); expect(d.getPayment).not.toHaveBeenCalled();
  });
  it.each(["wrong", "", "Bearer extra"])("refuses invalid credentials without reading an event", async (secret) => {
    const d = deps(); expect((await inspectAsaasInboxReview(request(secret), d)).status).toBe(401);
    expect(d.readEvents).not.toHaveBeenCalled(); expect(d.getPayment).not.toHaveBeenCalled();
  });
  it.each(["check=inbox-review&paymentId=pay_other", "check=inbox-review&check=inbox-review", "check=other", ""])(
    "does not let a caller select resources: %s", async (query) => {
      const d = deps(); expect((await inspectAsaasInboxReview(request(token, "GET", "sandbox", query), d)).status).toBe(400);
      expect(d.readEvents).not.toHaveBeenCalled();
    });
  it("requires the runtime and explicit caller environment to both be Sandbox", async () => {
    const d = deps(); d.environment = "production";
    expect((await inspectAsaasInboxReview(request(), d)).status).toBe(409);
    d.environment = "sandbox";
    expect((await inspectAsaasInboxReview(request(token, "GET", "production"), d)).status).toBe(409);
    expect(d.readEvents).not.toHaveBeenCalled(); expect(d.getPayment).not.toHaveBeenCalled();
  });
  it("returns a safe projection with manual review still required", async () => {
    const d = deps(); const r = await inspectAsaasInboxReview(request(), d);
    expect(r.status).toBe(200); expect(r.headers.get("cache-control")).toBe("no-store");
    const body = await r.json();
    expect(body).toEqual({ available: true, contract: INBOX_REVIEW_CONTRACT, environment: "sandbox",
      checked_at: "2026-10-05T20:00:00.000Z", has_more: false, provider_writes_invoked: false,
      financial_processing_invoked: false, replay_invoked: false, events: [{ id, event_type: "PAYMENT_OVERDUE",
        attempt_count: 6, stored_error_code: "PROVIDER_RECONCILIATION_FAILED", resource_kind: "payment",
        resource_id: "pay_fixture1", provider_http_status: 200, provider_status: "OVERDUE", provider_deleted: false,
        provider_subscription_link: "linked", provider_amount_cents: 24900, provider_due_date: "2026-10-05",
        snapshot_customer_matches: true, snapshot_subscription_matches: true, lookup_code: "RESOURCE_READ", requires_manual_review: true }] });
    expect(JSON.stringify(body)).not.toContain("private");
    expect(d.getPayment).toHaveBeenCalledExactlyOnceWith("pay_fixture1"); expect(d.getSubscription).not.toHaveBeenCalled();
  });
  it("distinguishes a provider 404 from the historical reconciliation failure without exposing the body", async () => {
    const d = deps(); d.getPayment.mockRejectedValue(new AsaasApiError({ code: "private-api-error", status: 404, message: "private-body" }));
    const body = await (await inspectAsaasInboxReview(request(), d)).json();
    expect(body.events[0]).toMatchObject({ provider_http_status: 404, lookup_code: "ASAAS_HTTP_404", requires_manual_review: true });
    expect(JSON.stringify(body)).not.toContain("private-body");
  });
  it("reads a subscription only for a subscription event", async () => {
    const d = deps([{ ...row, event_type: "SUBSCRIPTION_INACTIVATED" }]);
    const body = await (await inspectAsaasInboxReview(request(), d)).json();
    expect(body.events[0]).toMatchObject({ resource_kind: "subscription", resource_id: "sub_fixture1", provider_status: "INACTIVE" });
    expect(d.getSubscription).toHaveBeenCalledExactlyOnceWith("sub_fixture1"); expect(d.getPayment).not.toHaveBeenCalled();
  });
  it.each([{}, { paymentId: "pay_other/../private" }, { paymentId: "https://private.example.invalid" }])(
    "does not fetch or expose an invalid resource identifier: %s", async (payload) => {
      const d = deps([{ ...row, payload }]); const body = await (await inspectAsaasInboxReview(request(), d)).json();
      expect(body.events[0]).toMatchObject({ resource_id: null, lookup_code: "MISSING_RESOURCE_ID" });
      expect(d.getPayment).not.toHaveBeenCalled(); expect(JSON.stringify(body)).not.toContain("private");
    });
  it("keeps unexpected event families and raw stored errors private", async () => {
    const d = deps([{ ...row, event_type: "UNKNOWN_EVENT", error_message: "private database details" }]);
    const body = await (await inspectAsaasInboxReview(request(), d)).json();
    expect(body.events[0]).toMatchObject({ resource_id: null, stored_error_code: null, lookup_code: "UNSUPPORTED_EVENT" });
    expect(d.getPayment).not.toHaveBeenCalled(); expect(d.getSubscription).not.toHaveBeenCalled();
  });
  it.each([{ ...payment, id: "pay_other" }, { ...payment, customer: "private-invalid-id" }])(
    "does not confirm malformed/divergent provider resources", async (value) => {
      const d = deps(); d.getPayment.mockResolvedValue(value);
      const body = await (await inspectAsaasInboxReview(request(), d)).json();
      expect(body.events[0]).toMatchObject({ provider_http_status: null, lookup_code: "ASAAS_INVALID_RESPONSE" });
      expect(body.events[0].snapshot_customer_matches).toBeNull();
    });
  it("reports a snapshot mismatch without approving, replaying or leaking the other customer", async () => {
    const d = deps(); d.getPayment.mockResolvedValue({ ...payment, customer: "cus_other", subscription: "sub_other" });
    const body = await (await inspectAsaasInboxReview(request(), d)).json();
    expect(body.events[0]).toMatchObject({ snapshot_customer_matches: false, snapshot_subscription_matches: false, requires_manual_review: true });
    expect(JSON.stringify(body)).not.toContain("cus_other"); expect(JSON.stringify(body)).not.toContain("sub_other");
  });
  it("preserves unknown status/deletion and absent snapshot bindings as unknown", async () => {
    const d = deps([{ ...row, payload: { paymentId: "pay_fixture1" } }]);
    d.getPayment.mockResolvedValue({ ...payment, status: "private-new-status", deleted: undefined });
    const body = await (await inspectAsaasInboxReview(request(), d)).json();
    expect(body.events[0]).toMatchObject({ provider_status: null, provider_deleted: null,
      snapshot_customer_matches: null, snapshot_subscription_matches: null });
  });
  it.each([[null, "absent"], [undefined, "not_reported"]])("distinguishes provider subscription absence from omission", async (subscription, link) => {
    const d = deps(); d.getPayment.mockResolvedValue({ ...payment, subscription });
    const body = await (await inspectAsaasInboxReview(request(), d)).json();
    expect(body.events[0]).toMatchObject({ provider_subscription_link: link, requires_manual_review: true });
    expect(body.events[0].snapshot_subscription_matches).toBe(false);
  });
  it.each([[249.001, "2026-02-30"], [Infinity, "private-date"], ["private-value", null], [-1, "2026-13-01"]])(
    "does not project invalid amounts or dates", async (value, dueDate) => {
      const d = deps(); d.getPayment.mockResolvedValue({ ...payment, value, dueDate });
      const body = await (await inspectAsaasInboxReview(request(), d)).json();
      expect(body.events[0]).toMatchObject({ provider_amount_cents: null, provider_due_date: null });
      expect(JSON.stringify(body)).not.toContain("private");
    });
  it("caps provider reads at two and reports a larger queue", async () => {
    const d = deps([row, row, row]); const body = await (await inspectAsaasInboxReview(request(), d)).json();
    expect(body.has_more).toBe(true); expect(body.events).toHaveLength(2); expect(d.getPayment).toHaveBeenCalledTimes(2);
  });
  it.each([null, [{ ...row, status: "received" }], [{ ...row, provider_environment: "production" }], [row, row, row, row]])(
    "refuses inconsistent database projections before a provider read", async (rows) => {
      const d = deps(rows); expect((await inspectAsaasInboxReview(request(), d)).status).toBe(503);
      expect(d.getPayment).not.toHaveBeenCalled();
    });
  it("does no provider lookup when the queue is empty", async () => {
    const d = deps([]); const body = await (await inspectAsaasInboxReview(request(), d)).json();
    expect(body.events).toEqual([]); expect(body.has_more).toBe(false); expect(d.getPayment).not.toHaveBeenCalled();
  });
  it("redacts database/network failures", async () => {
    const d = deps(); d.readEvents.mockRejectedValue(new Error("private database details"));
    expect(await (await inspectAsaasInboxReview(request(), d)).json()).toEqual({ available: false, code: "INBOX_REVIEW_UNAVAILABLE" });
    d.readEvents.mockResolvedValue([row]); d.getPayment.mockRejectedValue(new Error("private network details"));
    const body = await (await inspectAsaasInboxReview(request(), d)).json();
    expect(body.events[0].lookup_code).toBe("ASAAS_LOOKUP_FAILED"); expect(JSON.stringify(body)).not.toContain("private");
  });
  it("aborts a database timeout and never starts a provider read after a late result", async () => {
    vi.useFakeTimers(); let signal: AbortSignal | undefined; let finish: (value: unknown) => void = () => {};
    const d = deps(); d.readEvents.mockImplementation((s) => { signal = s; return new Promise((resolve) => { finish = resolve; }); });
    const pending = inspectAsaasInboxReview(request(), d); await vi.advanceTimersByTimeAsync(8_001);
    expect((await pending).status).toBe(503); expect(signal?.aborted).toBe(true);
    finish([row]); await vi.advanceTimersByTimeAsync(1); expect(d.getPayment).not.toHaveBeenCalled();
  });
  it("does not start the second lookup after the batch times out during the first", async () => {
    vi.useFakeTimers(); let finish: (value: unknown) => void = () => {};
    const d = deps([row, row]); d.getPayment.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const pending = inspectAsaasInboxReview(request(), d); await vi.advanceTimersByTimeAsync(8_001);
    expect((await pending).status).toBe(503); finish(payment); await vi.advanceTimersByTimeAsync(1);
    expect(d.getPayment).toHaveBeenCalledOnce();
  });
});
