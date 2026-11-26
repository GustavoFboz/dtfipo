import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MasterMfaChallenge } from "./MasterMfaChallenge";
import { executeBillingPlanChange } from "@/lib/billing-plan-change";
import type { MasterBillingChangeRequest, BillingSessionScope, BillingSessionCheck } from "@/lib/billing-change-requests";

export function MasterPlanChangeRequest({ request, scope, isCurrent, onClose, onCompleted }: {
  request: MasterBillingChangeRequest; scope: BillingSessionScope; isCurrent: BillingSessionCheck;
  onClose: () => void; onCompleted: (status: "completed" | "review_required") => void;
}) {
  const [verified, setVerified] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const reconcileOnly = request.status !== "awaiting_provider";
  const action = useMutation({ retry: false, mutationFn: () => {
    if (!verified || !confirmed) throw new Error("Confirme sua identidade e a revisão do pedido.");
    return executeBillingPlanChange(scope, isCurrent, request, reason, reconcileOnly);
  }, onSuccess: (status) => { if (isCurrent(scope)) onCompleted(status); } });
  return <section aria-label="Revisar troca de plano" className="mt-3 rounded-lg border border-amber-400 p-4">
    <h3 className="font-medium">{reconcileOnly ? "Conferir troca de plano" : "Programar troca de plano"}: {request.clinic_name}</h3>
    <p className="mt-2 text-sm">{reconcileOnly ? "Esta conferência consulta o Asaas. Nenhuma nova tentativa de troca de plano será enviada."
      : "Confirme o pedido do responsável para programar o novo preço no Asaas."} O período já pago, os dados e as cobranças existentes permanecem preservados.</p>
    <p className="mt-2 text-sm">Novo plano: {request.target_plan_name}. Preço: {request.target_amount_cents ? (request.target_amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}/mês. Início: {request.effective_not_before.slice(0, 10)} (UTC), após o período pago. Cobranças futuras incompatíveis exigem revisão.</p>
    {!verified && <MasterMfaChallenge scope={scope} isCurrent={isCurrent}
      onVerified={() => { if (isCurrent(scope)) setVerified(true); }} />}
    <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={action.isPending}
      onChange={(event) => setConfirmed(event.target.checked)} />Conferi o novo plano, a vigência e a preservação das cobranças já emitidas.</label>
    <label className="mt-3 block text-sm">Justificativa
      <input value={reason} maxLength={300} disabled={action.isPending} onChange={(event) => setReason(event.target.value)}
        className="mt-1 block w-full rounded border bg-transparent p-2" /></label>
    <button type="button" disabled={!verified || !confirmed || reason.trim().length < 16 || action.isPending || action.isError}
      onClick={() => action.mutate()} className="mt-3 rounded bg-teal-700 px-4 py-2 text-white disabled:opacity-50">
      {action.isPending ? "Conferindo…" : reconcileOnly ? "Conferir no Asaas" : "Confirmar troca de plano"}</button>
    <button type="button" disabled={action.isPending} onClick={onClose} className="ml-3 text-sm">Voltar</button>
    {action.isError && <p role="alert" className="mt-2 text-sm text-red-600">{action.error.message}</p>}
    {action.data === "completed" && <p role="status" className="mt-2 text-sm">Troca programada. O novo plano só entra em vigor no período pago correspondente.</p>}
    {action.data === "review_required" && <p role="status" className="mt-2 text-sm">Resultado ainda não confirmado. O pedido permanece em revisão, sem nova tentativa automática.</p>}
  </section>;
}
