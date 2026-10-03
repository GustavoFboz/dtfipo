import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

type Company = {
  id: string; name: string; billing_exempt: boolean; subscription_id: string | null;
  status: string | null; plan_code: string | null; provider_environment: string | null;
  current_period_end: string | null; provider_linked: boolean;
};
type Payment = {
  id: string; clinic_id: string; status: string; amount_cents: number;
  currency: string; provider_environment: string; created_at: string; paid_at: string | null;
};
type ReviewEvent = {
  provider_event_id: string; event_type: string; provider_environment: string;
  status: string; attempt_count: number; received_at: string;
};
type MasterSnapshot = {
  companies: Company[]; queue: Record<string, number>;
  recent_payments: Payment[]; review_events: ReviewEvent[]; generated_at: string;
};

export const Route = createFileRoute("/master")({ component: MasterDashboard });

function MasterDashboard() {
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<ReviewEvent | null>(null);
  const queryClient = useQueryClient();
  const snapshot = useQuery({
    queryKey: ["platform-master-dashboard", search],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("platform_master_dashboard", { p_search: search });
      if (error) throw error;
      return data as MasterSnapshot;
    },
    retry: false,
    staleTime: 15_000,
  });
  const replay = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Selecione um evento.");
      const { data, error } = await (supabase as any).rpc("platform_master_replay_asaas_event", {
        p_environment: selected.provider_environment,
        p_event_id: selected.provider_event_id,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      if (data !== true) throw new Error("O evento já não está em revisão.");
    },
    onSuccess: () => {
      setReason(""); setSelected(null);
      void queryClient.invalidateQueries({ queryKey: ["platform-master-dashboard"] });
    },
  });

  return <main className="min-h-screen bg-slate-50 p-5 text-slate-900 dark:bg-[#080b10] dark:text-white">
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-2xl font-semibold">Administração da plataforma</h1>
          <p className="text-sm text-slate-500">Assinaturas e fila Asaas. Acesso exclusivo do operador Master.</p></div>
        <Link to="/hub" className="text-sm text-teal-700">Voltar ao DentalFlow</Link>
      </header>
      {snapshot.isPending && <p>Consultando a plataforma…</p>}
      {snapshot.isError && <section role="alert" className="rounded-xl border p-5">
        Acesso Master indisponível. Entre com um operador de plataforma autorizado e conectado à internet.
      </section>}
      {snapshot.data && <>
        <section className="rounded-xl border bg-white p-5 dark:bg-slate-900">
          <h2 className="font-semibold">Empresas</h2>
          <label className="mt-3 block text-sm">Buscar empresa
            <input className="mt-1 block w-full rounded border bg-transparent p-2" value={search}
              maxLength={80} onChange={(event) => setSearch(event.target.value)} /></label>
          <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm">
            <thead><tr><th>Empresa</th><th>Plano</th><th>Estado</th><th>Vigência</th><th>Ambiente</th></tr></thead>
            <tbody>{snapshot.data.companies.map((company) => <tr key={company.id} className="border-t">
              <td className="py-2">{company.name}{company.billing_exempt ? " · isenta" : ""}</td>
              <td>{company.plan_code ?? "—"}</td><td>{company.status ?? "—"}</td>
              <td>{company.current_period_end ? new Date(company.current_period_end).toLocaleDateString("pt-BR") : "—"}</td>
              <td>{company.provider_environment ?? "—"}</td>
            </tr>)}</tbody>
          </table></div>
        </section>
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border bg-white p-5 dark:bg-slate-900">
            <h2 className="font-semibold">Fila Asaas</h2>
            <ul className="mt-3 space-y-1 text-sm">{Object.entries(snapshot.data.queue).map(([status, count]) =>
              <li key={status}>{status}: {count}</li>)}</ul>
            <h3 className="mt-5 font-medium">Eventos que exigem revisão</h3>
            <ul className="mt-2 space-y-2 text-sm">{snapshot.data.review_events.map((event) =>
              <li key={`${event.provider_environment}:${event.provider_event_id}`} className="border-t pt-2">
                {event.event_type} · {event.status} · {event.provider_environment} · {event.attempt_count} tentativas
                {event.status === "dead_letter" && <button className="ml-2 text-teal-700 underline"
                  onClick={() => setSelected(event)}>Revisar replay</button>}
              </li>)}</ul>
          </div>
          <div className="rounded-xl border bg-white p-5 dark:bg-slate-900">
            <h2 className="font-semibold">Pagamentos recentes</h2>
            <ul className="mt-3 space-y-2 text-sm">{snapshot.data.recent_payments.map((payment) =>
              <li key={payment.id} className="border-t pt-2">{payment.status} · {payment.provider_environment} ·
                {" "}{(payment.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</li>)}</ul>
          </div>
        </section>
        {selected && <section className="rounded-xl border border-amber-400 bg-white p-5 dark:bg-slate-900">
          <h2 className="font-semibold">Reprocessar {selected.provider_event_id}</h2>
          <p className="mt-2 text-sm">Esta ação exige autenticação de dois fatores recente, justificativa e cria registro de auditoria. O worker validará o evento no Asaas antes de alterar qualquer acesso.</p>
          <label className="mt-3 block text-sm">Justificativa
            <textarea className="mt-1 block w-full rounded border bg-transparent p-2" value={reason}
              maxLength={300} onChange={(event) => setReason(event.target.value)} /></label>
          <button disabled={reason.trim().length < 16 || replay.isPending}
            className="mt-3 rounded bg-teal-700 px-4 py-2 text-white disabled:opacity-50"
            onClick={() => replay.mutate()}>Enviar para revisão</button>
          <button className="ml-3 text-sm" onClick={() => { setSelected(null); setReason(""); }}>Cancelar</button>
          {replay.isError && <p role="alert" className="mt-2 text-sm text-red-600">{replay.error.message}</p>}
          {replay.isSuccess && <p role="status">Evento encaminhado ao worker.</p>}
        </section>}
      </>}
    </div>
  </main>;
}
