import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, GitBranch, Plus, RotateCcw, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { confirm } from "@/lib/confirm";
import { fetchProfile } from "@/lib/api";
import {
  createReturnReason,
  deleteReturnReason,
  fetchReturnReasons,
} from "@/lib/workflow";
import {
  FLOW_KEYS,
  FLOW_LABELS,
  fetchWorkflowStagesV2,
  fetchWorkflowTemplates,
  getActiveStages,
  resetDefaultWorkflows,
  saveWorkflowTemplate,
  type WorkflowKey,
  type WorkflowStageV2,
} from "@/lib/workflow-v2";
import {
  REQUIREMENT_CATALOG,
  parseRequirements,
  type StageRequirement,
  type StageRequirementType,
} from "@/lib/stage-requirements";

type DraftStage = WorkflowStageV2 & { localId: string };

function makeLocalId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function normalizeDraft(stages: WorkflowStageV2[]): DraftStage[] {
  return stages.map((stage) => ({ ...stage, localId: stage.id || makeLocalId() }));
}

function canManage(profile: any) {
  const role = String(profile?.role || "").toUpperCase();
  const subtype = String(profile?.account_subtype || "").toUpperCase();
  return Boolean(profile?.is_default_admin) || role === "CEO" || subtype === "CEO" || subtype === "ADMIN";
}

