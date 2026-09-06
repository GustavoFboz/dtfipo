import * as cloud from "./workflow";
import type { CaseRow } from "./types";
import {
  clearDoneOutbox,
  enqueueOutbox,
  getPendingOutbox,
  isDentalFlowDesktop,
  localCacheGet,
  localCachePut,
  markOutbox,
  type OutboxEntry,
} from "./desktop-local";
import { requireDesktopOwnerId, resolveDesktopOwnerId } from "./desktop-identity";
import { fetchCasesLocalFirst } from "./cases-local-first";

export * from "./workflow";

const SETTINGS_NS = "workflow-settings:v1";
const STAGES_NS = "workflow-stages:v1";
const ASSIGNMENTS_NS = "workflow-assignments:v1";
const RETURN_REASONS_NS = "workflow-return-reasons:v1";
const ALL_KEY = "all";
const SETTINGS_KEY = "current";
const ENTITY = "workflow";

type Settings = cloud.WorkflowSettings;
type Stage = cloud.WorkflowStage;
type ReturnReason = cloud.ReturnReason;
type Assignment = { stage_id: string; user_id: string };

type WorkflowOutboxPayload =
  | { patch: Partial<Settings> }
  | { stageId: string; userIds: string[] }
  | { caseId: string; stageId?: string | null }
  | { caseId: string; reasonId: string; notes?: string; toStageId?: string | null };

function online() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function transient(error: unknown) {
  if (!online()) return true;
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  return ["failed to fetch", "networkerror", "network error", "load failed", "fetch failed", "connection", "offline", "timeout"].some((x) => message.includes(x));
}

async function readList<T>(ownerId: string, namespace: string): Promise<T[]> {
  const entry = await localCacheGet<T[]>(ownerId, namespace, ALL_KEY);
  return Array.isArray(entry?.payload) ? entry.payload : [];
}

async function writeList<T>(ownerId: string, namespace: string, rows: T[]) {
  await localCachePut(ownerId, namespace, ALL_KEY, rows);
}

