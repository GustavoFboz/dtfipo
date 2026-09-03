import { supabase } from "@/integrations/supabase/client";

export type WorkflowSettings = {
  id: boolean;
  phases_enabled: boolean;
  stages_enabled: boolean;
  auto_advance_enabled: boolean;
  progress_bar_enabled: boolean;
  updated_at: string;
};

export type WorkflowStage = {
  id: string;
  name: string;
  color: string | null;
  position: number;
  phase_id: string | null;
  requires_implant_components?: boolean;
  requirements?: unknown;
  condition_key?: "mockup" | "provisional" | null;
};

export type ReturnReason = {
  id: string;
  label: string;
  position: number;
};

// ============ Settings ============
export async function fetchWorkflowSettings(): Promise<WorkflowSettings> {
  const { data, error } = await supabase
    .from("workflow_settings" as any)
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return (data ?? {
    id: true,
    phases_enabled: false,
    stages_enabled: true,
    auto_advance_enabled: true,
    progress_bar_enabled: true,
    updated_at: new Date().toISOString(),
  }) as WorkflowSettings;
}

export async function updateWorkflowSettings(patch: Partial<WorkflowSettings>) {
  const { error } = await supabase
    .from("workflow_settings" as any)
    .upsert({ id: true, ...patch, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ============ Stages (linear flow) ============
export async function fetchWorkflowStages(): Promise<WorkflowStage[]> {
  const { data, error } = await supabase
    .from("stages" as any)
    .select("id,name,color,position,phase_id,requires_implant_components,requirements,condition_key")
    .order("position");
  if (error) throw error;
  return (data ?? []) as unknown as WorkflowStage[];
}

function inferStageCondition(name: string): "mockup" | "provisional" | null {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("mockup")) return "mockup";
  if (normalized.includes("provisor")) return "provisional";
  return null;
}

export async function createStageSimple(input: { name: string; color?: string; position?: number }) {
  // garante a única fase "Fluxo"
  const { data: ph } = await supabase.from("phases" as any).select("id").order("position").limit(1).maybeSingle();
  let phaseId = (ph as any)?.id as string | undefined;
  if (!phaseId) {
    const { data: created, error: cErr } = await supabase
      .from("phases" as any)
      .insert({ name: "Fluxo", color: "#1F8AFF", position: 10 } as any)
      .select("id")
      .single();
    if (cErr) throw cErr;
    phaseId = (created as any).id;
  }
  const { error } = await supabase.from("stages" as any).insert({
    name: input.name,
    color: input.color ?? "#94a3b8",
    position: input.position ?? 1000,
    phase_id: phaseId,
    condition_key: inferStageCondition(input.name),
  } as any);
  if (error) throw error;
}

export async function updateStage(id: string, patch: Partial<WorkflowStage>) {
  const next = { ...patch };
  if (typeof patch.name === "string" && patch.condition_key === undefined) {
    next.condition_key = inferStageCondition(patch.name);
  }
  const { error } = await supabase.from("stages" as any).update(next as any).eq("id", id);
  if (error) throw error;
}

export async function deleteStage(id: string) {
  const { error } = await supabase.from("stages" as any).delete().eq("id", id);
  if (error) throw error;
}

export async function reorderStages(ids: string[]) {
  await Promise.all(
    ids.map((id, idx) =>
      supabase.from("stages" as any).update({ position: (idx + 1) * 10 } as any).eq("id", id),
    ),
  );
}

// ============ RPCs ============
export async function seedDefaultWorkflow() {
  const { data, error } = await supabase.rpc("seed_default_workflow" as any);
  if (error) throw error;
  const res = data as any;
  if (res && res.success === false) throw new Error(res.error ?? "Falha ao aplicar fluxo padrão");
  return res;
}

export async function advanceCaseWorkflow(caseId: string, stageId?: string | null) {
  const { data, error } = await supabase.rpc("advance_case_workflow" as any, {
    _case_id: caseId,
    _stage_id: stageId ?? null,
  });
  if (error) throw error;
  const res = data as any;
  if (res && res.success === false) throw new Error(res.error ?? "Falha ao avançar");
  return res;
}

export async function returnCaseWorkflow(caseId: string, reasonId: string, opts?: { notes?: string; toStageId?: string | null }) {
  const { data, error } = await supabase.rpc("return_case_workflow" as any, {
    _case_id: caseId,
    _reason_id: reasonId,
    _notes: opts?.notes ?? null,
    _to_stage_id: opts?.toStageId ?? null,
  });
  if (error) throw error;
  const res = data as any;
  if (res && res.success === false) throw new Error(res.error ?? "Falha ao retornar");
  return res;
}


// ============ Return reasons ============
export async function fetchReturnReasons(): Promise<ReturnReason[]> {
  const { data, error } = await supabase
    .from("stage_return_reasons" as any)
    .select("id,label,position")
    .order("position");
  if (error) throw error;
  return (data ?? []) as unknown as ReturnReason[];
}

export async function createReturnReason(label: string, position = 100): Promise<string> {
  const { data, error } = await supabase
    .from("stage_return_reasons" as any)
    .insert({ label, position } as any)
    .select("id")
    .single();
  if (error) throw error;
  return (data as any).id as string;
}

export async function deleteReturnReason(id: string) {
  const { error } = await supabase.from("stage_return_reasons" as any).delete().eq("id", id);
  if (error) throw error;
}

// ============ Assignments ============
export type Assignee = { id: string; user_id: string };

export async function fetchStageAssignees(stageId: string): Promise<Assignee[]> {
  const { data, error } = await supabase
    .from("stage_assignments" as any)
    .select("id,user_id")
    .eq("stage_id", stageId);
  if (error) throw error;
  return (data ?? []) as unknown as Assignee[];
}

export async function setStageAssignees(stageId: string, userIds: string[]) {
  const { error: delErr } = await supabase.from("stage_assignments" as any).delete().eq("stage_id", stageId);
  if (delErr) throw delErr;
  if (userIds.length === 0) return;
  const rows = userIds.map((uid) => ({ stage_id: stageId, user_id: uid }));
  const { error } = await supabase.from("stage_assignments" as any).insert(rows as any);
  if (error) throw error;
}

export async function fetchAllStageAssignments(): Promise<{ stage_id: string; user_id: string }[]> {
  const { data, error } = await supabase.from("stage_assignments" as any).select("stage_id,user_id");
  if (error) throw error;
  return (data ?? []) as any;
}

// ============ My tasks ============
import type { CaseRow } from "@/lib/types";

export async function fetchMyTasks(): Promise<CaseRow[]> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return [];

  const { data: stageA } = await supabase
    .from("stage_assignments" as any)
    .select("stage_id")
    .eq("user_id", uid);
  const stageIds = ((stageA ?? []) as any[]).map((r) => r.stage_id);
  if (stageIds.length === 0) return [];

  const sel = `
    id, case_label, entry_date, delivery_date, finished_at,
    current_phase_id, current_stage_id,
    patient:patients(id, name),
    cadista:cadistas(id, name),
    doctor:doctors(id, name),
    current_stage:stages!cases_current_stage_id_fkey(id, name, color)
  ` as const;

  const { data, error } = await supabase
    .from("cases")
    .select(sel as any)
    .is("finished_at", null)
    .in("current_stage_id", stageIds)
    .order("delivery_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CaseRow[];
}
