import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  fetchWorkflowSettings,
  fetchReturnReasons,
  fetchStageAssignees,
  advanceCaseWorkflow,
  returnCaseWorkflow,
  createReturnReason,
} from "@/lib/workflow";
import { fetchProfile, sendInternalNotification } from "@/lib/api";
import {
  deriveWorkflowKey,
  fetchCaseRequiresSintering,
  fetchWorkflowStagesV2,
  FLOW_LABELS,
  type WorkflowKey,
} from "@/lib/workflow-v2";
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

const WORKFLOW_KEYS = new Set<WorkflowKey>(["common", "provisional", "mockup", "mockup_provisional"]);

function inferLegacyStageKey(name: string | null | undefined): string | null {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("mockup") && normalized.includes("entreg")) return "mockup_delivered";
  if (normalized.includes("mockup")) return "mockup_make";
  if ((normalized.includes("provis") || normalized.includes("provisor")) && normalized.includes("entreg")) return "provisional_delivered";
  if (normalized.includes("provis") || normalized.includes("provisor")) return "provisional_make";
  if (normalized.includes("entrada") || normalized.includes("novo caso")) return "entry";
  if (normalized.includes("aprova") || normalized.includes("prova")) return "cad_approval";
  if (normalized === "cad" || normalized.includes("desenho")) return "cad";
  if (normalized.includes("sinter") || normalized.includes("forno") || normalized.includes("fresag")) return "sintering";
  if (normalized.includes("acab") || normalized.includes("maqui")) return "finish";
  if (normalized.includes("entreg")) return "delivered";
  if (normalized.includes("confe") || normalized.includes("definit")) return "definitive_make";
  return null;
}

