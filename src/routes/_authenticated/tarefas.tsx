import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks, Calendar, ArrowRight, Clock } from "lucide-react";
import { fetchMyTasks, advanceCaseWorkflow, fetchWorkflowStages } from "@/lib/workflow";
import { CaseDetailDialog } from "@/components/CaseDetailDialog";
import { toast } from "sonner";
import type { CaseRow } from "@/lib/types";
import { applyCasePatchToCache, broadcastCaseWorkflowPatch } from "@/hooks/use-cases-realtime";
import { useBlockedActionDialog } from "@/components/BlockedActionDialog";

export const Route = createFileRoute("/_authenticated/tarefas")({
  component: TarefasPage,
});

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d + (d.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("pt-BR");
}

function TarefasPage() {
  const qc = useQueryClient();
  const tasks = useQuery({ queryKey: ["my_tasks"], queryFn: fetchMyTasks, refetchInterval: 15000 });
  const stages = useQuery({ queryKey: ["workflow_stages"], queryFn: fetchWorkflowStages });
  const [openCase, setOpenCase] = useState<CaseRow | null>(null);
  const blocked = useBlockedActionDialog();

  function assignedUsersForStage(stageId: string): string[] | undefined {
    const assignments = qc.getQueryData<{ stage_id: string; user_id: string }[]>(["stage_assignments_all"]);
    if (!Array.isArray(assignments)) return undefined;
    return (assignments ?? []).filter((row) => row.stage_id === stageId).map((row) => row.user_id);
  }

  async function advance(c: CaseRow) {
    const list = stages.data ?? [];
    const currentIdx = list.findIndex((stage) => stage.id === c.current_stage_id);
    const nextStage = currentIdx >= 0 ? list[currentIdx + 1] : list[0];
    try {
      const r: any = await advanceCaseWorkflow(c.id, null);
      if (r?.success === false) throw new Error(r.error);
      // Only after server confirms: remove from tasks + broadcast patch
      qc.setQueryData<CaseRow[]>(["my_tasks"], (old) => (old ?? []).filter((row) => row.id !== c.id));
      const stageId = r?.stage_id ?? nextStage?.id ?? null;
      const phaseId = r?.phase_id ?? nextStage?.phase_id ?? null;
      const patch = {
        ...c,
        current_stage_id: stageId,
        current_phase_id: phaseId,
        current_stage: nextStage ? { ...nextStage, color: nextStage.color ?? "#94a3b8" } : null,
        assigned_user_ids: nextStage && stageId ? assignedUsersForStage(stageId) : undefined,
        workflow_only: true,
      };
      applyCasePatchToCache(qc, patch);
      broadcastCaseWorkflowPatch(patch);
    } catch (e) {
      blocked.show("Não é possível avançar", (e as Error).message);
    }
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-primary/5 dark:bg-primary/10 grid place-items-center border border-primary/10">
          <ListChecks className="h-5 w-5 text-primary stroke-[1.2px]" />
        </div>
        <div>
          <h1 className="text-2xl font-light tracking-tight">Minhas Tarefas</h1>
          <p className="text-xs text-muted-foreground">Casos em fases ou etapas atribuídas a você</p>
        </div>
      </div>

      {tasks.isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : (tasks.data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Nenhuma tarefa atribuída no momento.
        </div>
      ) : (
        <ul className="space-y-2">
          {(tasks.data ?? []).map((c) => {
            const overdue =
              !c.finished_at && new Date(c.delivery_date + "T23:59:59").getTime() < Date.now();
            return (
              <li
                key={c.id}
                className="group rounded-2xl border border-border bg-card hover:border-primary/30 transition p-4 flex items-center gap-4"
              >
                <button
                  type="button"
                  onClick={() => setOpenCase(c)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="text-sm font-medium truncate">{c.patient?.name ?? "Paciente"}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {c.current_stage?.name && (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: c.current_stage.color ?? "#94a3b8" }}
                        />
                        {c.current_stage.name}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Entrega: <span className={overdue ? "text-destructive font-medium" : ""}>{fmt(c.delivery_date)}</span>
                      {overdue && <Clock className="h-3 w-3 text-destructive ml-0.5" />}
                    </span>
                    {c.cadista?.name && <span>Cadista: {c.cadista.name}</span>}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => advance(c)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition shrink-0"
                >
                  Avançar <ArrowRight className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <CaseDetailDialog caseRow={openCase} open={!!openCase} onOpenChange={(o) => !o && setOpenCase(null)} />
      {blocked.dialogElement}
    </div>
  );
}
