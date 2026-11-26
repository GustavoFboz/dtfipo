import { describe, expect, it } from "vitest";
import { selectHostedDocument } from "./asaas-document.server";

const context = {
  payment_id: "pay_History", customer_id: "cus_History", subscription_id: "sub_History",
  amount_cents: 100, environment: "sandbox" as const,
};
const payment = {
  id: "pay_History", customer: "cus_History", subscription: "sub_History",
  value: 1, invoiceUrl: "https://sandbox.asaas.com/i/payment", status: "CONFIRMED",
};

describe("hosted billing document", () => {
  it("accepts only the linked Asaas charge and validated hosted URL", () => {
    expect(selectHostedDocument(payment, context, (url) => url)).toBe(payment.invoiceUrl);
    expect(() => selectHostedDocument({ ...payment, customer: "cus_Other" }, context, (url) => url))
      .toThrow("BILLING_DOCUMENT_PROVIDER_MISMATCH");
    expect(() => selectHostedDocument({ ...payment, value: 249 }, context, (url) => url))
      .toThrow("BILLING_DOCUMENT_PROVIDER_MISMATCH");
    expect(() => selectHostedDocument(payment, context, () => { throw new Error("INVALID_URL"); }))
      .toThrow("INVALID_URL");
  });
});
