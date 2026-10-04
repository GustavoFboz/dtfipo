import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/billing/asaas-worker")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const { inspectAsaasWorker } = await import("@/lib/billing/asaas-worker-health.server");
        return inspectAsaasWorker(request);
      },
      POST: async ({ request }: { request: Request }) => {
        const { processAsaasInbox } = await import("@/lib/billing/asaas-webhook.server");
        return processAsaasInbox(request);
      },
    },
  },
});
