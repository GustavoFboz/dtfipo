import release from "@/data/saas-master-launch-panel.json";

const numeric = (number: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(number);

const fmtDate = (date: string) =>
  new Date(date + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "UTC" });

function stageState(status: string): string {
  if (status === "done") return "Concluída";
  if (status === "blocked") return "Bloqueada";
  return "Pendente";
}

function taskState(status: string): string {
  if (status === "done") return "Comprovada";
  if (status === "prepared") return "Preparada";
  return "A validar";
}

const statusText = (status: string) =>
  status === "done"
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-slate-600 dark:text-slate-400";

export function MasterSaasProtocolProgress() {
  const pct = release.primary.percent;
  const currentStage = release.stages.find((stage) => stage.status !== "done")?.id;
  const formalOpen = release.other_controls.formal_accepted.total -
    release.other_controls.formal_accepted.completed;
  const stageDone = release.primary.completed === release.primary.total;

  return (
    <section
      aria-label="Painel único do Protocolo SaaS DentalFlow"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
    >
      <div className="px-5 pb-5 pt-6 sm:px-7 sm:pt-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
              DentalFlow / acompanhamento
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
              Protocolo SaaS
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Um só acompanhamento, do desenvolvimento ao lançamento comercial.
            </p>
          </div>
          <div className="min-w-[110px] text-right">
            <strong
              className="block text-4xl font-light tabular-nums tracking-tight sm:text-5xl"
              aria-label={`Progresso até o beta: ${numeric(pct)} por cento`}
            >
              {numeric(pct)}<span className="ml-0.5 text-2xl text-slate-400">%</span>
            </strong>
            <span className="mt-1 block text-xs text-slate-500">
              {release.primary.completed} de {release.primary.total} etapas
            </span>
          </div>
        </div>

        <div
          role="progressbar"
          aria-label="Progresso único do lançamento beta"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        >
          <div
            className="h-full rounded-full bg-teal-600 transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {stageDone && release.primary.release_state === "published"
              ? "Publicação registrada; verificar operação"
              : "Beta não publicado"}
          </span>
          <span className="text-slate-400">Liberação comercial exige aprovação separada</span>
        </div>
      </div>

      <div className="border-t border-slate-100 px-5 py-5 dark:border-slate-800 sm:px-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Próximos avanços</h3>
          <span className="text-xs text-slate-400">Prioridades para concluir</span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {release.next_advances.map((item) => (
            <div
              key={item.stage}
              className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800"
            >
              <div className="mb-2 text-xs font-medium text-slate-400">
                Etapa {item.stage}
              </div>
              <p className="text-sm font-medium leading-snug">{item.title}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {item.action}
              </p>
            </div>
          ))}
          {release.next_advances.length === 0 && (
            <p className="text-sm text-slate-500">Nenhuma próxima etapa identificada; revisão final obrigatória.</p>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 px-5 py-5 dark:border-slate-800 sm:px-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Etapas do lançamento</h3>
          <span className="text-xs text-slate-500">Abra cada etapa para ver as subetapas</span>
        </div>
        <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {release.stages.map((stage) => (
            <details key={stage.id} open={stage.id === currentStage} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-3.5 marker:hidden sm:px-4">
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${
                    stage.status === "done"
                      ? "border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
                      : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                  }`}
                >
                  {stage.status === "done" ? "✓" : stage.id}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium leading-snug">{stage.title}</div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {stage.substeps.filter((task) => task.status === "done").length} de {stage.substeps.length} subetapas comprovadas
                  </div>
                </div>
                <span className={`shrink-0 text-xs ${statusText(stage.status)}`}>
                  {stageState(stage.status)}
                </span>
                <span aria-hidden="true" className="ml-1 shrink-0 text-slate-400 transition-transform group-open:rotate-180">
                  ⌄
                </span>
              </summary>
              <div className="border-t border-slate-100 bg-slate-50/50 px-4 pb-4 pt-3 dark:border-slate-800 dark:bg-slate-900/30 sm:pl-14">
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {stage.brief}
                </p>
                <ul className="mt-3 space-y-2">
                  {stage.substeps.map((task) => (
                    <li key={task.id} className="flex items-start gap-2.5 text-sm">
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          task.status === "done" ? "bg-emerald-500" :
                          task.status === "prepared" ? "bg-slate-400" : "border border-slate-300 dark:border-slate-600"
                        }`}
                      />
                      <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-300">{task.title}</span>
                      <span className={`shrink-0 text-[11px] ${statusText(task.status)}`}>
                        {taskState(task.status)}
                      </span>
                    </li>
                  ))}
                </ul>
                {stage.next_action && (
                  <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Próximo:</span>{" "}
                    {stage.next_action}
                  </p>
                )}
              </div>
            </details>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-100 px-5 py-5 dark:border-slate-800 sm:px-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Protocolo SaaS completo</h3>
          <span className="text-xs text-slate-500">{formalOpen} aceites formais pendentes</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Todas as 23 exigências originais estão aqui, inclusive as que continuarão sendo testadas após o beta.
          Não entram como um segundo percentual.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-900/60">
            <div className="text-xs text-slate-500">Aceites formais</div>
            <div className="mt-1 text-lg font-medium tabular-nums">
              {release.other_controls.formal_accepted.completed}/{release.other_controls.formal_accepted.total}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-900/60">
            <div className="text-xs text-slate-500">Frentes técnicas sem lacuna interna</div>
            <div className="mt-1 text-lg font-medium tabular-nums">
              {release.other_controls.technical_implementation.completed}/{release.other_controls.technical_implementation.total}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-900/60">
            <div className="text-xs text-slate-500">Requisitos para vender</div>
            <div className="mt-1 text-lg font-medium tabular-nums">
              {release.other_controls.p0.completed}/{release.other_controls.p0.total}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-900/60">
            <div className="text-xs text-slate-500">Decisões jurídicas aprovadas</div>
            <div className="mt-1 text-lg font-medium tabular-nums">
              {release.other_controls.legal.completed}/{release.other_controls.legal.total}
            </div>
          </div>
        </div>

        <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {release.protocol_sections.map((group) => (
            <details key={group.group} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 marker:hidden">
                <span className="text-sm font-medium">{group.group}. {group.title}</span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
                  {group.items.filter((item) => item.status === "done").length}/{group.items.length} aceites
                  <span aria-hidden="true" className="transition-transform group-open:rotate-180">⌄</span>
                </span>
              </summary>
              <div className="border-t border-slate-100 px-4 pb-3 pt-1 dark:border-slate-800">
                {group.items.map((criterion) => (
                  <details key={criterion.id} className="group/criterion border-b border-slate-100 py-2 last:border-b-0 dark:border-slate-800">
                    <summary className="flex cursor-pointer list-none items-start gap-2.5 py-1 marker:hidden">
                      <span className="mt-0.5 w-8 shrink-0 text-xs font-medium tabular-nums text-slate-400">
                        {criterion.id}
                      </span>
                      <span className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">
                        {criterion.title}
                      </span>
                      <span className={`shrink-0 text-xs ${statusText(criterion.status)}`}>
                        {criterion.status === "done" ? "Aceito" : criterion.status === "partial" ? "Parcial" : "Pendente"}
                      </span>
                    </summary>
                    {criterion.substeps.length > 0 && (
                      <div className="pb-2 pl-10 pr-1">
                        <p className="mb-2 text-xs text-slate-400">
                          {criterion.completed_checks}/{criterion.total_checks} verificações deste critério
                        </p>
                        <ul className="space-y-1.5">
                          {criterion.substeps.map((task) => (
                            <li key={task.id} className="flex items-start gap-2 text-xs leading-relaxed">
                              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                                task.status === "done" ? "bg-emerald-500" : "border border-slate-400"
                              }`} aria-hidden="true" />
                              <span className="min-w-0 flex-1 text-slate-500 dark:text-slate-400">
                                {task.title}
                              </span>
                              <span className="shrink-0 text-slate-400">
                                {task.status === "done" ? "Feito" : "Falta"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>

      <footer className="border-t border-slate-100 px-5 py-3 text-xs leading-relaxed text-slate-400 dark:border-slate-800 sm:px-7">
        Referência do lançamento: {fmtDate(release.recorded_at)}.
        {" "}Implementação técnica revisada em {fmtDate(release.other_controls.technical_implementation.recorded_at)}.
        {" "}Dados derivados dos registros oficiais no GitHub; novas rodadas precisam atualizar as evidências,
        regenerar o painel e publicar a versão. O painel não executa cobranças nem autoriza vendas.
      </footer>
    </section>
  );
}
