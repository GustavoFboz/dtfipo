import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MasterCancelRequest } from "./MasterCancelRequest";
import { fetchMasterBillingChangeRequests, friendlyBillingChangeError, masterBillingRequestsKey,
  type BillingSessionScope, type BillingSessionCheck, type MasterBillingChangeRequest } from "@/lib/billing-change-requests";
import { formatPlanPrice } from "@/lib/subscriptions";

export function MasterBillingRequests({ scope, isCurrent, search }: {
  scope: BillingSessionScope; isCurrent: BillingSessionCheck; search: string;
}) {
  const [selected, setSelected] = useState<MasterBillingChangeRequest | null>(null);
  const [result, setResult] = useState("");
  useEffect(() => { setSelected(null); setResult(""); }, [scope.ownerId, scope.sessionId, scope.generation]);
  const requests = useQuery({ queryKey: masterBillingRequestsKey(scope, search),
    queryFn: ({ signal }) => fetchMasterBillingChangeRequests(scope, isCurrent, search, signal),
    enabled: isCurrent(scope), retry: false, staleTime: 15_000, gcTime: 0 });
  return <section className="rounded-xl border bg-white p-5 dark:bg-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Solicitações de assinatura</h2>
      <button type="button" disabled={requests.isFetching} onClick={() => { void requests.refetch(); }} className="text-sm text-teal-700 disabled:opacity-50">Atualizar solicitações</button>
    </div>
    <p className="mt-2 text-sm text-slate-500">Cancelamentos exigem revisão e autenticador. O período pago e as cobranças já emitidas são preservados. Trocas de plano aguardam a implementação do preço por vigência.</p>
    {result && <p role="status" className="mt-2 text-sm">{result}</p>}
    {requests.isPending && <p role="status" className="mt-3 text-sm">Consultando solicitações…</p>}
    {requests.isError && <p role="alert" className="mt-3 text-sm">{friendlyBillingChangeError(requests.error)}</p>}
    {isCurrent(scope) && !requests.isError && requests.data && <ul className="mt-3 space-y-3 text-sm">
      {requests.data.length === 0 && <li>Nenhuma solicitação pendente.</li>}
      {requests.data.map((r) => <li key={r.id} className="rounded-lg border p-3">
        <p className="font-medium">{r.clinic_name} · {r.kind === "cancel" ? "Cancelamento" : `Troca para ${r.target_plan_name}`}</p>
        <p className="mt-1 text-xs">{r.provider_environment === "sandbox" ? "Teste" : "Produção"} · Contrato: {formatPlanPrice(r.current_amount_cents, "BRL")}/mês{r.target_amount_cents !== null ? ` · Novo preço: ${formatPlanPrice(r.target_amount_cents, "BRL")}/mês` : ""}</p>
        <p className="mt-1 text-xs text-slate-500">Solicitada em {new Date(r.created_at).toLocaleDateString("pt-BR")} · Vigência pretendida a partir de {new Date(r.effective_not_before).toLocaleDateString("pt-BR")}</p>
        <p className="mt-1 text-xs text-slate-500">{r.status === "processing" ? "Conferência em andamento" : r.status === "review_required" ? "Resultado precisa de revisão" : "Aguardando revisão"}</p>
        {r.kind === "cancel" && <button type="button" onClick={() => { if (isCurrent(scope)) { setResult(""); setSelected(r); } }}
          className="mt-2 text-xs text-teal-700 underline">{r.status === "awaiting_provider" ? "Revisar cancelamento" : "Conferir cancelamento"}</button>}
        {selected?.id === r.id && <MasterCancelRequest key={`${scope.generation}:${scope.sessionId}:${r.id}`}
          request={selected} scope={scope} isCurrent={isCurrent} onClose={() => setSelected(null)} onCompleted={(status) => {
            if (!isCurrent(scope)) return;
            setResult(status === "completed" ? "Renovação encerrada no Asaas; período pago preservado."
              : "Resultado ainda não confirmado. O pedido permanece em revisão.");
            setSelected(null); void requests.refetch();
          }} />}
      </li>)}
      {requests.data.length === 50 && <li className="text-xs text-slate-500">Exibindo as 50 solicitações mais antigas. Use a busca por empresa.</li>}
    </ul>}
  </section>;
}
