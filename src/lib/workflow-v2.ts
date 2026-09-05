import { supabase } from "@/integrations/supabase/client";
import type { WorkflowStage } from "@/lib/workflow";

export type WorkflowKey = "common" | "provisional" | "mockup" | "mockup_provisional";

export type WorkflowTemplate = {
  flow_key: WorkflowKey;
  name: string;
  active_version: number;
  updated_at: string;
  updated_by?: string | null;
};

export type WorkflowStageV2 = WorkflowStage & {
  flow_key?: WorkflowKey | null;
  workflow_version?: number | null;
  stage_key?: string | null;
  condition_key?: "requires_sintering" | "mockup" | "provisional" | null;
};

export const FLOW_LABELS: Record<WorkflowKey, { title: string; description: string }> = {
  common: {
    title: "Caso comum",
    description: "Definitivo confeccionado diretamente, sem provisório ou mockup.",
  },
  provisional: {
    title: "Com provisório",
    description: "Inclui confecção e entrega do provisório antes do definitivo.",
  },
  mockup: {
    title: "Com mockup",
    description: "Inclui confecção e entrega do mockup antes do definitivo.",
  },
  mockup_provisional: {
    title: "Mockup + provisório",
    description: "Para casos mistos: mockup estético e provisório no mesmo caso.",
  },
};

export const FLOW_KEYS = Object.keys(FLOW_LABELS) as WorkflowKey[];

export function deriveWorkflowKey(row: { has_mockup?: boolean | null; has_provisional?: boolean | null }): WorkflowKey {
  if (row.has_mockup && row.has_provisional) return "mockup_provisional";
  if (row.has_mockup) return "mockup";
  if (row.has_provisional) return "provisional";
  return "common";
}

export async function fetchWorkflowTemplates(): Promise<WorkflowTemplate[]> {
  const { data, error } = await supabase
    .from("workflow_templates" as any)
    .select("flow_key,name,active_version,updated_at,updated_by")
    .order("flow_key");
  if (error) throw error;
  return (data ?? []) as unknown as WorkflowTemplate[];
}

/**
 * Reads the versioned stage schema. Never re-label legacy stages as a current
 * workflow: doing that mixes historical stages from every old flow in the case
 * header. When condition_key alone is unavailable we can still use the versioned
 * identity columns safely; when the versioned columns are unavailable, return an
 * empty list and let the UI hide the progress bar until the schema cache catches up.
 */
export async function fetchWorkflowStagesV2(): Promise<WorkflowStageV2[]> {
  const full = await supabase
    .from("stages" as any)
    .select("id,name,color,position,phase_id,requires_implant_components,requirements,condition_key,flow_key,workflow_version,stage_key")
    .order("position");

  if (!full.error) return (full.data ?? []) as unknown as WorkflowStageV2[];

  const msg = String(full.error.message ?? "").toLowerCase();
  if (!msg.includes("schema cache") && !msg.includes("column")) throw full.error;

  const versionedCore = await supabase
    .from("stages" as any)
    .select("id,name,color,position,phase_id,requires_implant_components,requirements,flow_key,workflow_version,stage_key")
    .order("position");

  if (!versionedCore.error) {
    return ((versionedCore.data ?? []) as any[]).map((stage) => ({
      ...stage,
      condition_key: null,
    })) as WorkflowStageV2[];
  }

  const coreMsg = String(versionedCore.error.message ?? "").toLowerCase();
  if (!coreMsg.includes("schema cache") && !coreMsg.includes("column")) throw versionedCore.error;

  // A pure legacy response cannot be assigned to "common" safely because it
  // may contain stages from multiple historical flows. Hiding the bar is safer
  // than showing or advancing through the wrong workflow.
  return [];
}

export async function fetchCaseRequiresSintering(caseId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("case_requires_sintering" as any, { _case_id: caseId });
  if (error) {
    // Safe compatibility fallback while migrations/schema cache are rolling out.
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("schema cache") || msg.includes("function") || msg.includes("does not exist")) return false;
    throw error;
  }
  return Boolean(data);
}

export async function saveWorkflowTemplate(
  flowKey: WorkflowKey,
  stages: Array<Partial<WorkflowStageV2> & { name: string }>,
  applyOpenCases: boolean,
) {
  const payload = stages.map((stage, index) => ({
    source_id: stage.id ?? null,
    stage_key: stage.stage_key || `custom_${index + 1}`,
    name: stage.name.trim(),
    color: stage.color ?? "#94a3b8",
    position: (index + 1) * 10,
    condition_key: stage.condition_key ?? null,
    requirements: stage.requirements ?? [],
    requires_implant_components: Boolean(stage.requires_implant_components),
  }));
  const { data, error } = await supabase.rpc("save_workflow_template" as any, {
    _flow_key: flowKey,
    _stages: payload,
    _apply_open: applyOpenCases,
  });
  if (error) throw error;
  const result = data as any;
  if (result?.success === false) throw new Error(result.error ?? "Não foi possível salvar o fluxo.");
  return result;
}

export async function resetDefaultWorkflows(applyOpenCases: boolean) {
  const { data, error } = await supabase.rpc("reset_default_workflows" as any, {
    _apply_open: applyOpenCases,
  });
  if (error) throw error;
  const result = data as any;
  if (result?.success === false) throw new Error(result.error ?? "Não foi possível restaurar os fluxos padrão.");
  return result;
}

export function getActiveStages(
  allStages: WorkflowStageV2[],
  templates: WorkflowTemplate[],
  flowKey: WorkflowKey,
): WorkflowStageV2[] {
  const activeVersion = templates.find((template) => template.flow_key === flowKey)?.active_version;
  const candidates = allStages.filter((stage) => stage.flow_key === flowKey && stage.stage_key);
  const version = activeVersion ?? Math.max(0, ...candidates.map((stage) => Number(stage.workflow_version ?? 0)));
  return candidates
    .filter((stage) => Number(stage.workflow_version ?? 1) === (version || 1))
    .sort((a, b) => a.position - b.position);
}
