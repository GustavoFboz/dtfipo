import { describe, expect, it, vi } from "vitest";

import {
  executeAsaasCheckoutRequest,
  selectInitialSubscriptionPayment,
} from "./asaas-checkout.server";
import type { AsaasClient, AsaasPayment } from "./asaas.server";

const client = {
  validatePaymentUrl: vi.fn((value: string) => {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "sandbox.asaas.com") {
      throw new Error("invalid payment url");
    }
    return url.toString();
  }),
} as unknown as Pick<AsaasClient, "validatePaymentUrl">;

describe("Asaas checkout payment selection", () => {
  it("seleciona somente a cobrança que corresponde à assinatura, cliente e valor", () => {
    const payments: AsaasPayment[] = [
      {
        id: "pay_WRONGCUSTOMER",
        customer: "cus_OTHER",
        subscription: "sub_EXPECTED",
        value: 199,
        dueDate: "2026-09-22",
        invoiceUrl: "https://sandbox.asaas.com/i/wrong-customer",
      },
      {
        id: "pay_WRONGVALUE",
        customer: "cus_EXPECTED",
        subscription: "sub_EXPECTED",
        value: 299,
        dueDate: "2026-09-22",
        invoiceUrl: "https://sandbox.asaas.com/i/wrong-value",
      },
      {
        id: "pay_EXPECTED",
        customer: "cus_EXPECTED",
        subscription: "sub_EXPECTED",
        value: 199,
        dueDate: "2026-09-22",
        invoiceUrl: "https://sandbox.asaas.com/i/expected",
      },
    ];

    expect(
      selectInitialSubscriptionPayment({
        payments,
        client,
        subscriptionId: "sub_EXPECTED",
        customerId: "cus_EXPECTED",
        amountCents: 19_900,
      }),
    ).toEqual({
      paymentId: "pay_EXPECTED",
      paymentUrl: "https://sandbox.asaas.com/i/expected",
      dueDate: "2026-09-22",
    });
  });

  it("não entrega uma URL que falhe na validação do ambiente", () => {
    expect(() =>
      selectInitialSubscriptionPayment({
        payments: [
          {
            id: "pay_EXPECTED",
            customer: "cus_EXPECTED",
            subscription: "sub_EXPECTED",
            value: 199,
            dueDate: "2026-09-22",
            invoiceUrl: "https://example.test/i/fake",
          },
        ],
        client,
        subscriptionId: "sub_EXPECTED",
        customerId: "cus_EXPECTED",
        amountCents: 19_900,
      }),
    ).toThrow(/invalid payment url/i);
  });

  it("retorna vazio enquanto a cobrança inicial ainda não existe", () => {
    expect(
      selectInitialSubscriptionPayment({
        payments: [],
        client,
        subscriptionId: "sub_EXPECTED",
        customerId: "cus_EXPECTED",
        amountCents: 19_900,
      }),
    ).toBeNull();
  });
});

describe("Asaas checkout transport boundary", () => {
  it("retorna erro JSON serializável quando a sessão não envia bearer token", async () => {
    const result = await executeAsaasCheckoutRequest(
      new Request("https://dtfipo.lovable.app/api/billing/asaas-checkout", {
        method: "POST",
        headers: { origin: "https://dtfipo.lovable.app" },
      }),
      "85c18580-3fa7-4fb0-8101-e0625f1fd875",
    );

    expect(result).toEqual({
      ok: false,
      error: "Sua sessão não permite gerenciar esta assinatura.",
      code: "BILLING_CHECKOUT_FORBIDDEN",
      status: 403,
    });
  });

  it("bloqueia origem externa antes de executar qualquer operação financeira", async () => {
    const result = await executeAsaasCheckoutRequest(
      new Request("https://dtfipo.lovable.app/api/billing/asaas-checkout", {
        method: "POST",
        headers: { origin: "https://malicious.example" },
      }),
      "85c18580-3fa7-4fb0-8101-e0625f1fd875",
    );

    expect(result).toEqual({
      ok: false,
      error: "Origem inválida.",
      code: "INVALID_REQUEST_ORIGIN",
      status: 403,
    });
  });
});
