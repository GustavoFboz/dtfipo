import { describe, expect, it } from "vitest";

import { executeAsaasRenewalRequest, selectRenewalInvoice } from "./asaas-renewal.server";

const context = {
  subscription_id: "85c18580-3fa7-4fb0-8101-e0625f1fd875",
  external_subscription_id: "sub_EXPECTED",
  external_customer_id: "cus_EXPECTED",
  provider_environment: "sandbox" as const,
  monthly_price_cents: 24_900,
  current_period_end: "2026-10-29T00:00:00+00:00",
};

const validPayment = {
  id: "pay_RENEWAL",
  subscription: "sub_EXPECTED",
  customer: "cus_EXPECTED",
  value: 249,
  status: "PENDING",
  dueDate: "2026-10-29",
  invoiceUrl: "https://sandbox.asaas.com/i/renewal",
};

const validateUrl = (value: string) => {
  const url = new URL(value);
  if (url.hostname !== "sandbox.asaas.com") throw new Error("invalid Asaas URL");
  return url.toString();
};

describe("Asaas renewal invoice handoff", () => {
  it("requires an authenticated company manager before querying Asaas", async () => {
    const result = await executeAsaasRenewalRequest(
      new Request("https://dtfipo.lovable.app/api/billing/asaas-renewal", {
        method: "POST",
        headers: { origin: "https://dtfipo.lovable.app" },
      }),
      context.subscription_id,
    );
    expect(result).toEqual({
      ok: false,
      code: "BILLING_RENEWAL_FORBIDDEN",
      error: "Esta sessão não pode abrir a cobrança da empresa.",
      status: 403,
    });
  });
  it("opens only the next unpaid invoice on the same subscription", () => {
    expect(selectRenewalInvoice({
      context,
      validateUrl,
      payments: [
        { ...validPayment, id: "pay_INITIAL", status: "CONFIRMED", dueDate: "2026-09-29" },
        { ...validPayment, id: "pay_LATER", dueDate: "2026-11-29" },
        validPayment,
      ],
    })).toEqual({
      paymentId: "pay_RENEWAL",
      paymentUrl: "https://sandbox.asaas.com/i/renewal",
      dueDate: "2026-10-29",
      amountCents: 24_900,
      environment: "sandbox",
    });
  });

  it("does not offer an already paid or absent invoice", () => {
    expect(selectRenewalInvoice({
      context, validateUrl, payments: [{ ...validPayment, status: "CONFIRMED" }],
    })).toBeNull();
    expect(selectRenewalInvoice({ context, validateUrl, payments: [] })).toBeNull();
  });

  it("blocks duplicate invoices, wrong amounts and payment URLs outside Asaas", () => {
    expect(() => selectRenewalInvoice({
      context, validateUrl, payments: [validPayment, { ...validPayment, id: "pay_DUPLICATE" }],
    })).toThrow(/AMBIGUOUS/);
    expect(() => selectRenewalInvoice({
      context, validateUrl, payments: [{ ...validPayment, value: 250 }],
    })).toThrow(/MISMATCH/);
    expect(() => selectRenewalInvoice({
      context, validateUrl, payments: [{ ...validPayment, invoiceUrl: "https://example.test/i/renewal" }],
    })).toThrow(/invalid Asaas URL/);
  });
});
