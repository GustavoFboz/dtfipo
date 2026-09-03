import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subscribeEntity, isDeleted, markDeleted } from "@/lib/optimistic";
import { fetchCaseById } from "@/lib/api";
import type { CaseRow, Stage } from "@/lib/types";


type CasePatch = Partial<CaseRow> & {
  id: string;
  current_stage_id?: string | null;
  current_phase_id?: string | null;
  assigned_user_ids?: string[];
  workflow_only?: boolean;
  sent_at?: number;
};

const CHANNEL_NAME = "case-workflow-live";
const EVENT_NAME = "case_workflow_patch";

let channel: ReturnType<typeof supabase.channel> | null = null;
let subscribed = false;
const queue: CasePatch[] = [];
const listeners = new Set<(patch: CasePatch) => void>();

function cachedStage(queryClient: QueryClient, stageId?: string | null): Stage | null {
  if (!stageId) return null;
  const workflowStages = queryClient.getQueryData<Stage[]>(["workflow_stages"]) ?? [];
  const stages = queryClient.getQueryData<Stage[]>(["stages"]) ?? [];
  return workflowStages.find((s) => s.id === stageId) ?? stages.find((s) => s.id === stageId) ?? null;
}

function withStage(queryClient: QueryClient, patch: CasePatch): CasePatch {
  if (!Object.prototype.hasOwnProperty.call(patch, "current_stage_id")) return patch;
  if (Object.prototype.hasOwnProperty.call(patch, "current_stage")) return patch;
  const stage = cachedStage(queryClient, patch.current_stage_id);
  if (!stage && patch.current_stage_id) return patch;
  return {
    ...patch,
    current_stage: stage ? { ...stage, color: stage.color ?? "#94a3b8" } : null,
  } as CasePatch;
}

function isMyStage(queryClient: QueryClient, stageId?: string | null, assignedUserIds?: string[]) {
  if (!stageId) return false;
  const profile = queryClient.getQueryData<{ id?: string }>(["profile"]);
  const uid = profile?.id;
  if (!uid) return false;
  if (Array.isArray(assignedUserIds)) return assignedUserIds.includes(uid);
  const assignments = queryClient.getQueryData<{ stage_id: string; user_id: string }[]>(["stage_assignments_all"]);
  return Array.isArray(assignments) && assignments.some((row) => row.stage_id === stageId && row.user_id === uid);
}

function canMaterializeTask(patch: CasePatch): patch is CasePatch & CaseRow {
  return !!patch.patient && !!patch.delivery_date && Object.prototype.hasOwnProperty.call(patch, "finished_at");
}

function stripRealtimeMeta<T extends Record<string, any>>(patch: T): Omit<T, "assigned_user_ids" | "workflow_only" | "sent_at"> {
  const { assigned_user_ids, workflow_only, sent_at, ...rest } = patch;
  return rest;
}

function cachePatchFor(patch: CasePatch): Partial<CaseRow> & { id: string } {
  if (!patch.workflow_only) return stripRealtimeMeta(patch) as Partial<CaseRow> & { id: string };
  const out: Partial<CaseRow> & { id: string } = { id: patch.id };
  (["current_stage_id", "current_phase_id", "current_stage", "finished_at", "status", "updated_at"] as const).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(patch, key)) (out as any)[key] = (patch as any)[key];
  });
  return out;
}

function compareCases(a: CaseRow, b: CaseRow) {
  const byDelivery = String(a.delivery_date ?? "").localeCompare(String(b.delivery_date ?? ""));
  if (byDelivery !== 0) return byDelivery;
  const byEntry = String(a.entry_date ?? "").localeCompare(String(b.entry_date ?? ""));
  if (byEntry !== 0) return byEntry;
  return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
}

function caseBelongsToList(queryKey: readonly unknown[], row: CaseRow) {
  const statusFilter = queryKey[1];
  if (statusFilter === "all") return true;
  if (statusFilter === "active" || statusFilter === "finished") return row.status === statusFilter;
  return true;
}