export async function fetchWorkflowSettingsLocalFirst(): Promise<Settings> {
  if (!isDentalFlowDesktop()) return cloud.fetchWorkflowSettings();
  const ownerId = await resolveDesktopOwnerId();
  if (!ownerId) return cloud.fetchWorkflowSettings();

  if (online()) {
    try {
      const value = await cloud.fetchWorkflowSettings();
      await localCachePut(ownerId, SETTINGS_NS, SETTINGS_KEY, value);
      return value;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  const cached = await localCacheGet<Settings>(ownerId, SETTINGS_NS, SETTINGS_KEY);
  if (cached?.payload) return cached.payload;
  return {
    id: true,
    phases_enabled: false,
    stages_enabled: true,
    auto_advance_enabled: true,
    progress_bar_enabled: true,
    updated_at: new Date(0).toISOString(),
  };
}

export async function updateWorkflowSettingsLocalFirst(patch: Partial<Settings>) {
  if (!isDentalFlowDesktop()) return cloud.updateWorkflowSettings(patch);
  const ownerId = await requireDesktopOwnerId();
  const current = await fetchWorkflowSettingsLocalFirst();
  const next = { ...current, ...patch, id: true, updated_at: new Date().toISOString() } as Settings;

  if (online()) {
    try {
      await cloud.updateWorkflowSettings(patch);
      const authoritative = await cloud.fetchWorkflowSettings();
      await localCachePut(ownerId, SETTINGS_NS, SETTINGS_KEY, authoritative);
      return;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  await localCachePut(ownerId, SETTINGS_NS, SETTINGS_KEY, next);
  await enqueueOutbox({ ownerId, entityType: ENTITY, operation: "update_settings", payload: { patch } });
}

export async function fetchWorkflowStagesLocalFirst(): Promise<Stage[]> {
  if (!isDentalFlowDesktop()) return cloud.fetchWorkflowStages();
  const ownerId = await resolveDesktopOwnerId();
  if (!ownerId) return [];

  if (online()) {
    try {
      const rows = await cloud.fetchWorkflowStages();
      await writeList(ownerId, STAGES_NS, rows);
      return rows;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  return readList<Stage>(ownerId, STAGES_NS);
}

export async function fetchAllStageAssignmentsLocalFirst(): Promise<Assignment[]> {
  if (!isDentalFlowDesktop()) return cloud.fetchAllStageAssignments();
  const ownerId = await resolveDesktopOwnerId();
  if (!ownerId) return [];

  if (online()) {
    try {
      const rows = await cloud.fetchAllStageAssignments();
      await writeList(ownerId, ASSIGNMENTS_NS, rows);
      return rows;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  return readList<Assignment>(ownerId, ASSIGNMENTS_NS);
}

export async function fetchStageAssigneesLocalFirst(stageId: string) {
  if (!isDentalFlowDesktop()) return cloud.fetchStageAssignees(stageId);
  const rows = await fetchAllStageAssignmentsLocalFirst();
  return rows.filter((row) => row.stage_id === stageId).map((row, index) => ({
    id: `${stageId}:${row.user_id}:${index}`,
    user_id: row.user_id,
  }));
}

export async function setStageAssigneesLocalFirst(stageId: string, userIds: string[]) {
  if (!isDentalFlowDesktop()) return cloud.setStageAssignees(stageId, userIds);
  const ownerId = await requireDesktopOwnerId();

  if (online()) {
    try {
      await cloud.setStageAssignees(stageId, userIds);
      const rows = await cloud.fetchAllStageAssignments();
      await writeList(ownerId, ASSIGNMENTS_NS, rows);
      return;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  const current = await readList<Assignment>(ownerId, ASSIGNMENTS_NS);
  const next = [
    ...current.filter((row) => row.stage_id !== stageId),
    ...userIds.map((user_id) => ({ stage_id: stageId, user_id })),
  ];
  await writeList(ownerId, ASSIGNMENTS_NS, next);
  await enqueueOutbox({ ownerId, entityType: ENTITY, entityId: stageId, operation: "set_stage_assignees", payload: { stageId, userIds } });
}

export async function fetchReturnReasonsLocalFirst(): Promise<ReturnReason[]> {
  if (!isDentalFlowDesktop()) return cloud.fetchReturnReasons();
  const ownerId = await resolveDesktopOwnerId();
  if (!ownerId) return [];

  if (online()) {
    try {
      const rows = await cloud.fetchReturnReasons();
      await writeList(ownerId, RETURN_REASONS_NS, rows);
      return rows;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  return readList<ReturnReason>(ownerId, RETURN_REASONS_NS);
}

export async function fetchMyTasksLocalFirst(): Promise<CaseRow[]> {
  if (!isDentalFlowDesktop()) return cloud.fetchMyTasks();
  const ownerId = await resolveDesktopOwnerId();
  if (!ownerId) return [];

  if (online()) {
    try {
      const rows = await cloud.fetchMyTasks();
      // `fetchCasesLocalFirst` warms the richer case payload; tasks can then be
      // reconstructed from local assignments when offline.
      await fetchCasesLocalFirst("all").catch(() => []);
      return rows;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  const [assignments, cases] = await Promise.all([
    readList<Assignment>(ownerId, ASSIGNMENTS_NS),
    fetchCasesLocalFirst("all").catch(() => []),
  ]);
  const stageIds = new Set(assignments.filter((row) => row.user_id === ownerId).map((row) => row.stage_id));
  return cases
    .filter((row) => !row.finished_at && row.current_stage_id && stageIds.has(row.current_stage_id))
    .sort((a, b) => String(a.delivery_date ?? "").localeCompare(String(b.delivery_date ?? "")));
}

export async function advanceCaseWorkflowLocalFirst(caseId: string, stageId?: string | null) {
  if (!isDentalFlowDesktop()) return cloud.advanceCaseWorkflow(caseId, stageId);
  const ownerId = await requireDesktopOwnerId();

  if (online()) {
    try {
      return await cloud.advanceCaseWorkflow(caseId, stageId);
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  await enqueueOutbox({
    ownerId,
    entityType: ENTITY,
    entityId: caseId,
    operation: "advance_case",
    payload: { caseId, stageId: stageId ?? null },
  });
  return { success: true, offline: true, queued: true } as any;
}

export async function returnCaseWorkflowLocalFirst(
  caseId: string,
  reasonId: string,
  opts?: { notes?: string; toStageId?: string | null },
) {
  if (!isDentalFlowDesktop()) return cloud.returnCaseWorkflow(caseId, reasonId, opts);
  const ownerId = await requireDesktopOwnerId();

  if (online()) {
    try {
      return await cloud.returnCaseWorkflow(caseId, reasonId, opts);
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  await enqueueOutbox({
    ownerId,
    entityType: ENTITY,
    entityId: caseId,
    operation: "return_case",
    payload: { caseId, reasonId, notes: opts?.notes, toStageId: opts?.toStageId ?? null },
  });
  return { success: true, offline: true, queued: true } as any;
}

async function processEntry(entry: OutboxEntry<WorkflowOutboxPayload>) {
  const payload: any = entry.payload ?? {};
  switch (entry.operation) {
    case "update_settings":
      await cloud.updateWorkflowSettings(payload.patch ?? {});
      return;
    case "set_stage_assignees":
      await cloud.setStageAssignees(String(payload.stageId), Array.isArray(payload.userIds) ? payload.userIds : []);
      return;
    case "advance_case":
      await cloud.advanceCaseWorkflow(String(payload.caseId), payload.stageId ?? null);
      return;
    case "return_case":
      await cloud.returnCaseWorkflow(String(payload.caseId), String(payload.reasonId), {
        notes: payload.notes,
        toStageId: payload.toStageId ?? null,
      });
      return;
    default:
      throw new Error(`Operação offline de workflow não suportada: ${entry.operation}`);
  }
}

export async function syncPendingWorkflowChanges() {
  if (!isDentalFlowDesktop() || !online()) return { processed: 0, failed: 0, conflicts: 0, datasetsCached: 0 };
  const ownerId = await resolveDesktopOwnerId();
  if (!ownerId) return { processed: 0, failed: 0, conflicts: 0, datasetsCached: 0 };
  const pending = (await getPendingOutbox<WorkflowOutboxPayload>(ownerId, 500)).filter((entry) => entry.entity_type === ENTITY);
  let processed = 0;
  let failed = 0;

  for (const entry of pending) {
    try {
      await markOutbox(ownerId, entry.id, "syncing");
      await processEntry(entry);
      await markOutbox(ownerId, entry.id, "done");
      processed += 1;
    } catch (error) {
      failed += 1;
      await markOutbox(ownerId, entry.id, "error", String((error as any)?.message ?? error));
    }
  }
  await clearDoneOutbox(ownerId);
  const datasetsCached = await warmWorkflowLocalCache().catch(() => 0);
  return { processed, failed, conflicts: 0, datasetsCached };
}

export async function warmWorkflowLocalCache() {
  if (!isDentalFlowDesktop() || !online()) return 0;
  const ownerId = await resolveDesktopOwnerId();
  if (!ownerId) return 0;
  const results = await Promise.allSettled([
    cloud.fetchWorkflowSettings(),
    cloud.fetchWorkflowStages(),
    cloud.fetchAllStageAssignments(),
    cloud.fetchReturnReasons(),
  ]);
  let cached = 0;
  if (results[0].status === "fulfilled") {
    await localCachePut(ownerId, SETTINGS_NS, SETTINGS_KEY, results[0].value);
    cached += 1;
  }
  if (results[1].status === "fulfilled") {
    await writeList(ownerId, STAGES_NS, results[1].value);
    cached += 1;
  }
  if (results[2].status === "fulfilled") {
    await writeList(ownerId, ASSIGNMENTS_NS, results[2].value);
    cached += 1;
  }
  if (results[3].status === "fulfilled") {
    await writeList(ownerId, RETURN_REASONS_NS, results[3].value);
    cached += 1;
  }
  return cached;
}
