import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/billing/asaas-worker")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        if (new URL(request.url).searchParams.get("check") === "database-scheduler") {
          const { manageAsaasDatabaseScheduler } = await import("@/lib/billing/asaas-database-scheduler.server");
          return manageAsaasDatabaseScheduler(request);
        }
        if (new URL(request.url).searchParams.get("check") === "production-webhook") {
          const { inspectAsaasProductionWebhook } = await import("@/lib/billing/asaas-production-preflight.server");
          return inspectAsaasProductionWebhook(request);
        }
        if (new URL(request.url).searchParams.get("check") === "production-setup") {
          const { inspectAsaasProductionSetup } = await import("@/lib/billing/asaas-production-preflight.server");
          return inspectAsaasProductionSetup(request);
        }
        const { inspectAsaasWorker } = await import("@/lib/billing/asaas-worker-health.server");
        return inspectAsaasWorker(request);
      },
      POST: async ({ request }: { request: Request }) => {
        if (new URL(request.url).searchParams.get("check") === "database-scheduler") {
          const { manageAsaasDatabaseScheduler } = await import("@/lib/billing/asaas-database-scheduler.server");
          return manageAsaasDatabaseScheduler(request);
        }
        const { processAsaasInbox } = await import("@/lib/billing/asaas-webhook.server");
        return processAsaasInbox(request);
      },
    },
  },
});
