import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/billing/asaas-document")({
  server: { handlers: {
    POST: async ({ request }) => {
      const { handleAsaasDocumentRequest } = await import("@/lib/billing/asaas-document.server");
      return handleAsaasDocumentRequest(request);
    },
    OPTIONS: async ({ request }) => {
      const { handleAsaasDocumentRequest } = await import("@/lib/billing/asaas-document.server");
      return handleAsaasDocumentRequest(request);
    },
  } },
});
