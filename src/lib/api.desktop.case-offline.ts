import { supabase } from "@/integrations/supabase/client";
import {
  createCase as createCaseBase,
  fetchCaseById as fetchCaseByIdBase,
  fetchStages as fetchStagesBase,
  updateCase as updateCaseBase,
} from "./api.desktop";
import { sendInternalNotificationLocalFirst } from "./notifications-local-first";

export * from "./api.desktop";

type WorkflowKey = "common" | "provisional" | "mockup" | "mockup_provisional";

function desiredWorkflowKey(hasMockup: boolean, hasProvisional: boolean): WorkflowKey {
  if (hasMockup && hasProvisional) return "mockup_provisional";
  if (hasMockup) return "mockup";
  if (hasProvisional) return "provisional";
  return "common";
}

function hasOwn(object: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Desktop edits can be queued while offline, so they cannot depend on the
 * database trigger to move a case into its Mockup/Provisional workflow. When
 * either flag changes, mirror the server rule locally: preserve the semantic
 * stage (stage_key) in the destination flow whenever possible, otherwise fall
 * back to that flow's entry stage. The cloud trigger revalidates the same rule
 * when the outbox eventually replays.
 */
export async function updateCase(
  id: Parameters<typeof updateCaseBase>[0],
  patch: Parameters<typeof updateCaseBase>[1],
) {
  const candidatePatch = patch as Record<string, unknown>;
  const touchesWorkflow = hasOwn(candidatePatch, "has_mockup") || hasOwn(candidatePatch, "has_provisional");
  if (!touchesWorkflow) return updateCaseBase(id, patch);

  try {
    const [current, stages] = await Promise.all([
      fetchCaseByIdBase(id),
      fetchStagesBase(),
    ]);
    if (!current) return updateCaseBase(id, patch);

    const hasMockup = hasOwn(candidatePatch, "has_mockup")
      ? Boolean(candidatePatch.has_mockup)
      : Boolean((current as any).has_mockup);
    const hasProvisional = hasOwn(candidatePatch, "has_provisional")
      ? Boolean(candidatePatch.has_provisional)
      : Boolean((current as any).has_provisional);
    const workflowKey = desiredWorkflowKey(hasMockup, hasProvisional);

    const stageRows = (stages ?? []) as any[];
    const requestedStageId = String(candidatePatch.current_stage_id ?? (current as any).current_stage_id ?? "");
    const requestedStage = stageRows.find((stage) => String(stage.id) === requestedStageId);
    const semanticStageKey = String(requestedStage?.stage_key ?? "entry");

    const candidates = stageRows.filter((stage) => String(stage.flow_key ?? "") === workflowKey && stage.stage_key);
    const latestVersion = Math.max(0, ...candidates.map((stage) => Number(stage.workflow_version ?? 1)));
    const workflowVersion = latestVersion || Number((current as any).workflow_version ?? 1) || 1;
    const versionRows = candidates.filter((stage) => Number(stage.workflow_version ?? 1) === workflowVersion);
    const targetStage =
      versionRows.find((stage) => String(stage.stage_key) === semanticStageKey) ??
      versionRows.find((stage) => String(stage.stage_key) === "entry") ??
      null;

    const enhancedPatch: Record<string, unknown> = {
      ...candidatePatch,
      workflow_key: workflowKey,
      workflow_version: workflowVersion,
    };
    if (targetStage) {
      enhancedPatch.current_stage_id = targetStage.id;
      enhancedPatch.current_phase_id = targetStage.phase_id ?? null;
    }

    return updateCaseBase(id, enhancedPatch);
  } catch (error) {
    // Never block the edit because the auxiliary stage cache is temporarily
    // unavailable. Online/server replay still has the authoritative trigger.
    console.warn("[DentalFlow Desktop] Fluxo será realinhado pelo servidor na sincronização", error);
    return updateCaseBase(id, patch);
  }
}

/**
 * Desktop-only create wrapper. The case itself is already local-first in
 * api.desktop/cases-local-first. When creation starts offline, also persist the
 * dentist assignment notification in the notification outbox. The standard
 * Cloud create path already notifies the assigned CAD user when the case is
 * replayed, so this wrapper only adds the dentist notification and avoids a
 * duplicate CAD alert.
 */
export async function createCase(input: Parameters<typeof createCaseBase>[0]) {
  const startedOffline = typeof navigator !== "undefined" && navigator.onLine === false;
  const created = await createCaseBase(input);

  if (!startedOffline || !created?.id) return created;

  try {
    const doctorUserId = String((created as any)?.doctor?.user_id ?? "").trim();
    if (!doctorUserId) return created;

    const { data: auth } = await supabase.auth.getUser();
    if (auth.user?.id === doctorUserId) return created;

    const patientName = String((created as any)?.patient?.name ?? "paciente").trim() || "paciente";
    await sendInternalNotificationLocalFirst(
      doctorUserId,
      "Novo caso atribuído",
      `Um novo caso de ${patientName} foi atribuído a você.`,
      "case_assigned",
      {
        case_id: created.id,
        case_label: patientName,
        queued_offline: true,
        source: "desktop_offline_case_create",
      },
    );
  } catch (error) {
    // Case creation must never be rolled back because a secondary notification
    // could not be queued. The general case stakeholder path can still retry
    // subsequent activity notifications.
    console.warn("[DentalFlow Desktop] Não foi possível enfileirar a notificação do dentista", error);
  }

  return created;
}
