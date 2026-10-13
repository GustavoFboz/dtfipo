import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/billing/asaas-checkout")({
  server: {
    handlers: {
      OPTIONS: async ({ request }: { request: Request }) => {
        const { handleAsaasCheckoutOptions } = await import("@/lib/billing/asaas-checkout.server");
        return handleAsaasCheckoutOptions(request);
      },
      POST: async ({ request }: { request: Request }) => {
        const { handleAsaasCheckoutRequest } = await import("@/lib/billing/asaas-checkout.server");
        return handleAsaasCheckoutRequest(request);
      },
    },
  },
});
