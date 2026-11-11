import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { getUser: mock.getUser }, rpc: mock.rpc },
}));

import {
  assertBetaAsaasCheckoutLegalAllowed,
  executeAsaasCheckoutRequest,
} from "./asaas-checkout.server";

const intentId = "85c18580-3fa7-4fb0-8101-e0625f1fd875";
const actorId = "76e49c97-573b-4c14-99f6-93672c3bbabe";
const request = () => new Request(
  "https://dtfipo.lovable.app/api/billing/asaas-checkout",
  { method: "POST", headers: {
    origin: "https://dtfipo.lovable.app",
    authorization: "Bearer " + "syntheticAuthBearer".repeat(3),
  } },
);

beforeEach(() => {
  vi.clearAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: actorId } }, error: null });
});

describe("beta 6 legal checkout acceptance — dormant and server-enforced", () => {
  it("returns safe 423 without touching Asaas if Terms or DPA receipt is missing", async () => {
    mock.rpc
      .mockResolvedValueOnce({ data: true, error: null }) // emergency sales flag OFF
      .mockResolvedValueOnce({
        data: null, error: { code: "42501", message: "BETA_LEGAL_ACCEPTANCE_REQUIRED" },
      });
    const result = await executeAsaasCheckoutRequest(request(), intentId);
    expect(result).toEqual({
      ok: false,
      code: "BETA_LEGAL_ACCEPTANCE_REQUIRED",
      error: "É necessário aceitar os termos vigentes antes de contratar.",
      status: 423,
    });
    expect(mock.rpc).toHaveBeenCalledTimes(2);
    expect(mock.rpc).toHaveBeenNthCalledWith(1, "beta_assert_new_checkout_handoff_allowed");
    expect(mock.rpc).toHaveBeenNthCalledWith(2, "beta_assert_checkout_legal_accepted", {
      p_checkout_intent_id: intentId,
      p_actor_user_id: actorId,
    });
  });

  it("never checks legal receipts if the emergency sale pause already denied checkout", async () => {
    mock.rpc.mockResolvedValueOnce({
      data: null, error: { code: "42501", message: "BETA_NEW_CHECKOUTS_PAUSED" },
    });
    const result = await executeAsaasCheckoutRequest(request(), intentId);
    expect(result).toMatchObject({ ok: false, code: "BETA_NEW_CHECKOUTS_PAUSED", status: 423 });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["SQL migration missing", { data: null, error: { code: "PGRST202", message: "not found" } }],
    ["database unavailable", { data: null, error: { code: "08006", message: "DB down" } }],
    ["unexpected false", { data: false, error: null }],
    ["empty value", { data: null, error: null }],
  ])("fails closed when %s", async (_description, reply) => {
    mock.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce(reply);
    const result = await executeAsaasCheckoutRequest(request(), intentId);
    expect(result).toMatchObject({
      ok: false, code: "BETA_LEGAL_VERIFICATION_UNAVAILABLE", status: 503,
    });
    expect(mock.rpc).toHaveBeenCalledTimes(2);
  });

  it("fails closed if database call throws unexpectedly", async () => {
    mock.rpc.mockRejectedValueOnce(new Error("private customer details"));
    await expect(assertBetaAsaasCheckoutLegalAllowed(intentId, actorId))
      .rejects.toMatchObject({ code: "BETA_LEGAL_VERIFICATION_UNAVAILABLE", status: 503 });
  });

  it("permits continuing only on true response from service-role RPC", async () => {
    mock.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(assertBetaAsaasCheckoutLegalAllowed(intentId, actorId))
      .resolves.toBeUndefined();
    expect(mock.rpc).toHaveBeenCalledWith("beta_assert_checkout_legal_accepted", {
      p_checkout_intent_id: intentId,
      p_actor_user_id: actorId,
    });
  });
});
