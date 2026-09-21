import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/billing/asaas-checkout")({
  // @ts-expect-error TanStack Start server handlers are transformed by the router plugin.
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
