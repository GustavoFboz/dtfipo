import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { confirm } from "@/lib/confirm";
import { useBillingSession } from "@/hooks/use-billing-session";
import { formatPlanPrice, formatStorage } from "@/lib/subscriptions";
import {
  billingChangeContextKey, fetchBillingChangeContext, friendlyBillingChangeError,
  submitBillingChangeRequest, withdrawBillingChangeRequest,
  type BillingChangeQuote, type BillingChangeRequest, type BillingSessionCheck, type BillingSessionScope,
} from "@/lib/billing-change-requests";

const date = (value: string) => new Date(value).toLocaleDateString("pt-BR");
const blockLabels = { paid_period_required: "A troca exige um período pago vigente.",
  storage_limit: "O armazenamento e os envios pendentes excedem este plano.",
  member_limit: "A equipe excede o limite deste plano.", session_limit: "Os ambientes ativos excedem o limite deste plano." };

export function BillingChangeRequestsPanel({ clinicId }: { clinicId: string }) {
  const { ready, scope, isCurrent } = useBillingSession();
  if (!ready) return <p className="mt-6 text-sm">Verificando a sessão de cobrança…</p>;
  if (!scope) return <p role="alert" className="mt-6 text-sm">Entre com uma sessão online válida para gerenciar a assinatura.</p>;
  return <BillingChangeRequests key={`${scope.generation}:${clinicId}`} clinicId={clinicId} scope={scope} isCurrent={isCurrent} />;
}

