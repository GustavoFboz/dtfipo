import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/billing/asaas-cancel")({
  server: { handlers: {
    POST: async ({ request }: { request: Request }) => {
      const { handleAsaasCancelRequest } = await import("@/lib/billing/asaas-cancel.server");
      return handleAsaasCancelRequest(request);
    },
    OPTIONS: async ({ request }: { request: Request }) => {
      const { handleAsaasCancelRequest } = await import("@/lib/billing/asaas-cancel.server");
      return handleAsaasCancelRequest(request);
    },
  } },
});
