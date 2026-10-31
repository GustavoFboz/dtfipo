import type { MySubscriptionContext } from "./subscriptions";

/**
 * A cached subscription is only a record of a previous server decision.
 *
 * Independently, the installed app must enforce its device's <=72-hour
 * authorization and owner isolation before this function is reached.
 *
 * An explicitly server-confirmed courtesy account is not bound to a paid
 * period date. All other companies require a finite future period end.
 */
export function restrictOfflineSubscriptionContext(
  context: MySubscriptionContext,
  now = Date.now(),
): MySubscriptionContext {
  if (context.effective_access !== "full") return context;

  const company = context.company;
  if (company?.internal_full_access === true) return context;

  const end = company?.current_period_end;
  const endMs = typeof end === "string" ? Date.parse(end) : Number.NaN;
  if (Number.isFinite(now) && Number.isFinite(endMs) && now < endMs) return context;

  // Fail closed for expired, missing or malformed billing periods. Preserve
  // the snapshot for the Billing Center; never grant clinical access.
  return {
    ...context,
    effective_access: "billing_only",
    company: company ? { ...company, access_mode: "billing_only" } : company,
  };
}
