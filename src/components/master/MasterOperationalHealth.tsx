import { useQuery } from "@tanstack/react-query";
import { fetchMasterOperationalHealth, friendlyOperationalHealthError, masterOperationalHealthKey,
  operationalAlerts } from "@/lib/master-operational-health";
import type { MasterSessionCheck, MasterSessionScope } from "@/lib/auth/master-session";

export function MasterOperationalHealth({ scope, isCurrent }: { scope: MasterSessionScope; isCurrent: MasterSessionCheck }) {
  const health = useQuery({ queryKey: masterOperationalHealthKey(scope),
    queryFn: ({ signal }) => fetchMasterOperationalHealth(scope, isCurrent, signal),
    enabled: isCurrent(scope), retry: false, staleTime: 15_000, gcTime: 0, refetchOnWindowFocus: false });
  const data = isCurrent(scope) && !health.isError ? health.data : undefined;
  return <section className="rounded-xl border bg-white p-5 dark:bg-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Acompanhamento operacional</h2>
      <button type="button" disabled={health.isFetching} className="text-sm text-teal-700 disabled:opacity-50"
        onClick={() => { void health.refetch(); }}>Atualizar indicadores</button></div>
    <p className="mt-2 text-sm text-slate-500">Conferência interna da fila e das execuções. O aceite financeiro e a conciliação com o Asaas continuam pendentes.</p>
    {health.isPending && <p role="status" className="mt-3 text-sm">Consultando indicadores…</p>}
    {health.isError && <p role="alert" className="mt-3 text-sm">{friendlyOperationalHealthError()}</p>}
    {data && <>
      <p className="mt-3 text-xs text-slate-500">Consulta em {new Date(data.generated_at).toLocaleString("pt-BR")}. Atualize para conferir novamente.</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">{data.environments.map((e) => {
        const alerts = operationalAlerts(e, data.generated_at);
        return <div key={e.environment} className="rounded-lg border p-3 text-sm">
          <h3 className="font-medium">{e.environment === "sandbox" ? "Sandbox — teste" : "Produção"}</h3>
          <p className="mt-1">Última execução concluída sem erros: {e.worker?.last_healthy_at ? new Date(e.worker.last_healthy_at).toLocaleString("pt-BR") : "sem registro"}</p>
          <p className="mt-2">Fila: {e.queue.waiting} aguardando · {e.queue.processing} em processamento · {e.queue.dead_letter} em revisão manual</p>
          <p className="mt-1">Cobranças incertas: {e.checkout.uncertain} · Falhas de criação em 24h: {e.checkout.failed_24h}</p>
          <ul className="mt-3 space-y-2 text-amber-800 dark:text-amber-300">{alerts.map((alert) => <li key={alert}>{alert}</li>)}</ul>
          {alerts.length === 0 && <p className="mt-3 text-slate-500">Nenhum sinal de atenção nesta consulta. A liberação financeira mantém suas etapas de aceite.</p>}
        </div>;
      })}</div>
      <p className="mt-4 text-sm">Armazenamento: {data.storage.reserved} envio(s) reservado(s), {(data.storage.reserved_bytes/1024/1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MiB.
        {data.storage.reserved_over_24h > 0 && ` ${data.storage.reserved_over_24h} reserva(s) há mais de 24 horas: revise individualmente em Armazenamento.`}</p>
      <p className="mt-2 text-xs text-slate-500">Uma tentativa de reconciliação registrada não comprova a conclusão da conciliação. Reservas antigas podem pertencer a envios em andamento.</p>
    </>}
  </section>;
}