export function BillingChangeRequests({ clinicId, scope, isCurrent }: {
  clinicId: string; scope: BillingSessionScope; isCurrent: BillingSessionCheck;
}) {
  const qc = useQueryClient();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const active = () => mounted.current && isCurrent(scope);
  const [selectedCode, setSelectedCode] = useState("");
  const [confirming, setConfirming] = useState(false);
  const queryKey = billingChangeContextKey(scope, clinicId);
  const context = useQuery({ queryKey, queryFn: ({ signal }) => fetchBillingChangeContext(scope, isCurrent, clinicId, signal),
    enabled: isCurrent(scope), retry: false, staleTime: 15_000, gcTime: 0 });
  const submit = useMutation({
    mutationFn: (quote: BillingChangeQuote) => submitBillingChangeRequest(scope, isCurrent, clinicId, quote),
    onSuccess: () => { if (active()) { setSelectedCode(""); toast.success("Solicitação registrada. Aguardando confirmação no Asaas."); } },
    onError: (error) => { if (active()) toast.error(friendlyBillingChangeError(error)); },
    onSettled: () => { if (active()) void qc.invalidateQueries({ queryKey }); },
  });
  const withdraw = useMutation({
    mutationFn: (request: BillingChangeRequest) => withdrawBillingChangeRequest(scope, isCurrent, clinicId, request),
    onSuccess: () => { if (active()) toast.success("Solicitação retirada. Seu contrato continua vigente."); },
    onError: (error) => { if (active()) toast.error(friendlyBillingChangeError(error)); },
    onSettled: () => { if (active()) void qc.invalidateQueries({ queryKey }); },
  });
  const busy = confirming || submit.isPending || withdraw.isPending || context.isFetching;
  const data = isCurrent(scope) ? context.data : undefined;
  const pending = data?.requests.find((r) => r.status === "awaiting_provider");
  const selected = data?.plan_quotes.find((q) => q.target_plan_code === selectedCode);
  async function requestChange(quote: BillingChangeQuote) {
    if (busy || !active()) return;
    setConfirming(true);
    try {
      const accepted = await confirm({ title: quote.kind === "cancel" ? "Solicitar cancelamento" : "Solicitar troca de plano",
        description: `${quote.kind === "cancel" ? "Encerrar a renovação" : `Trocar para ${quote.target_plan_name} por ${formatPlanPrice(quote.target_amount_cents!, quote.currency)}/mês`}${quote.paid_period_end && Date.parse(quote.paid_period_end) > Date.now() ? ` após o período pago, em ${date(quote.paid_period_end)}` : ""}. A solicitação ficará aguardando confirmação no Asaas. O contrato atual permanece vigente até a conclusão.`,
        confirmText: "Registrar solicitação" });
      if (accepted && active()) submit.mutate(quote);
    } finally { if (active()) setConfirming(false); }
  }
  async function withdrawRequest(request: BillingChangeRequest) {
    if (busy || !active()) return;
    setConfirming(true);
    try {
      const accepted = await confirm({ title: "Retirar solicitação", description: "Retirar esta solicitação que ainda aguarda confirmação. Seu contrato atual continuará vigente.", confirmText: "Retirar solicitação" });
      if (accepted && active()) withdraw.mutate(request);
    } finally { if (active()) setConfirming(false); }
  }
  return <section aria-label="Gerenciar assinatura" className="mt-8 border-t pt-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-medium">Gerenciar assinatura</h2>
      <button type="button" disabled={busy} onClick={() => { void context.refetch(); }} className="text-sm text-[#15988f] disabled:opacity-50">Atualizar solicitações</button>
    </div>
    <p className="mt-2 text-xs leading-6 text-slate-500">Cancelamento e troca de plano preservam o período pago. Cada solicitação precisa de confirmação no Asaas para ser concluída.</p>
    {context.isPending && <p role="status" className="mt-3 text-sm">Consultando opções…</p>}
    {context.isError && <p role="alert" className="mt-3 text-sm text-amber-700">{friendlyBillingChangeError(context.error)}</p>}
    {data && !context.isError && <>
      {pending ? <p role="status" className="mt-4 rounded-xl border border-amber-300 p-3 text-sm">Há uma solicitação aguardando confirmação no Asaas. Acompanhe abaixo ou retire-a antes de registrar outra.</p>
        : data.cancellation_quote ? <div className="mt-4 space-y-4">
          <p className="text-sm">Contrato atual: {data.cancellation_quote.current_plan_name} · {formatPlanPrice(data.cancellation_quote.current_amount_cents, "BRL")}/mês</p>
          <label className="block text-sm">Novo plano
            <select className="mt-2 block w-full rounded-xl border bg-transparent p-3" value={selectedCode} disabled={busy} onChange={(e) => setSelectedCode(e.target.value)}>
              <option value="">Escolha um plano</option>
              {data.plan_quotes.map((q) => <option key={q.target_plan_code} value={q.target_plan_code!}>{q.target_plan_name} · {formatPlanPrice(q.target_amount_cents!, "BRL")}/mês</option>)}
            </select>
          </label>
          {selected && <div className="text-xs leading-6 text-slate-500">
            <p>Até {selected.target_max_members} membros · {selected.target_max_sessions} ambientes · {formatStorage(selected.target_storage_bytes!)} disponíveis</p>
            {selected.block_reason && <p role="alert" className="text-amber-700">{blockLabels[selected.block_reason]}</p>}
            <p>A vigência pretendida começa após o período pago{selected.paid_period_end ? `, em ${date(selected.paid_period_end)}` : ""}. O novo preço será conferido antes da conclusão.</p>
          </div>}
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy || !selected || !!selected.block_reason} onClick={() => { if (selected) void requestChange(selected); }} className="rounded-xl bg-[#15988f] px-4 py-2 text-sm text-white disabled:opacity-50">Solicitar troca de plano</button>
            <button type="button" disabled={busy} onClick={() => { void requestChange(data.cancellation_quote!); }} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50">Solicitar cancelamento</button>
          </div>
        </div> : <p className="mt-4 text-sm text-slate-500">Uma assinatura Asaas vinculada é necessária para solicitar alterações. A troca de plano também exige um período pago vigente.</p>}
      <ul className="mt-5 space-y-3 text-sm">
        {data.requests.map((request) => <li key={request.id} className="rounded-xl border p-3">
          <p className="font-medium">{request.kind === "cancel" ? "Cancelamento solicitado" : `Troca para ${request.target_plan_name} · ${formatPlanPrice(request.target_amount_cents!, "BRL")}/mês`}</p>
          <p className="mt-1 text-xs text-slate-500">{request.status === "awaiting_provider" ? "Aguardando confirmação no Asaas" : "Solicitação retirada"} · {date(request.created_at)} · {request.provider_environment === "sandbox" ? "Teste" : "Produção"}</p>
          <p className="mt-1 text-xs text-slate-500">Vigência pretendida a partir de {date(request.effective_not_before)}</p>
          {request.status === "awaiting_provider" && <button type="button" disabled={busy} onClick={() => { void withdrawRequest(request); }} className="mt-2 text-xs text-[#15988f] underline disabled:opacity-50">Retirar solicitação</button>}
        </li>)}
      </ul>
    </>}
  </section>;
}
