import { Capacitor } from "@capacitor/core";
import { isDentalFlowDesktop } from "@/lib/desktop-local";
import { supabase } from "@/integrations/supabase/client";
import { requireMasterSession } from "@/lib/auth/master-session";
import { withDesktopCloudTimeout } from "@/lib/desktop-cloud";
import type { BillingChangeRequest, BillingSessionScope, BillingSessionCheck } from "./billing-change-requests";

export async function executeBillingCancellation(scope: BillingSessionScope, isCurrent: BillingSessionCheck,
  request: BillingChangeRequest, reason: string, reconcileOnly: boolean): Promise<"completed" | "review_required"> {
  if (request.kind !== "cancel" || !["awaiting_provider", "processing", "review_required"].includes(request.status))
    throw new Error("Atualize a solicitação de cancelamento.");
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Conecte-se à internet para conferir o cancelamento.");
  if (reason.trim().length < 16 || reason.trim().length > 300 || /[\u0000-\u001f\u007f]/.test(reason))
    throw new Error("Informe uma justificativa de 16 a 300 caracteres.");
  const controller = new AbortController();
  try {
    return await withDesktopCloudTimeout("cancelamento no Asaas", async () => {
      const session = await requireMasterSession(supabase.auth, scope, isCurrent, controller.signal, true);
      const { data, error } = await supabase.auth.getUser(session.access_token);
      if (error || data.user?.id !== scope.ownerId) throw new Error("Confirme sua sessão online.");
      await requireMasterSession(supabase.auth, scope, isCurrent, controller.signal, true);
      const url = isDentalFlowDesktop() || Capacitor.isNativePlatform()
        ? "https://dtfipo.lovable.app/api/billing/asaas-cancel" : "/api/billing/asaas-cancel";
      const response = await fetch(url, { method: "POST", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.id, environment: request.provider_environment,
          reason: reason.trim(), reconcileOnly: reconcileOnly || request.status !== "awaiting_provider" }), signal: controller.signal });
      const result = await response.json();
      await requireMasterSession(supabase.auth, scope, isCurrent, controller.signal, true);
      if (!response.ok || !result?.ok || result.requestId !== request.id || result.environment !== request.provider_environment
        || !["completed", "review_required"].includes(result.status)) {
        throw new Error("Não foi possível confirmar o resultado. Atualize e confira o cancelamento antes de tentar novamente.");
      }
      return result.status;
    });
  } finally { controller.abort(); }
}
