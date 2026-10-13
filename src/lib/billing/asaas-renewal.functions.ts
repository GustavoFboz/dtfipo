import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import type { RenewalResult } from "./asaas-renewal.server";

export const getAsaasRenewalServerFn = createServerFn({ method: "POST" })
  .validator((input: { subscriptionId: string }) => ({ subscriptionId: String(input?.subscriptionId ?? "") }))
  .handler(async ({ data }): Promise<RenewalResult> => {
    const { executeAsaasRenewalRequest } = await import("./asaas-renewal.server");
    return executeAsaasRenewalRequest(getRequest(), data.subscriptionId);
  });
