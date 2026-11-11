import progress from "@/data/saas-protocol-progress.json";
import release from "@/data/saas-master-launch-panel.json";

const pendingDescriptions: Record<string,string> = {
  "2.1": "Ciclo financeiro: atraso, bloqueio, estorno e reativação",
  "2.2": "Preservação dos dados durante os estados de cobrança",
  "2.3": "Offline de 72 horas, suspensão e testes em aparelhos físicos",
  "3.3": "Arquivos e armazenamento reais no Windows e Android",
  "4.2": "Procedência dos 12 registros históricos sem clínica",
  "5.3": "Aplicação futura da troca de plano e recuperação de falhas",
  "6.2": "Recuperação dos 116 arquivos históricos e restauração íntegra",
  "6.3": "Base de medições Web, banco e Realtime no staging",
  "6.4": "Mecanismo de aceite versionado para documentos aprovados",
  "7.4": "Candidato de release versionado e plano de rollback",
};

export function MasterSaasProtocolProgress() {
  const pct=progress.overall_progress_percent;
  const normalized=Number.isFinite(pct) && pct>=0 && pct<=100 ? pct : 0;
  const number=new Intl.NumberFormat("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(normalized);
  const fmt=(value:number)=>new Intl.NumberFormat("pt-BR",{maximumFractionDigits:2}).format(value);
  const pending=progress.remaining_implementation_ids.map(id=>({id,description:pendingDescriptions[id] ?? "Critério pendente de implementação"}));
  const betaPercent=release.beta.total>0 ? release.beta.completed/release.beta.total*100 : 0;
  const acceptancePercent=release.formal_acceptance.total>0
    ? release.formal_acceptance.accepted/release.formal_acceptance.total*100 : 0;
  const notPublished=release.beta.release_state!=="published" ||
    release.release_checks.verified<release.release_checks.total ||
    release.beta.approval_status!=="approved";

  return <section aria-label="Painel consolidado do Protocolo SaaS" className="rounded-xl border bg-white p-5 dark:bg-slate-900">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold">DentalFlow — Protocolo SaaS e lançamento</h2>
        <p className="mt-1 text-sm text-slate-500">
          Lançamento, implementação técnica e aceites têm comprovações diferentes.
        </p>
      </div>
      <strong className="text-3xl font-light tabular-nums tracking-tight"
        aria-label={`Etapas do beta comprovadas: ${release.beta.completed} de ${release.beta.total}`}>
        {release.beta.completed}/{release.beta.total}
      </strong>
    </div>

    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">Etapas até o beta pago por convite</span>
        <span className="tabular-nums">{fmt(betaPercent)}%</span>
      </div>
      <div role="progressbar" aria-label="Etapas comprovadas até lançamento beta"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={betaPercent}
        className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full bg-teal-600 transition-[width]"
          style={{width:`${betaPercent}%`}}/>
      </div>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border p-3">
        <div className="text-xs text-slate-500">Implementação técnica (escopo de 01/11)</div>
        <strong className="mt-1 block text-xl font-light tabular-nums">{number}%</strong>
        <p className="mt-1 text-xs text-slate-500">Não é autorização comercial nem prova em hospedagem real.</p>
      </div>
      <div className="rounded-lg border p-3">
        <div className="text-xs text-slate-500">Aceites formais do protocolo completo</div>
        <strong className="mt-1 block text-xl font-light tabular-nums">
          {release.formal_acceptance.accepted}/{release.formal_acceptance.total}
        </strong>
        <p className="mt-1 text-xs text-slate-500">{fmt(acceptancePercent)}%; são independentes dos aceites do beta.</p>
      </div>
      <div className="rounded-lg border p-3">
        <div className="text-xs text-slate-500">Requisitos obrigatórios para vender</div>
        <strong className="mt-1 block text-xl font-light tabular-nums">
          {release.release_checks.verified}/{release.release_checks.total}
        </strong>
        <p className="mt-1 text-xs text-slate-500">
          {release.legal_decisions.total-release.legal_decisions.verified} decisões jurídicas ainda sem aprovação registrada.
        </p>
      </div>
    </div>

    <p role="status" className="mt-4 text-sm font-medium text-amber-700 dark:text-amber-300">
      {notPublished
        ? "Beta não publicado e liberação comercial ainda bloqueada. A barra não habilita nem desabilita o checkout existente."
        : "As evidências requerem conferência e autorização operacional independente antes de vender."}
    </p>
    <p className="mt-2 text-xs text-slate-500">
      Etapas do lançamento: {new Date(release.recorded_at+"T12:00:00Z").toLocaleDateString("pt-BR",{timeZone:"UTC"})}.
      {" "}Técnico: {new Date(progress.recorded_at+"T12:00:00Z").toLocaleDateString("pt-BR",{timeZone:"UTC"})}.
      {" "}Indicadores de acompanhamento; o status publicado é verificado separadamente.
    </p>

    <details className="mt-4 border-t pt-3">
      <summary className="cursor-pointer text-sm font-medium text-teal-700 dark:text-teal-300">
        O que falta para publicar o beta
      </summary>
      <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
        {release.pending_launch_steps.map(step=>
          <li key={step.id}><span className="font-medium">{step.id}/8</span> — {step.name}</li>)}
      </ul>
    </details>

    <details className="mt-3 border-t pt-3">
      <summary className="cursor-pointer text-sm font-medium text-teal-700 dark:text-teal-300">
        Pendências técnicas do protocolo completo
      </summary>
      <p className="mt-2 text-xs text-slate-500">
        {progress.completed_implementation_criteria}/{progress.total_items} critérios sem lacuna técnica registrada,
        {" "}{progress.remaining_implementation_ids.length} com implementação pendente e
        {" "}{progress.deferred_validation_gates} verificações externas ainda fora da porcentagem técnica.
      </p>
      <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
        {pending.map(item=><li key={item.id}><span className="font-medium">{item.id}</span> — {item.description}</li>)}
      </ul>
    </details>
  </section>;
}
