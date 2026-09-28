import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/billing/asaas-renewal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleAsaasRenewalRequest } = await import("@/lib/billing/asaas-renewal.server");
        return handleAsaasRenewalRequest(request);
      },
      OPTIONS: async ({ request }) => {
        const { handleAsaasRenewalRequest } = await import("@/lib/billing/asaas-renewal.server");
        return handleAsaasRenewalRequest(request);
      },
    },
  },
});
