import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { DocumentResult } from "./asaas-document.server";

export const getAsaasDocumentServerFn = createServerFn({ method: "POST" })
  .validator((input: { paymentId: string }) => ({ paymentId: String(input?.paymentId ?? "") }))
  .handler(async ({ data }): Promise<DocumentResult> => {
    const { executeAsaasDocumentRequest } = await import("./asaas-document.server");
    return executeAsaasDocumentRequest(getRequest(), data.paymentId);
  });
