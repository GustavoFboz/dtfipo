import progress from "@/data/saas-protocol-progress.json";

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
  const pending=progress.remaining_implementation_ids.map(id=>({id,description:pendingDescriptions[id] ?? "Critério pendente de implementação"}));
  return <section aria-label="Progresso do Protocolo SaaS" className="rounded-xl border bg-white p-5 dark:bg-slate-900">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold">Protocolo SaaS — implementação para beta</h2>
        <p className="mt-1 text-sm text-slate-500">Indicador único do código, automatizações e prontidão técnica para os testes beta.</p>
      </div>
      <strong className="text-3xl font-light tabular-nums tracking-tight" aria-label={`Progresso geral: ${number} por cento`}>
        {number}%
      </strong>
    </div>
    <div role="progressbar" aria-label="Implementação do Protocolo SaaS"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={normalized}
      className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div className="h-full rounded-full bg-teal-600 transition-[width]" style={{width:`${normalized}%`}} />
    </div>
    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
      {progress.completed_implementation_criteria} de {progress.total_items} frentes sem bloqueio técnico interno identificado;
      {" "}{progress.remaining_implementation_ids.length} ainda têm trabalho de implementação pendente.
    </p>
    <p className="mt-1 text-xs text-slate-500">
      {progress.deferred_validation_gates} verificações de beta ou aprovações externas estão fora deste cálculo,
      mas continuam pendentes e documentadas. Recalibração do indicador: não representa avanço novo de código.
    </p>
    <p role="status" className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-300">
      {progress.sales_release_status === "blocked"
        ? "Liberação comercial ainda não autorizada pelo protocolo. O checkout atual não é alterado por este aviso."
        : "Revisão final de publicação necessária antes de permitir vendas."}
    </p>
    <p className="mt-2 text-xs text-slate-500">
      Referência: {new Date(progress.recorded_at+"T12:00:00Z").toLocaleDateString("pt-BR",{timeZone:"UTC"})}.
      Atualizado junto com a versão do painel publicada. 100% refere-se apenas à implementação; a liberação beta com dados reais exige suas próprias autorizações.
    </p>
    <details className="mt-4 border-t pt-3">
      <summary className="cursor-pointer text-sm font-medium text-teal-700 dark:text-teal-300">
        Ver implementação técnica ainda pendente
      </summary>
      <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
        {pending.map(item=><li key={item.id}><span className="font-medium">{item.id}</span> — {item.description}</li>)}
      </ul>
    </details>
  </section>;
}