export function CaseWorkflowBar({ caseRow }: { caseRow: CaseRow }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const blocked = useBlockedActionDialog();
  const stageReqs = useStageRequirements(caseRow);

  const settings = useQuery({ queryKey: ["workflow_settings"], queryFn: fetchWorkflowSettings });
  const stages = useQuery({
    queryKey: ["workflow_stages_v2"],
    queryFn: fetchWorkflowStagesV2,
    enabled: !!settings.data?.phases_enabled,
    staleTime: 15_000,
  });
  const reasons = useQuery({
    queryKey: ["return_reasons"],
    queryFn: fetchReturnReasons,
    enabled: !!settings.data?.phases_enabled,
  });
  const profile = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });

  const currentStageId = (caseRow as any).current_stage_id as string | null;
  const requestedFlowKey = ((caseRow as any).workflow_key || deriveWorkflowKey(caseRow as any)) as WorkflowKey;
  const workflowVersion = Number((caseRow as any).workflow_version || 0);
  const sintering = useQuery({
    queryKey: ["case_requires_sintering", caseRow.id, (caseRow as any).teeth_zirconia, (caseRow as any).zirconia_stock_item_id, (caseRow as any).dissilicato_stock_item_id],
    queryFn: () => fetchCaseRequiresSintering(caseRow.id),
    enabled: !!settings.data?.phases_enabled && !!caseRow.id,
  });
  const requiresSintering = Boolean(
    ((caseRow as any).teeth_zirconia ?? []).length > 0 || sintering.data,
  );

  const { list, displayFlowKey, currentIdx } = useMemo(() => {
    const source = stages.data ?? [];
    const currentRecord = source.find((stage: any) => stage.id === currentStageId) as any | undefined;
    const currentRecordFlow = currentRecord?.flow_key as WorkflowKey | null | undefined;
    const effectiveFlowKey = currentRecordFlow && WORKFLOW_KEYS.has(currentRecordFlow)
      ? currentRecordFlow
      : requestedFlowKey;

    // Only versioned stages with a semantic stage_key belong to a v2 workflow.
    // Legacy rows intentionally remain in the database for history and must never
    // be mixed into the visible sequence of a current case.
    const candidates = source.filter((stage: any) =>
      stage.flow_key === effectiveFlowKey && Boolean(stage.stage_key),
    );

    const currentRecordVersion = Number(currentRecord?.workflow_version || 0);
    const inferredLatestVersion = Math.max(0, ...candidates.map((stage: any) => Number(stage.workflow_version || 0)));
    const resolvedVersion = workflowVersion || currentRecordVersion || inferredLatestVersion || 1;

    const seen = new Set<string>();
    const ordered = candidates
      .filter((stage: any) => Number(stage.workflow_version || 1) === resolvedVersion)
      .filter((stage: any) => {
        if (stage.id === currentStageId) return true;
        if (stage.condition_key === "requires_sintering") return requiresSintering;
        return true;
      })
      .sort((a: any, b: any) => a.position - b.position)
      .filter((stage: any) => {
        const key = String(stage.stage_key || stage.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    const currentSemanticKey = currentRecord?.stage_key || inferLegacyStageKey(currentRecord?.name);
    const resolvedCurrentIdx = ordered.findIndex((stage: any) =>
      stage.id === currentStageId || (currentSemanticKey && stage.stage_key === currentSemanticKey),
    );

    return {
      list: ordered,
      displayFlowKey: effectiveFlowKey,
      currentIdx: resolvedCurrentIdx,
    };
  }, [stages.data, currentStageId, requestedFlowKey, workflowVersion, requiresSintering]);

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
    const currentStagePatch = nextStage ? { ...nextStage, color: nextStage.color ?? "#94a3b8" } : null;
    qc.setQueriesData<any[]>({ queryKey: ["cases"] }, (old) => {
      if (!Array.isArray(old)) return old;
      return old.map((c) =>
        c?.id === caseRow.id
          ? { ...c, current_stage_id: nextStageId, current_phase_id: nextPhaseId ?? c.current_phase_id, current_stage: currentStagePatch }
          : c,
      );
    });
    qc.setQueryData(["case", caseRow.id], (old: any) =>
      old ? { ...old, current_stage_id: nextStageId, current_phase_id: nextPhaseId ?? old.current_phase_id, current_stage: currentStagePatch } : old,
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
            { case_id: caseRow.id },
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
  const flowLabel = FLOW_LABELS[displayFlowKey as WorkflowKey]?.title ?? "Fluxo do caso";

  return (
    <div className="w-full min-w-0 py-1 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <span className="hidden lg:inline-flex shrink-0 items-center rounded-full border border-slate-200/80 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-900 px-2.5 py-1 text-[10px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
          {flowLabel}
        </span>

        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-0.5 min-w-max pr-3">
              {list.map((s, i) => {
                const isCurrent = i === currentIdx;
                const isPast = currentIdx >= 0 && i < currentIdx;
                return (
                  <div key={s.id} className="flex items-center shrink-0">
                    {isCurrent ? (
                      <span
                        aria-current="step"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white font-semibold text-[11px] tracking-tight whitespace-nowrap shadow-sm"
                        style={{ backgroundColor: color }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
                        {s.name}
                      </span>
                    ) : (
                      <span className={`text-[11px] whitespace-nowrap ${isPast ? "font-medium text-slate-500 dark:text-slate-400" : "font-normal text-slate-400 dark:text-slate-500"}`}>
                        {s.name}
                      </span>
                    )}
                    {i < list.length - 1 && (
                      <ChevronRight className="h-3 w-3 mx-0.5 text-slate-300 dark:text-slate-700 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {canReturn && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={busy}
                className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-background border border-border hover:bg-accent transition disabled:opacity-40"
                title="Voltar para etapa anterior"
              >
                <ArrowLeft className="h-3 w-3" />
                <span className="hidden xl:inline">Voltar</span>
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
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
          >
            <span className="hidden sm:inline">{busy || stageReqs.isLoading ? "…" : "Próxima etapa"}</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-2 min-w-0">
        <span className="shrink-0 text-[10px] font-medium text-slate-400 dark:text-slate-500">
          {currentIdx >= 0 ? `Etapa ${currentIdx + 1} de ${list.length}` : `${list.length} etapas`}
        </span>
        <div className="h-1 flex-1 max-w-40 rounded-full bg-slate-100 dark:bg-neutral-900 overflow-hidden">
          <div className="h-full transition-all duration-300" style={{ width: `${progress}%`, backgroundColor: color }} />
        </div>
      </div>
      {blocked.dialogElement}
    </div>
  );
}
