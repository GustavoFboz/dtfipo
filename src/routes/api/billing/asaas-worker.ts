import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/billing/asaas-worker")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { processAsaasInbox } = await import("@/lib/billing/asaas-webhook.server");
        return processAsaasInbox(request);
      },
    },
  },
});
