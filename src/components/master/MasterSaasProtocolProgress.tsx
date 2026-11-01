import progress from "@/data/saas-protocol-progress.json";

const pendingDescriptions: Record<string,string> = {
  "2.1": "Ciclo financeiro: atraso, bloqueio, estorno e reativação",
  "2.2": "Preservação dos dados durante os estados de cobrança",
  "2.3": "Offline de 72 horas, suspensão e testes em aparelhos físicos",
  "3.3": "Arquivos e armazenamento reais no Windows e Android",
  "4.2": "Sessões autenticadas e isolamento entre empresas",
  "5.3": "Aplicação futura da troca de plano e recuperação de falhas",
  "6.2": "Backup completo, restauração e conciliação com o Cloud",
  "6.3": "Piloto operacional e testes progressivos de capacidade",
  "6.4": "Revisão jurídica, privacidade e aceite dos documentos",
  "7.4": "Publicação final e autorização para comercialização",
};

export function MasterSaasProtocolProgress() {
  const pct=progress.overall_progress_percent;
  const normalized=Number.isFinite(pct) && pct>=0 && pct<=100 ? pct : 0;
  const number=new Intl.NumberFormat("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(normalized);
  const pending=progress.pending_ids.map(id=>({id,description:pendingDescriptions[id] ?? "Critério pendente de validação"}));
  return <section aria-label="Progresso do Protocolo SaaS" className="rounded-xl border bg-white p-5 dark:bg-slate-900">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold">Protocolo SaaS — implementação</h2>
        <p className="mt-1 text-sm text-slate-500">Progresso geral do protocolo, incluindo marcos parciais comprovados.</p>
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
      {progress.accepted_items} de {progress.total_items} critérios totalmente validados;
      {" "}{progress.remaining_items} em implementação ou homologação.
    </p>
    <p className="mt-2 text-xs text-slate-500">
      Referência: {new Date(progress.recorded_at+"T12:00:00Z").toLocaleDateString("pt-BR",{timeZone:"UTC"})}.
      Atualizado junto com a versão do painel publicada. Chegar a 100% exige todas as homologações.
    </p>
    <details className="mt-4 border-t pt-3">
      <summary className="cursor-pointer text-sm font-medium text-teal-700 dark:text-teal-300">
        Ver critérios que ainda faltam concluir
      </summary>
      <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
        {pending.map(item=><li key={item.id}><span className="font-medium">{item.id}</span> — {item.description}</li>)}
      </ul>
    </details>
  </section>;
}