function upsertCaseIntoCache(queryClient: QueryClient, row: CaseRow) {
  if (!row?.id) return false;
  if (isDeleted(row.id)) return false;
  let touched = false;

  queryClient.getQueriesData<CaseRow[]>({ queryKey: ["cases"] }).forEach(([queryKey, old]) => {
    if (!Array.isArray(old)) return;
    touched = true;
    const key = Array.isArray(queryKey) ? queryKey : [queryKey];
    const belongs = caseBelongsToList(key, row);
    const exists = old.some((item) => item.id === row.id);

    if (!belongs) {
      if (exists) queryClient.setQueryData(queryKey, old.filter((item) => item.id !== row.id));
      return;
    }

    const next = exists
      ? old.map((item) => (item.id === row.id ? { ...item, ...row } : item))
      : [...old, row];

    queryClient.setQueryData(queryKey, next.sort(compareCases));
  });

  queryClient.setQueryData<CaseRow | null>(["case", row.id], (old) => (old ? { ...old, ...row } : row));
  return touched;
}

export function applyCasePatchToCache(queryClient: QueryClient, patch: CasePatch) {
  if (!patch?.id) return;
  if (isDeleted(patch.id)) return;
  const nextPatch = withStage(queryClient, patch);
  const visiblePatch = cachePatchFor(nextPatch);
  const merge = (row: any) => (row?.id === nextPatch.id ? { ...row, ...visiblePatch } : row);

  queryClient.setQueriesData<CaseRow[]>({ queryKey: ["cases"] }, (old) => {
    if (!Array.isArray(old)) return old;
    return old.map((row) => merge(row));
  });

  queryClient.setQueryData<CaseRow | null>(["case", nextPatch.id], (old) => (old ? merge(old) : old));
  queryClient.setQueryData<CaseRow[]>(["my_tasks"], (old) => {
    if (!Array.isArray(old)) return old;
    const profile = queryClient.getQueryData<{ id?: string }>(["profile"]);
    if (!profile?.id) return old.map((row) => merge(row));
    const assignments = queryClient.getQueryData<{ stage_id: string; user_id: string }[]>(["stage_assignments_all"]);
    const hasAssignmentInfo = Array.isArray(nextPatch.assigned_user_ids) || Array.isArray(assignments);
    if (!hasAssignmentInfo) return old.map((row) => merge(row));
    const belongsToMe = !nextPatch.finished_at && isMyStage(queryClient, nextPatch.current_stage_id, nextPatch.assigned_user_ids);
    const exists = old.some((row) => row.id === nextPatch.id);
    if (!belongsToMe) return old.filter((row) => row.id !== nextPatch.id);
    if (exists) return old.map((row) => merge(row));
    if (canMaterializeTask(nextPatch)) return [{ ...stripRealtimeMeta(nextPatch), ...visiblePatch } as CaseRow, ...old];
    return old;
  });
}

function removeCaseFromCache(queryClient: QueryClient, caseId: string) {
  markDeleted(caseId);
  queryClient.setQueriesData<CaseRow[]>({ queryKey: ["cases"] }, (old) => {
    if (!Array.isArray(old)) return old;
    return old.filter((row) => row.id !== caseId);
  });
  queryClient.setQueryData<CaseRow[]>(["my_tasks"], (old) => {
    if (!Array.isArray(old)) return old;
    return old.filter((row) => row.id !== caseId);
  });
}

function flush() {
  if (!subscribed || !channel || queue.length === 0) return;
  const items = queue.splice(0);
  for (const payload of items) {
    void channel.send({ type: "broadcast", event: EVENT_NAME, payload }).catch(() => queue.unshift(payload));
  }
}

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let channelGeneration = 0;

function reconnectWorkflowChannel() {
  subscribed = false;
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    channelGeneration += 1;
    if (channel) supabase.removeChannel(channel);
    channel = null;
    ensureChannel();
  }, 1500); // Aumentado para 1.5s
}

function ensureChannel() {
  if (channel) return channel;
  channelGeneration += 1;
  const token = channelGeneration;
  channel = supabase
    .channel(CHANNEL_NAME, { config: { broadcast: { self: false, ack: true } } })
    .on("broadcast", { event: EVENT_NAME }, ({ payload }) => {
      const patch = payload as CasePatch;
      listeners.forEach((listener) => listener(patch));
    })
    .subscribe((status) => {
      if (token !== channelGeneration) return;
      subscribed = status === "SUBSCRIBED";
      if (subscribed) flush();
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") reconnectWorkflowChannel();
    });
  return channel;
}

