// Desktop workflow facade. The Web build keeps using `workflow.ts`; only the
// Tauri bundle resolves `@/lib/workflow` to this file.
export * from "./workflow";
export {
  advanceCaseWorkflowLocalFirst as advanceCaseWorkflow,
  fetchAllStageAssignmentsLocalFirst as fetchAllStageAssignments,
  fetchMyTasksLocalFirst as fetchMyTasks,
  fetchReturnReasonsLocalFirst as fetchReturnReasons,
  fetchStageAssigneesLocalFirst as fetchStageAssignees,
  fetchWorkflowSettingsLocalFirst as fetchWorkflowSettings,
  fetchWorkflowStagesLocalFirst as fetchWorkflowStages,
  returnCaseWorkflowLocalFirst as returnCaseWorkflow,
  setStageAssigneesLocalFirst as setStageAssignees,
  updateWorkflowSettingsLocalFirst as updateWorkflowSettings,
} from "./workflow-local-first";
