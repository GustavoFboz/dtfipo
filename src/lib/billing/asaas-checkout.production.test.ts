import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as asaas from "./asaas.server";
import { handleAsaasCheckoutRequest } from "./asaas-checkout.server";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { getUser: mocks.getUser }, rpc: mocks.rpc },
}));
const actorId = "11111111-1111-4111-8111-111111111111";
const subscriptionId = "22222222-2222-4222-8222-222222222222";
const clinicId = "33333333-3333-4333-8333-333333333333";
const intentId = "44444444-4444-4444-8444-444444444444";

function arrange(amountCents: number) {
  mocks.getUser.mockResolvedValue({ data: { user: { id: actorId } }, error: null });
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "billing_get_checkout_provisioning_context") return { error: null, data: {
      checkout_intent_id: intentId, subscription_id: subscriptionId, clinic_id: clinicId,
      amount_cents: amountCents, currency: "BRL", status: "pending", provider_environment: "production",
    } };
    if (name === "billing_get_asaas_provisioning_context") return { error: null, data: {
      subscription_id: subscriptionId, clinic_id: clinicId, country_code: "BR", currency: "BRL",
      provider_environment: "production", monthly_price_cents: amountCents,
      external_subscription_id: null, tax_id_digits: "11222333000181",
      billing_phone_digits: "11999999999", postal_code_digits: "01001000",
    } };
    if (name === "billing_claim_provider_operation") return { error: null, data: {
      operation_id: "55555555-5555-4555-8555-555555555555", claimed: true,
      status: "in_progress", lease_token: "66666666-6666-4666-8666-666666666666", attempt_count: 1,
    } };
    if (name === "billing_finish_provider_operation") return { error: null, data: true };
    throw new Error("Unexpected billing write");
  });
}

async function request() {
  return handleAsaasCheckoutRequest(new Request("https://dtfipo.lovable.app/api/billing/asaas-checkout", {
    method: "POST", headers: { origin: "https://dtfipo.lovable.app", "content-type": "application/json",
      authorization: "Bearer fixture-session-not-a-real-credential" },
    body: JSON.stringify({ checkoutIntentId: intentId }),
  }));
}

beforeEach(() => {
  vi.spyOn(asaas, "loadAsaasConfig").mockReturnValue({ environment: "production",
    baseUrl: "https://api.asaas.com/v3", apiKey: "fixture-not-a-real-key",
    webhookToken: "fixture-not-a-real-webhook-token", userAgent: "DentalFlow/tests",
    timeoutMs: 1_000, maxGetRetries: 0, minRequestIntervalMs: 0 });
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("Production checkout errors across the shared HTTP boundary", () => {
  it("explains the minimum without provider traffic, operation claims or a changed amount", async () => {
    arrange(100);
    const provider = vi.spyOn(asaas.AsaasClient.prototype, "findCustomersByExternalReference");
    const response = await request();
    expect(response.status).toBe(422);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ code: "ASAAS_CHECKOUT_AMOUNT_BELOW_MINIMUM",
      error: "O Asaas aceita cobranças reais a partir de R$ 5,00. O responsável pelo DentalFlow precisa ajustar o valor do plano antes de continuar." });
    expect(provider).not.toHaveBeenCalled();
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "billing_get_checkout_provisioning_context", "billing_get_asaas_provisioning_context",
    ]);
  });

  it.each(["invalid_value", "invalid_customer"])("maps provider code %s without echoing provider personal data", async (code) => {
    arrange(500);
    vi.spyOn(asaas.AsaasClient.prototype, "findCustomersByExternalReference").mockRejectedValue(
      new asaas.AsaasApiError({ code, message: "private-billing@example.test 11222333000181", status: 400 }));
    const response = await request();
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.code).toBe(code);
    expect(body.error).toContain("O Asaas");
    expect(body.error).not.toContain("dados atuais");
    expect(JSON.stringify(body)).not.toMatch(/private-billing|11222333000181/);
  });
});
