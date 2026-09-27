import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/billing/asaas-replay")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { replayAsaasEvent } = await import("@/lib/billing/asaas-webhook.server");
        return replayAsaasEvent(request);
      },
    },
  },
});
