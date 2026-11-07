import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import type { AsaasCheckoutTransportResult } from "./asaas-checkout.server";

type AsaasCheckoutInput = {
  checkoutIntentId: string;
};

/**
 * First-party transport for the hosted web app. The global client middleware
 * attaches the current Supabase bearer token; all authorization and financial
 * work still happen inside the shared server-only checkout boundary.
 */
export const createAsaasCheckoutServerFn = createServerFn({ method: "POST" })
  .validator((input: AsaasCheckoutInput) => ({
    checkoutIntentId: String(input?.checkoutIntentId ?? ""),
  }))
  .handler(async ({ data }): Promise<AsaasCheckoutTransportResult> => {
    const { executeAsaasCheckoutRequest } = await import("./asaas-checkout.server");
    return executeAsaasCheckoutRequest(getRequest(), data.checkoutIntentId);
  });