export function WorkflowManagerV2() {
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const templates = useQuery({ queryKey: ["workflow_templates"], queryFn: fetchWorkflowTemplates });
  const stages = useQuery({ queryKey: ["workflow_stages_v2"], queryFn: fetchWorkflowStagesV2 });
  const reasons = useQuery({ queryKey: ["return_reasons"], queryFn: fetchReturnReasons });
  const [activeFlow, setActiveFlow] = useState<WorkflowKey>("common");
  const [drafts, setDrafts] = useState<Record<WorkflowKey, DraftStage[]>>({
    common: [], provisional: [], mockup: [], mockup_provisional: [],
  });
  const [dirty, setDirty] = useState<Record<WorkflowKey, boolean>>({
    common: false, provisional: false, mockup: false, mockup_provisional: false,
  });
  const [saving, setSaving] = useState(false);
  const [newReason, setNewReason] = useState("");

  const manageable = canManage(profile.data);
  const loading = templates.isLoading || stages.isLoading;
  const loadError = templates.error || stages.error;

  const activeFromServer = useMemo(() => {
    const result = {} as Record<WorkflowKey, WorkflowStageV2[]>;
    for (const key of FLOW_KEYS) {
      result[key] = getActiveStages(stages.data ?? [], templates.data ?? [], key);
    }
    return result;
  }, [stages.data, templates.data]);

  useEffect(() => {
    if (loading || loadError) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const key of FLOW_KEYS) {
        if (!dirty[key]) next[key] = normalizeDraft(activeFromServer[key]);
      }
      return next;
    });
  }, [activeFromServer, loading, loadError]);

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["workflow_templates"] }),
      qc.invalidateQueries({ queryKey: ["workflow_stages_v2"] }),
      qc.invalidateQueries({ queryKey: ["workflow_stages"] }),
      qc.invalidateQueries({ queryKey: ["return_reasons"] }),
      qc.invalidateQueries({ queryKey: ["cases"] }),
    ]);
  };

  function updateDraft(key: WorkflowKey, updater: (list: DraftStage[]) => DraftStage[]) {
    setDrafts((current) => ({ ...current, [key]: updater(current[key]) }));
    setDirty((current) => ({ ...current, [key]: true }));
  }

  function addStage() {
    updateDraft(activeFlow, (list) => [
      ...list,
      {
        id: "",
        localId: makeLocalId(),
        name: "Nova etapa",
        color: "#94a3b8",
        position: (list.length + 1) * 10,
        phase_id: null,
        flow_key: activeFlow,
        workflow_version: null,
        stage_key: `custom_${Date.now()}`,
        condition_key: null,
        requirements: [],
      },
    ]);
  }

  async function saveCurrent() {
    if (!manageable || saving) return;
    const draft = drafts[activeFlow];
    if (draft.length < 2) {
      toast.error("O fluxo precisa ter pelo menos duas etapas.");
      return;
    }
    if (draft.some((stage) => !stage.name.trim())) {
      toast.error("Todas as etapas precisam ter um nome.");
      return;
    }
    const applyOpen = await confirm({
      title: "Aplicar aos casos em aberto?",
      description: "O fluxo salvo será usado imediatamente por novos casos. Você também pode migrar os casos em aberto que já usam este tipo de fluxo, preservando a etapa equivalente sempre que possível.",
      confirmText: "Aplicar também aos abertos",
      cancelText: "Somente novos casos",
    });
    try {
      setSaving(true);
      await saveWorkflowTemplate(activeFlow, draft, applyOpen);
      setDirty((current) => ({ ...current, [activeFlow]: false }));
      await invalidate();
      toast.success(applyOpen ? "Fluxo salvo e aplicado aos casos em aberto." : "Fluxo salvo para novos casos.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function restoreDefaults() {
    if (!manageable || saving) return;
    const proceed = await confirm({
      title: "Restaurar os quatro fluxos padrão?",
      description: "Serão criadas novas versões dos fluxos comum, provisório, mockup e mockup + provisório. As versões anteriores permanecem preservadas para casos que já estão em andamento.",
      confirmText: "Restaurar padrões",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!proceed) return;
    const applyOpen = await confirm({
      title: "Atualizar casos em aberto também?",
      description: "Ao aplicar, os casos em aberto serão migrados para a etapa equivalente dos novos fluxos padrão. Casos finalizados não serão alterados.",
      confirmText: "Atualizar casos abertos",
      cancelText: "Somente novos casos",
    });
    try {
      setSaving(true);
      await resetDefaultWorkflows(applyOpen);
      setDirty({ common: false, provisional: false, mockup: false, mockup_provisional: false });
      await invalidate();
      toast.success("Fluxos padrão restaurados.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function addReason() {
    const label = newReason.trim();
    if (!label || !manageable) return;
    try {
      await createReturnReason(label, ((reasons.data?.at(-1)?.position ?? 0) + 10));
      setNewReason("");
      await qc.invalidateQueries({ queryKey: ["return_reasons"] });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function removeReason(id: string, label: string) {
    if (!manageable) return;
    if (!(await confirm({
      title: "Remover justificativa",
      description: `Remover “${label}”?`,
      confirmText: "Remover",
      destructive: true,
    }))) return;
    try {
      await deleteReturnReason(id);
      await qc.invalidateQueries({ queryKey: ["return_reasons"] });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  if (profile.isLoading) {
    return <div className="p-10 text-sm text-muted-foreground">Carregando gestão de fluxo…</div>;
  }
  if (!manageable) {
    return (
      <div className="p-12 max-w-3xl mx-auto">
        <h1 className="text-2xl font-light">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground mt-2">Apenas usuários Admin/CEO podem editar os fluxos.</p>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="p-10 max-w-4xl mx-auto space-y-3">
        <h1 className="text-2xl font-light">Gestão de Fluxo</h1>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Não foi possível carregar os fluxos: {(loadError as Error).message}
        </div>
      </div>
    );
  }

  const draft = drafts[activeFlow];
  const activeVersion = templates.data?.find((item) => item.flow_key === activeFlow)?.active_version ?? 1;

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/5 grid place-items-center border border-primary/10">
            <GitBranch className="h-5 w-5 text-primary stroke-[1.4px]" />
          </div>
          <div>
            <h1 className="text-2xl font-light tracking-tight">Gestão de Fluxo</h1>
            <p className="text-xs text-muted-foreground">Quatro fluxos versionados. Casos em andamento podem manter a versão anterior.</p>
          </div>
        </div>
        <button
          onClick={restoreDefaults}
          disabled={saving}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border border-border bg-background hover:bg-accent disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" /> Restaurar fluxos padrão
        </button>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {FLOW_KEYS.map((key) => {
          const selected = activeFlow === key;
          const version = templates.data?.find((item) => item.flow_key === key)?.active_version ?? 1;
          return (
            <button
              key={key}
              onClick={() => setActiveFlow(key)}
              className={`rounded-2xl border p-3 text-left transition ${selected ? "border-primary/35 bg-primary/5 shadow-sm" : "border-border bg-card hover:bg-accent/40"}`}
            >
              <div className="text-sm font-medium">{FLOW_LABELS[key].title}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Versão ativa {version}{dirty[key] ? " · alterações não salvas" : ""}</div>
            </button>
          );
        })}
      </div>

      <section className="rounded-3xl border border-border bg-card overflow-hidden">
        <div className="p-5 border-b border-border flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-medium">{FLOW_LABELS[activeFlow].title}</h2>
              <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">v{activeVersion}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{FLOW_LABELS[activeFlow].description}</p>
          </div>
          <div className="flex items-center gap-2">
            {dirty[activeFlow] && (
              <button
                onClick={() => {
                  setDrafts((current) => ({ ...current, [activeFlow]: normalizeDraft(activeFromServer[activeFlow]) }));
                  setDirty((current) => ({ ...current, [activeFlow]: false }));
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-xs hover:bg-accent"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Descartar
              </button>
            )}
            <button
              onClick={saveCurrent}
              disabled={!dirty[activeFlow] || saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" /> {saving ? "Salvando…" : "Salvar fluxo"}
            </button>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <div className="rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
            <strong>Sinterização é condicional:</strong> a etapa só aparece no caso quando pelo menos um material utilizado estiver marcado como “requer sinterização”. Zircônia existente já é marcada automaticamente.
          </div>

          {draft.map((stage, index) => (
            <StageDraftRow
              key={stage.localId}
              stage={stage}
              index={index}
              total={draft.length}
              onPatch={(patch) => updateDraft(activeFlow, (list) => list.map((item) => item.localId === stage.localId ? { ...item, ...patch } : item))}
              onMove={(direction) => updateDraft(activeFlow, (list) => {
                const target = index + direction;
                if (target < 0 || target >= list.length) return list;
                const next = [...list];
                [next[index], next[target]] = [next[target], next[index]];
                return next;
              })}
              onRemove={() => updateDraft(activeFlow, (list) => list.filter((item) => item.localId !== stage.localId))}
            />
          ))}

          <button
            onClick={addStage}
            className="w-full h-10 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 inline-flex items-center justify-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar etapa
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-[11px] font-bold tracking-[0.18em] uppercase text-primary/70">Justificativas de retorno</h2>
          <p className="text-xs text-muted-foreground mt-1">As regras de retorno continuam compartilhadas por todos os fluxos.</p>
        </div>
        <div className="flex gap-2">
          <input
            value={newReason}
            onChange={(event) => setNewReason(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && addReason()}
            placeholder="Nova justificativa…"
            className="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-sm"
          />
          <button onClick={addReason} className="h-9 px-3 rounded-lg border border-border text-xs hover:bg-accent inline-flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(reasons.data ?? []).map((reason) => (
            <span key={reason.id} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 h-7 text-xs">
              {reason.label}
              <button onClick={() => removeReason(reason.id, reason.label)} className="text-muted-foreground hover:text-rose-500">
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function StageDraftRow({ stage, index, total, onPatch, onMove, onRemove }: {
  stage: DraftStage;
  index: number;
  total: number;
  onPatch: (patch: Partial<DraftStage>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const requirements = parseRequirements(stage.requirements);
  const available = (Object.keys(REQUIREMENT_CATALOG) as StageRequirementType[]).filter(
    (type) => !requirements.some((item) => item.type === type),
  );

  function setRequirements(next: StageRequirement[]) {
    onPatch({ requirements: next as unknown });
  }

  return (
    <div className="rounded-2xl border border-border bg-background p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-6 text-center text-[11px] font-mono text-muted-foreground">{index + 1}</span>
        <input
          type="color"
          value={stage.color ?? "#94a3b8"}
          onChange={(event) => onPatch({ color: event.target.value })}
          className="h-8 w-10 rounded border border-border bg-transparent"
          aria-label="Cor da etapa"
        />
        <input
          value={stage.name}
          onChange={(event) => onPatch({ name: event.target.value })}
          className="flex-1 min-w-0 h-8 rounded-md border border-border bg-background px-2 text-sm font-medium"
        />
        {stage.condition_key === "requires_sintering" && (
          <span className="hidden sm:inline-flex rounded-full bg-amber-100 px-2 py-1 text-[10px] font-medium text-amber-800">Condicional · sinterização</span>
        )}
        <button onClick={() => onMove(-1)} disabled={index === 0} className="p-1.5 rounded-md hover:bg-accent disabled:opacity-25"><ArrowUp className="h-3.5 w-3.5" /></button>
        <button onClick={() => onMove(1)} disabled={index === total - 1} className="p-1.5 rounded-md hover:bg-accent disabled:opacity-25"><ArrowDown className="h-3.5 w-3.5" /></button>
        <button onClick={onRemove} className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>

      <div className="pl-8 flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Exigências</span>
        {requirements.map((requirement) => (
          <span key={requirement.type} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px]">
            {REQUIREMENT_CATALOG[requirement.type]?.label ?? requirement.type}
            <button onClick={() => setRequirements(requirements.filter((item) => item.type !== requirement.type))} className="text-muted-foreground hover:text-rose-500">×</button>
          </span>
        ))}
        {available.length > 0 && (
          <select
            value=""
            onChange={(event) => {
              const type = event.target.value as StageRequirementType;
              if (type) setRequirements([...requirements, { type, blocks_advance: true }]);
            }}
            className="h-7 rounded-lg border border-border bg-background px-2 text-[10px] text-muted-foreground"
          >
            <option value="">+ adicionar exigência</option>
            {available.map((type) => <option key={type} value={type}>{REQUIREMENT_CATALOG[type].label}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}
