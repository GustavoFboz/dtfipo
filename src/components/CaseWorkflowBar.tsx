import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  fetchWorkflowSettings,
  fetchWorkflowStages,
  fetchReturnReasons,
  fetchStageAssignees,
  advanceCaseWorkflow,
  returnCaseWorkflow,
  createReturnReason,
} from "@/lib/workflow";
import { fetchProfile, sendInternalNotification } from "@/lib/api";
import type { CaseRow } from "@/lib/types";
import { broadcastCaseWorkflowPatch } from "@/hooks/use-cases-realtime";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { useBlockedActionDialog } from "@/components/BlockedActionDialog";
import { promptDialog } from "@/lib/confirm";
import { useStageRequirements } from "@/lib/stage-requirements";

export function CaseWorkflowBar({ caseRow }: { caseRow: CaseRow }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const blocked = useBlockedActionDialog();
  const stageReqs = useStageRequirements(caseRow);

  const settings = useQuery({ queryKey: ["workflow_settings"], queryFn: fetchWorkflowSettings });
  const stages = useQuery({
    queryKey: ["workflow_stages"],
    queryFn: fetchWorkflowStages,
    enabled: !!settings.data?.phases_enabled,
  });
  const reasons = useQuery({
    queryKey: ["return_reasons"],
    queryFn: fetchReturnReasons,
    enabled: !!settings.data?.phases_enabled,
  });
  const profile = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });

  const currentStageId = (caseRow as any).current_stage_id as string | null;
  const list = useMemo(() => {
    const source = stages.data ?? [];
    return source.filter((stage: any) => {
      const condition = stage.condition_key as string | null | undefined;
      if (condition === "mockup") return !!(caseRow as any).has_mockup;
      if (condition === "provisional") return !!(caseRow as any).has_provisional;
      return true;
    });
  }, [stages.data, (caseRow as any).has_mockup, (caseRow as any).has_provisional]);
  const currentIdx = useMemo(() => list.findIndex((s) => s.id === currentStageId), [list, currentStageId]);
  const currentStage = currentIdx >= 0 ? list[currentIdx] : null;

  const assignees = useQuery({
    queryKey: ["stage_assignees", currentStageId],
    queryFn: () => fetchStageAssignees(currentStageId as string),
    enabled: !!currentStageId,
  });

  const role = String(profile.data?.role || "").toUpperCase();
  const subtype = String((profile.data as any)?.account_subtype || "").toUpperCase();
  const effectiveType = subtype || role;
  const isAdmin = ["CEO", "ADMIN", "PROTETICO"].includes(effectiveType) || !!(profile.data as any)?.is_default_admin;
  const myUid = profile.data?.id;
  const stageAssignees = assignees.data ?? [];
  const hasAssignees = stageAssignees.length > 0;
  const isResponsible = !!myUid && stageAssignees.some((a) => a.user_id === myUid);

  const canAdvance = currentIdx >= 0 && currentIdx < list.length - 1 && (!hasAssignees || isResponsible);
  const canReturn = currentIdx > 0 && isAdmin;

  if (!settings.data?.phases_enabled || !settings.data?.progress_bar_enabled) return null;
  if (!list.length) return null;

  function assignedUsersForStage(stageId: string): string[] | undefined {
    const assignments = qc.getQueryData<{ stage_id: string; user_id: string }[]>(["stage_assignments_all"]);
    if (!Array.isArray(assignments)) return undefined;
    return (assignments ?? []).filter((row) => row.stage_id === stageId).map((row) => row.user_id);
  }

  function patchCase(nextStageId: string | null, nextPhaseId: string | null) {
    const nextStage = nextStageId ? list.find((stage) => stage.id === nextStageId) : null;
    const currentStage = nextStage ? { ...nextStage, color: nextStage.color ?? "#94a3b8" } : null;
    qc.setQueriesData<any[]>({ queryKey: ["cases"] }, (old) => {
      if (!Array.isArray(old)) return old;
      return old.map((c) =>
        c?.id === caseRow.id
          ? { ...c, current_stage_id: nextStageId, current_phase_id: nextPhaseId ?? c.current_phase_id, current_stage: currentStage }
          : c,
      );
    });
    qc.setQueryData(["case", caseRow.id], (old: any) =>
      old ? { ...old, current_stage_id: nextStageId, current_phase_id: nextPhaseId ?? old.current_phase_id, current_stage: currentStage } : old,
    );
  }

  function handleAdvance() {
    if (busy || !canAdvance) return;
    if (stageReqs.isLoading) {
      blocked.show("Validando exigências", "Aguarde a verificação das exigências desta etapa antes de avançar.");
      return;
    }
    const blockMsg = stageReqs.advanceBlockedMessage();
    if (blockMsg) {
      blocked.show("Exigências pendentes", blockMsg);
      return;
    }
    const nextStage = list[currentIdx + 1];
    if (!nextStage) return;
    const nextPhaseId = (nextStage as any).phase_id ?? (caseRow as any).current_phase_id ?? null;
    setBusy(true);
    advanceCaseWorkflow(caseRow.id, nextStage.id)
      .then((res: any) => {
        const stageId = res?.stage_id ?? nextStage.id;
        const phaseId = res?.phase_id ?? nextPhaseId;
        patchCase(stageId, phaseId);
        broadcastCaseWorkflowPatch({
          ...caseRow,
          current_stage_id: stageId,
          current_phase_id: phaseId,
          current_stage: { ...nextStage, color: nextStage.color ?? "#94a3b8" },
          assigned_user_ids: assignedUsersForStage(stageId),
          workflow_only: true,
        });
        const nextAssignees = assignedUsersForStage(stageId) ?? [];
        const requesterId = (caseRow as any).requested_by as string | null | undefined;
        if (requesterId && nextAssignees.includes(requesterId)) {
          void sendInternalNotification(
            requesterId,
            "Etapa atribuída a você",
            `O caso entrou na etapa “${nextStage.name}”, que está sob sua responsabilidade.`,
            "stage_assigned",
          ).catch(() => undefined);
        }
      })
      .catch((e) => {
        blocked.show("Não é possível avançar", (e as Error).message);
      })
      .finally(() => setBusy(false));
  }

  function handleReturn(reasonId: string, toStageId: string) {
    if (busy || !canReturn) return;
    const target = list.find((s) => s.id === toStageId);
    if (!target) return;
    const targetPhaseId = (target as any).phase_id ?? (caseRow as any).current_phase_id ?? null;
    setBusy(true);
    returnCaseWorkflow(caseRow.id, reasonId, { toStageId })
      .then((res: any) => {
        const stageId = res?.stage_id ?? target.id;
        const phaseId = res?.phase_id ?? targetPhaseId;
        patchCase(stageId, phaseId);
        broadcastCaseWorkflowPatch({
          ...caseRow,
          current_stage_id: stageId,
          current_phase_id: phaseId,
          current_stage: { ...target, color: target.color ?? "#94a3b8" },
          assigned_user_ids: assignedUsersForStage(stageId),
          workflow_only: true,
        });
        void qc.invalidateQueries({ queryKey: ["case_activity", caseRow.id] });
        void qc.invalidateQueries({ queryKey: ["cases"] });
        toast.success(`Caso retornado para ${target.name}`);
      })
      .catch((e) => {
        blocked.show("Não é possível retornar", (e as Error).message);
      })
      .finally(() => setBusy(false));
  }


  async function handleNewReason(toStageId: string) {
    const label = (await promptDialog({ title: "Nova justificativa de retorno", placeholder: "Descreva a justificativa", required: true }))?.trim();
    if (!label) return;
    try {
      const id = await createReturnReason(label);
      await qc.invalidateQueries({ queryKey: ["return_reasons"] });
      await handleReturn(id, toStageId);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const color = currentStage?.color ?? "#1F8AFF";
  const progress = list.length > 0 && currentIdx >= 0 ? ((currentIdx + 1) / list.length) * 100 : 0;
  const reasonList = reasons.data ?? [];
  const priorStages = currentIdx > 0 ? list.slice(0, currentIdx) : [];

  return (
    <div className="flex items-center gap-2 py-1.5 px-1 text-xs">
      <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto scrollbar-none">
        {list.map((s, i) => {
          const isCurrent = i === currentIdx;
          const distance = currentIdx < 0 ? 99 : Math.abs(i - currentIdx);
          const opacity = isCurrent ? 1 : distance === 1 ? 0.55 : distance === 2 ? 0.3 : 0.18;
          return (
            <div key={s.id} className="flex items-center shrink-0">
              {isCurrent ? (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white font-semibold text-[11px] tracking-tight whitespace-nowrap shadow-sm"
                  style={{ backgroundColor: color }}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
                  {s.name}
                </span>
              ) : (
                <span
                  className="text-[11px] font-medium text-foreground/70 whitespace-nowrap transition-opacity"
                  style={{ opacity }}
                >
                  {s.name}
                </span>
              )}
              {i < list.length - 1 && (
                <ChevronRight
                  className="h-3 w-3 mx-0.5 text-muted-foreground/40 shrink-0"
                  style={{ opacity: distance <= 1 ? 0.7 : 0.25 }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="hidden sm:block w-20 h-1 rounded-full bg-border/60 overflow-hidden shrink-0">
        <div className="h-full transition-all" style={{ width: `${progress}%`, backgroundColor: color }} />
      </div>

      {canReturn && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={busy}
              className="shrink-0 inline-flex items-center gap-1 pl-1.5 pr-2 py-1 rounded-full text-[11px] font-medium bg-background border border-border hover:bg-accent transition disabled:opacity-40"
              title="Voltar para etapa anterior"
            >
              <ArrowLeft className="h-3 w-3" />
              Voltar para etapa
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Selecione a etapa
            </DropdownMenuLabel>
            {priorStages.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Sem etapas anteriores</div>
            ) : (
              priorStages.map((st) => (
                <DropdownMenuSub key={st.id}>
                  <DropdownMenuSubTrigger className="text-sm">{st.name}</DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-52">
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Justificativa
                      </DropdownMenuLabel>
                      {reasonList.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma</div>
                      ) : (
                        reasonList.map((r) => (
                          <DropdownMenuItem
                            key={r.id}
                            onSelect={() => handleReturn(r.id, st.id)}
                            className="text-sm"
                          >
                            {r.label}
                          </DropdownMenuItem>
                        ))
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => handleNewReason(st.id)}
                        className="text-sm gap-2 text-muted-foreground"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Nova justificativa…
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {canAdvance && (
        <button
          type="button"
          onClick={handleAdvance}
          disabled={busy || stageReqs.isLoading}
          className="shrink-0 inline-flex items-center gap-1 pl-2.5 pr-2 py-1 rounded-full text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
        >
          {busy || stageReqs.isLoading ? "…" : "Próxima etapa"}
          <ArrowRight className="h-3 w-3" />
        </button>
      )}
      {blocked.dialogElement}
    </div>
  );
}