export function broadcastCaseWorkflowPatch(patch: CasePatch) {
  if (typeof window === "undefined") return;
  // Workflow peer updates stay on this device. Cross-device state comes from
  // postgres_changes under RLS; never broadcast a full clinical row publicly.
  broadcastEntity("cases", "update", {
    id: patch.id,
    current_stage_id: patch.current_stage_id,
    current_phase_id: patch.current_phase_id,
    current_stage: patch.current_stage,
    status: patch.status,
    finished_at: patch.finished_at,
    updated_at: patch.updated_at,
    assigned_user_ids: patch.assigned_user_ids,
    workflow_only: true,
    sent_at: Date.now(),
  });
}

export function useCasesRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidateLists = () => {
      // Apenas queries ativas (montadas): evita refetch em massa ao voltar de aba.
      queryClient.invalidateQueries({ queryKey: ["cases"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["my_tasks"], refetchType: "active" });
    };


    // Peer broadcast (instantâneo entre abas/dispositivos) para novos casos.
    const unsubPeer = subscribeEntity("cases", (p) => {
      if (p.op === "insert" && p.row?.id) {
        const hasFullRow = !!p.row.patient || !!p.row.delivery_date;
        if (hasFullRow) {
          upsertCaseIntoCache(queryClient, p.row as CaseRow);
          applyCasePatchToCache(queryClient, p.row as CasePatch);
        } else {
          invalidateLists();
        }
      }
      else if (p.op === "delete" && p.row?.id) removeCaseFromCache(queryClient, p.row.id);
      else if (p.op === "update" && p.row) applyCasePatchToCache(queryClient, p.row as CasePatch);
    });

    // Peer broadcast for patients → patch every case referencing that patient instantly.
    const unsubPatients = subscribeEntity("patients", (p) => {
      if (!p.row?.id) return;
      const pid = p.row.id;
      queryClient.setQueriesData<CaseRow[]>({ queryKey: ["cases"] }, (old) =>
        Array.isArray(old)
          ? old.map((c: any) => (c.patient_id === pid ? { ...c, patient: { ...(c.patient ?? {}), ...p.row } } : c))
          : old,
      );
      queryClient.setQueriesData<any>({ queryKey: ["case"] }, (old: any) =>
        old && old.patient_id === pid ? { ...old, patient: { ...(old.patient ?? {}), ...p.row } } : old,
      );
      queryClient.setQueriesData<any[]>({ queryKey: ["patients"] }, (old) =>
        Array.isArray(old) ? old.map((x: any) => (x.id === pid ? { ...x, ...p.row } : x)) : old,
      );
    });

    const dbChannel = supabase
      .channel(`cases-db-live-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "cases" }, (payload) => {
        const id = (payload.new as { id?: string } | null)?.id;
        if (!id) return invalidateLists();
        void fetchCaseById(id)
          .then((row) => {
            if (row) upsertCaseIntoCache(queryClient, row);
            else invalidateLists();
          })
          .catch(() => invalidateLists());
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cases" }, (payload) => {
        applyCasePatchToCache(queryClient, payload.new as CasePatch);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "cases" }, (payload) => {
        const id = (payload.old as { id?: string } | null)?.id;
        if (id) removeCaseFromCache(queryClient, id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, () => {
        invalidateLists();
        queryClient.invalidateQueries({ queryKey: ["patients"], refetchType: "active" });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "doctors" }, () => {
        queryClient.invalidateQueries({ queryKey: ["doctors"], refetchType: "active" });
        queryClient.invalidateQueries({ queryKey: ["cases"], refetchType: "active" });
      })

      .on("postgres_changes", { event: "*", schema: "public", table: "case_types_link" }, () => {
        invalidateLists();
      })
      .subscribe();

    return () => {
      unsubPeer();
      unsubPatients();
      supabase.removeChannel(dbChannel);
    };
  }, [queryClient]);
}
