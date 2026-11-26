import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/billing/asaas-webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { receiveAsaasWebhook } = await import("@/lib/billing/asaas-webhook.server");
        return receiveAsaasWebhook(request);
      },
    },
  },
});
