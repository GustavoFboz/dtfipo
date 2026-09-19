export const ASAAS_PROVIDER = "asaas" as const;
export const ASAAS_BILLING_CYCLE = "MONTHLY" as const;
export const ASAAS_PROVIDER_ENVIRONMENTS = ["sandbox", "production"] as const;

export type AsaasProviderEnvironment = (typeof ASAAS_PROVIDER_ENVIRONMENTS)[number];

export type AsaasPaymentEffect =
  | "pending"
  | "paid"
  | "past_due"
  | "failed"
  | "reversed"
  | "manual_review"
  | "informational"
  | "unknown";

/**
 * Domain classification only. Applying an effect still requires webhook
 * authentication, ownership/period correlation and idempotent persistence.
 */
export const ASAAS_PAYMENT_EVENT_EFFECT = {
  PAYMENT_CREATED: "pending",
  PAYMENT_AWAITING_RISK_ANALYSIS: "pending",
  PAYMENT_APPROVED_BY_RISK_ANALYSIS: "pending",
  PAYMENT_AUTHORIZED: "pending",
  PAYMENT_UPDATED: "pending",
  PAYMENT_CONFIRMED: "paid",
  PAYMENT_RECEIVED: "paid",
  PAYMENT_ANTICIPATED: "paid",
  PAYMENT_OVERDUE: "past_due",
  PAYMENT_REPROVED_BY_RISK_ANALYSIS: "failed",
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: "failed",
  PAYMENT_DELETED: "failed",
  PAYMENT_BANK_SLIP_CANCELLED: "failed",
  PAYMENT_RESTORED: "pending",
  PAYMENT_REFUND_IN_PROGRESS: "manual_review",
  PAYMENT_PARTIALLY_REFUNDED: "manual_review",
  PAYMENT_REFUND_DENIED: "manual_review",
  PAYMENT_REFUNDED: "reversed",
  PAYMENT_RECEIVED_IN_CASH_UNDONE: "reversed",
  PAYMENT_CHARGEBACK_REQUESTED: "reversed",
  PAYMENT_CHARGEBACK_DISPUTE: "manual_review",
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: "manual_review",
  PAYMENT_DUNNING_REQUESTED: "informational",
  PAYMENT_DUNNING_RECEIVED: "informational",
  PAYMENT_BANK_SLIP_VIEWED: "informational",
  PAYMENT_CHECKOUT_VIEWED: "informational",
  PAYMENT_SPLIT_CANCELLED: "informational",
  PAYMENT_SPLIT_DIVERGENCE_BLOCK: "manual_review",
  PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED: "manual_review",
} as const satisfies Record<string, Exclude<AsaasPaymentEffect, "unknown">>;

export type KnownAsaasPaymentEvent = keyof typeof ASAAS_PAYMENT_EVENT_EFFECT;

export function classifyAsaasPaymentEvent(eventType: string): AsaasPaymentEffect {
  return (
    ASAAS_PAYMENT_EVENT_EFFECT[eventType as KnownAsaasPaymentEvent] ?? "unknown"
  );
}

export const ASAAS_SUBSCRIPTION_EVENT_EFFECT = {
  SUBSCRIPTION_CREATED: "observe",
  SUBSCRIPTION_UPDATED: "reconcile",
  SUBSCRIPTION_INACTIVATED: "cancel",
  SUBSCRIPTION_DELETED: "cancel",
  SUBSCRIPTION_SPLIT_DISABLED: "manual_review",
  SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK: "manual_review",
  SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK_FINISHED: "reconcile",
} as const;

