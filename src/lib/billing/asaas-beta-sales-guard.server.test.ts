import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

// No requests to Supabase/Asaas: the test supplies only a synthetic DB client.
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { getUser: mock.getUser }, rpc: mock.rpc },
}));

import {
  assertBetaAsaasCheckoutHandoffAllowed,
  executeAsaasCheckoutRequest,
  handleAsaasCheckoutRequest,
} from "./asaas-checkout.server";

const checkoutIntentId = "85c18580-3fa7-4fb0-8101-e0625f1fd875";
const validUserId = "76e49c97-573b-4c14-99f6-93672c3bbabe";
const apiUrl = "https://dtfipo.lovable.app/api/billing/asaas-checkout";

function nativeRequest() {
  return new Request(apiUrl, {
    method: "POST",
    headers: {
      origin: "https://localhost", // Capacitor; both transports share the same boundary
      authorization: "Bearer " + "syntheticToken".repeat(3),
    },
  });
}

function webRequest() {
  return new Request(apiUrl, {
    method: "POST",
    headers: {
      origin: "https://dtfipo.lovable.app",
      authorization: "Bearer " + "syntheticToken".repeat(3),
      "content-type": "application/json",
    },
    body: JSON.stringify({ checkoutIntentId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: validUserId } }, error: null });
});

describe("beta checkout handoff — protection independent of client UI", () => {
  it("denies an older valid intent at the native transport when sales are paused", async () => {
    mock.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "BETA_NEW_CHECKOUTS_PAUSED" },
    });
    const result = await executeAsaasCheckoutRequest(nativeRequest(), checkoutIntentId);
    expect(result).toEqual({
      ok: false,
      error: "Novas contratações estão temporariamente suspensas.",
      code: "BETA_NEW_CHECKOUTS_PAUSED",
      status: 423,
    });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.rpc).toHaveBeenCalledWith("beta_assert_new_checkout_handoff_allowed");
  });

  it("denies an older valid intent from the web HTTP transport as JSON", async () => {
    mock.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "BETA_NEW_CHECKOUTS_PAUSED" },
    });
    const response = await handleAsaasCheckoutRequest(webRequest());
    expect(response.status).toBe(423);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "Novas contratações estão temporariamente suspensas.",
      code: "BETA_NEW_CHECKOUTS_PAUSED",
    });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing migration", { data: null, error: { code: "PGRST202", message: "Function not found" } }],
    ["database unavailable", { data: null, error: { code: "08006", message: "Connection unavailable" } }],
    ["malformed RPC result", { data: false, error: null }],
    ["empty RPC result", { data: null, error: null }],
  ])("fails closed on %s before any provider operation", async (_name, answer) => {
    mock.rpc.mockResolvedValue(answer);
    const result = await executeAsaasCheckoutRequest(nativeRequest(), checkoutIntentId);
    expect(result).toMatchObject({ ok: false, code: "BETA_CHECKOUT_GUARD_UNAVAILABLE", status: 503 });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });

  it("permits handoff only when the authoritative server RPC says true", async () => {
    mock.rpc.mockResolvedValue({ data: true, error: null });
    await expect(assertBetaAsaasCheckoutHandoffAllowed()).resolves.toBeUndefined();
    expect(mock.rpc).toHaveBeenCalledWith("beta_assert_new_checkout_handoff_allowed");
  });

  it("never calls the control RPC without an authenticated user", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: { message: "unauthenticated" } });
    const result = await executeAsaasCheckoutRequest(nativeRequest(), checkoutIntentId);
    expect(result).toMatchObject({ ok: false, code: "BILLING_CHECKOUT_FORBIDDEN", status: 403 });
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
