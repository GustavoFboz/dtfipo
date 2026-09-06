// Desktop workflow facade. The Web build keeps using `workflow.ts`; only the
// Tauri bundle resolves `@/lib/workflow` to this file.
import {
  advanceCaseWorkflowLocalFirst,
  fetchAllStageAssignmentsLocalFirst,
  fetchMyTasksLocalFirst,
  fetchReturnReasonsLocalFirst,
  fetchStageAssigneesLocalFirst,
  fetchWorkflowSettingsLocalFirst,
  fetchWorkflowStagesLocalFirst,
  returnCaseWorkflowLocalFirst,
  setStageAssigneesLocalFirst,
  updateWorkflowSettingsLocalFirst,
} from "./workflow-local-first";
import { fetchCaseByIdLocalFirst, patchCaseLocalCache } from "./cases-local-first";

export * from "./workflow";
export {
  fetchAllStageAssignmentsLocalFirst as fetchAllStageAssignments,
  fetchMyTasksLocalFirst as fetchMyTasks,
  fetchReturnReasonsLocalFirst as fetchReturnReasons,
  fetchStageAssigneesLocalFirst as fetchStageAssignees,
  fetchWorkflowSettingsLocalFirst as fetchWorkflowSettings,
  fetchWorkflowStagesLocalFirst as fetchWorkflowStages,
  setStageAssigneesLocalFirst as setStageAssignees,
  updateWorkflowSettingsLocalFirst as updateWorkflowSettings,
};

export async function advanceCaseWorkflow(caseId: string, stageId?: string | null) {
  const result = await advanceCaseWorkflowLocalFirst(caseId, stageId);
  if (!(result as any)?.offline) return result;

  const [current, stages] = await Promise.all([
    fetchCaseByIdLocalFirst(caseId).catch(() => null),
    fetchWorkflowStagesLocalFirst().catch(() => []),
  ]);
  let target = stageId ? stages.find((stage) => stage.id === stageId) ?? null : null;
  if (!target && current?.current_stage_id) {
    const sorted = [...stages].sort((a, b) => a.position - b.position);
    const index = sorted.findIndex((stage) => stage.id === current.current_stage_id);
    target = index >= 0 ? sorted[index + 1] ?? null : sorted[0] ?? null;
  }
  if (target) {
    await patchCaseLocalCache(caseId, {
      current_stage_id: target.id,
      current_phase_id: target.phase_id ?? null,
      current_stage: target,
      updated_at: new Date().toISOString(),
    });
  }
  return result;
}

export async function returnCaseWorkflow(
  caseId: string,
  reasonId: string,
  opts?: { notes?: string; toStageId?: string | null },
) {
  const result = await returnCaseWorkflowLocalFirst(caseId, reasonId, opts);
  if (!(result as any)?.offline || !opts?.toStageId) return result;
  const stages = await fetchWorkflowStagesLocalFirst().catch(() => []);
  const target = stages.find((stage) => stage.id === opts.toStageId) ?? null;
  if (target) {
    await patchCaseLocalCache(caseId, {
      current_stage_id: target.id,
      current_phase_id: target.phase_id ?? null,
      current_stage: target,
      updated_at: new Date().toISOString(),
    });
  }
  return result;
}
