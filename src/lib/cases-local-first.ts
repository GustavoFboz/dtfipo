import { supabase } from "@/integrations/supabase/client";
import type { CaseRow } from "./types";
import type { CreateCaseInput } from "./api";
import * as cloud from "./api";
import {
  clearDoneOutbox,
  enqueueOutbox,
  getPendingOutbox,
  isDentalFlowDesktop,
  localCacheDelete,
  localCacheGet,
  localCachePut,
  markOutbox,
  type OutboxEntry,
} from "./desktop-local";
import { requireDesktopOwnerId, resolveDesktopOwnerId } from "./desktop-identity";
import { fetchPatientLocalFirst } from "./patients-local-first";
import {
  fetchCadistasLocalFirst,
  fetchDoctorsLocalFirst,
  fetchProfileLocalFirst,
  fetchStagesLocalFirst,
} from "./reference-local-first";

const NS = "cases:v1";
const ALL_KEY = "all";
const ENTITY = "cases";

type CaseScope = "active" | "finished" | "deleted" | "all" | "archived" | "solicitacoes";
type OfflineCreateInput = CreateCaseInput & { also_arch?: "superior" | "inferior" | null };
type CaseOutboxPayload =
  | { id: string; input: OfflineCreateInput }
  | { id: string; patch: Record<string, unknown> }
  | { id: string }
  | { id: string; map: Record<string, string> };

function online() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function transient(error: unknown) {
  if (!online()) return true;
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  return ["failed to fetch", "networkerror", "network error", "load failed", "fetch failed", "connection", "offline", "timeout"].some((x) => message.includes(x));
}

async function ownerId() {
  return resolveDesktopOwnerId();
}

async function readAll(id: string) {
  const entry = await localCacheGet<CaseRow[]>(id, NS, ALL_KEY);
  return Array.isArray(entry?.payload) ? entry.payload : null;
}

async function writeAll(id: string, rows: CaseRow[]) {
  const sorted = [...rows].sort((a, b) => String(b.updated_at ?? b.entry_date ?? "").localeCompare(String(a.updated_at ?? a.entry_date ?? "")));
  await localCachePut(id, NS, ALL_KEY, sorted);
  await Promise.allSettled(sorted.map((row) => localCachePut(id, NS, row.id, row)));
}

async function upsert(id: string, row: CaseRow) {
  const current = (await readAll(id)) ?? [];
  const next = current.some((item) => item.id === row.id)
    ? current.map((item) => (item.id === row.id ? row : item))
    : [row, ...current];
  await Promise.all([
    localCachePut(id, NS, row.id, row),
    localCachePut(id, NS, ALL_KEY, next),
  ]);
}

async function removeLocal(ownerId: string, caseId: string) {
  const current = (await readAll(ownerId)) ?? [];
  await Promise.all([
    localCacheDelete(ownerId, NS, caseId),
    localCachePut(ownerId, NS, ALL_KEY, current.filter((row) => row.id !== caseId)),
  ]);
}

export async function patchCaseLocalCache(caseId: string, patch: Record<string, unknown>) {
  if (!isDentalFlowDesktop()) return;
  const owner = await ownerId();
  if (!owner) return;
  const direct = await localCacheGet<CaseRow>(owner, NS, caseId);
  const current = direct?.payload ?? (await readAll(owner))?.find((row) => row.id === caseId) ?? null;
  if (!current) return;
  await upsert(owner, { ...current, ...patch, updated_at: new Date().toISOString() } as CaseRow);
}

function applyScope(rows: CaseRow[], scope: CaseScope, filters?: { startDate?: string; endDate?: string }) {
  let result = rows;
  if (scope === "solicitacoes") result = result.filter((row) => row.status === "pendente");
  if (scope === "active") result = result.filter((row) => row.status === "em_andamento" || row.status === "active");
  if (scope === "finished") result = result.filter((row) => ["finalizado", "finished"].includes(row.status));
  if (scope === "archived") result = result.filter((row) => row.status === "arquivado");
  if (scope === "deleted") result = result.filter((row) => row.status === "cancelado");
  if (filters?.startDate) result = result.filter((row) => String(row.entry_date ?? "") >= filters.startDate!);
  if (filters?.endDate) result = result.filter((row) => String(row.entry_date ?? "") <= filters.endDate!);
  return [...result].sort((a, b) => String(b.updated_at ?? b.entry_date ?? "").localeCompare(String(a.updated_at ?? a.entry_date ?? "")));
}

export async function fetchCasesLocalFirst(
  scope: CaseScope = "active",
  filters?: { startDate?: string; endDate?: string },
): Promise<CaseRow[]> {
  if (!isDentalFlowDesktop()) return cloud.fetchCases(scope, filters);
  const id = await ownerId();
  if (!id) return [];

  if (online()) {
    try {
      const rows = await cloud.fetchCases("all");
      await writeAll(id, rows);
      return applyScope(rows, scope, filters);
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  const cached = await readAll(id);
  if (cached) return applyScope(cached, scope, filters);
  throw new Error("Os casos ainda não foram sincronizados neste computador.");
}

export async function fetchCaseByIdLocalFirst(caseId: string): Promise<CaseRow | null> {
  if (!isDentalFlowDesktop()) return cloud.fetchCaseById(caseId);
  const id = await ownerId();
  if (!id) return null;

  if (online()) {
    try {
      const row = await cloud.fetchCaseById(caseId);
      if (row) await upsert(id, row);
      return row;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  const direct = await localCacheGet<CaseRow>(id, NS, caseId);
  if (direct?.payload) return direct.payload;
  const cached = await readAll(id);
  return cached?.find((row) => row.id === caseId) ?? null;
}

export async function fetchPatientCasesLocalFirst(patientId: string): Promise<CaseRow[]> {
  if (!isDentalFlowDesktop()) return cloud.fetchPatientCases(patientId);
  const id = await ownerId();
  if (!id) return [];

  if (online()) {
    try {
      const rows = await cloud.fetchPatientCases(patientId);
      const current = (await readAll(id)) ?? [];
      const otherPatients = current.filter((row) => row.patient_id !== patientId);
      await writeAll(id, [...rows, ...otherPatients]);
      return rows;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  const cached = await readAll(id);
  return (cached ?? []).filter((row) => row.patient_id === patientId);
}

async function buildLocalCase(id: string, input: OfflineCreateInput, siblingId: string | null = null): Promise<CaseRow> {
  const [profile, patient, doctors, cadistas, stages] = await Promise.all([
    fetchProfileLocalFirst().catch(() => null),
    fetchPatientLocalFirst(input.patient_id).catch(() => null),
    fetchDoctorsLocalFirst().catch(() => []),
    fetchCadistasLocalFirst().catch(() => []),
    fetchStagesLocalFirst().catch(() => []),
  ]);
  const effectiveRole = String((profile as any)?.account_subtype || (profile as any)?.role || "").toUpperCase();
  const isSolicitante = effectiveRole === "SOLICITANTE";
  const stageId = input.current_stage_id ?? stages[0]?.id ?? null;
  const stage = stages.find((item) => item.id === stageId) ?? null;
  const createdAt = new Date().toISOString();
  const teeth = input.teeth_numbers ?? [];
  const zirc = input.teeth_zirconia ?? [];
  const diss = input.teeth_dissilicato ?? [];

  return {
    id,
    created_at: createdAt,
    updated_at: createdAt,
    patient_id: input.patient_id,
    doctor_id: input.doctor_id ?? null,
    cadista_id: input.cadista_id ?? null,
    case_type_id: input.case_type_id ?? null,
    tooth_color_id: input.tooth_color_id ?? null,
    case_label: input.case_label ?? patient?.name ?? null,
    entry_date: input.entry_date,
    delivery_date: input.delivery_date,
    finished_at: null,
    finished: false,
    status: isSolicitante ? "pendente" : "em_andamento",
    model_done: false,
    scan_done: false,
    folder_done: false,
    folder_url: input.folder_url ?? null,
    notes: input.notes ?? null,
    arch: input.arch ?? null,
    sibling_case_id: siblingId,
    current_stage_id: stageId,
    current_phase_id: stage?.phase_id ?? null,
    reopened_at: null,
    reopened_count: 0,
    teeth_numbers: teeth,
    elements_count: teeth.length,
    elements_zirconia: zirc.length,
    elements_dissilicato: diss.length,
    teeth_zirconia: zirc,
    teeth_dissilicato: diss,
    patient: patient as any,
    doctor: doctors.find((item) => item.id === input.doctor_id) ?? null,
    cadista: cadistas.find((item) => item.id === input.cadista_id) ?? null,
    case_type: null,
    tooth_color: null,
    current_stage: stage as any,
    case_stages: [],
    case_components: [],
    tooth_case_types: input.tooth_case_types ?? {},
    implant_system_id: input.implant_system_id ?? null,
    implant_system_ids: input.implant_system_ids ?? [],
    implant_teeth: input.implant_teeth ?? [],
    tooth_implant_systems: input.tooth_implant_systems ?? {},
    scan_jig_id: input.scan_jig_id ?? null,
    has_provisional: input.has_provisional ?? false,
    has_mockup: input.has_mockup ?? false,
    requested_by: isSolicitante ? (input.requested_by ?? (profile as any)?.id ?? null) : null,
  };
}

async function queueLocalCaseCreate(owner: string, input: OfflineCreateInput, siblingId: string | null = null) {
  const id = crypto.randomUUID();
  const row = await buildLocalCase(id, input, siblingId);
  await upsert(owner, row);
  const syncInput = { ...input, also_arch: null } as OfflineCreateInput;
  await enqueueOutbox({ ownerId: owner, entityType: ENTITY, entityId: id, operation: "create", payload: { id, input: syncInput } });
  return row;
}

export async function createCaseLocalFirst(input: OfflineCreateInput) {
  if (!isDentalFlowDesktop()) return cloud.createCase(input);
  const owner = await requireDesktopOwnerId();

  if (online()) {
    try {
      const created = await cloud.createCase(input);
      if (created?.id) {
        const full = await cloud.fetchCaseById(created.id).catch(() => null);
        if (full) await upsert(owner, full);
      }
      return created;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  if (input.arch && input.also_arch && input.arch !== input.also_arch) {
    const idA = crypto.randomUUID();
    const idB = crypto.randomUUID();
    const inputA = { ...input, arch: input.arch, also_arch: null } as OfflineCreateInput;
    const inputB = { ...input, arch: input.also_arch, also_arch: null } as OfflineCreateInput;
    const [rowA, rowB] = await Promise.all([
      buildLocalCase(idA, inputA, idB),
      buildLocalCase(idB, inputB, idA),
    ]);
    await upsert(owner, rowA);
    await upsert(owner, rowB);
    await enqueueOutbox({ ownerId: owner, entityType: ENTITY, entityId: idA, operation: "create", payload: { id: idA, input: inputA } });
    await enqueueOutbox({ ownerId: owner, entityType: ENTITY, entityId: idB, operation: "create", payload: { id: idB, input: inputB } });
    await enqueueOutbox({ ownerId: owner, entityType: ENTITY, entityId: idA, operation: "update", payload: { id: idA, patch: { sibling_case_id: idB } } });
    await enqueueOutbox({ ownerId: owner, entityType: ENTITY, entityId: idB, operation: "update", payload: { id: idB, patch: { sibling_case_id: idA } } });
    return rowA as any;
  }

  return queueLocalCaseCreate(owner, input);
}

export async function updateCaseLocalFirst(id: string, patch: Record<string, unknown>) {
  if (!isDentalFlowDesktop()) return cloud.updateCase(id, patch);
  const owner = await requireDesktopOwnerId();

  if (online()) {
    try {
      await cloud.updateCase(id, patch);
      const full = await cloud.fetchCaseById(id).catch(() => null);
      if (full) await upsert(owner, full);
      return;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  await patchCaseLocalCache(id, patch);
  await enqueueOutbox({ ownerId: owner, entityType: ENTITY, entityId: id, operation: "update", payload: { id, patch } });
}

export async function finishCaseLocalFirst(id: string) {
  if (!isDentalFlowDesktop()) return cloud.finishCase(id);
  const owner = await requireDesktopOwnerId();
  if (online()) {
    try {
      await cloud.finishCase(id);
      const full = await cloud.fetchCaseById(id).catch(() => null);
      if (full) await upsert(owner, full);
      return;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }
  await patchCaseLocalCache(id, { status: "finalizado", finished_at: new Date().toISOString(), finished: true });
  await enqueueOutbox({ ownerId: owner, entityType: ENTITY, entityId: id, operation: "finish", payload: { id } });
}

export async function reopenCaseLocalFirst(id: string) {
  if (!isDentalFlowDesktop()) return cloud.reopenCase(id);
  const owner = await requireDesktopOwnerId();
  if (online()) {
    try {
      await cloud.reopenCase(id);
      const full = await cloud.fetchCaseById(id).catch(() => null);
      if (full) await upsert(owner, full);
      return;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }
  const current = await fetchCaseByIdLocalFirst(id);
  await patchCaseLocalCache(id, {
    status: "em_andamento",
    finished_at: null,
    finished: false,
    reopened_at: new Date().toISOString(),
    reopened_count: Number(current?.reopened_count ?? 0) + 1,
  });
  await enqueueOutbox({ ownerId: owner, entityType: ENTITY, entityId: id, operation: "reopen", payload: { id } });
}

export async function deleteCaseLocalFirst(id: string) {
  if (!isDentalFlowDesktop()) return cloud.deleteCase(id);
  const owner = await requireDesktopOwnerId();
  if (online()) {
    try {
      await cloud.deleteCase(id);
      await removeLocal(owner, id);
      return;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }
  await removeLocal(owner, id);
  await enqueueOutbox({ ownerId: owner, entityType: ENTITY, entityId: id, operation: "delete", payload: { id } });
}

export async function updateCaseTiBasesLocalFirst(caseId: string, map: Record<string, string>) {
  if (!isDentalFlowDesktop()) return cloud.updateCaseTiBases(caseId, map);
  const owner = await requireDesktopOwnerId();
  if (online()) {
    try {
      await cloud.updateCaseTiBases(caseId, map);
      await patchCaseLocalCache(caseId, { tooth_ti_bases: map });
      return;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }
  await patchCaseLocalCache(caseId, { tooth_ti_bases: map });
  await enqueueOutbox({ ownerId: owner, entityType: ENTITY, entityId: caseId, operation: "update_ti_bases", payload: { id: caseId, map } });
}

async function processCaseEntry(entry: OutboxEntry<CaseOutboxPayload>) {
  const payload: any = entry.payload ?? {};
  switch (entry.operation) {
    case "create": {
      const id = String(payload.id ?? entry.entity_id);
      const existing = await cloud.fetchCaseById(id).catch(() => null);
      if (existing) return;
      await cloud.createCase({ ...(payload.input ?? {}), id, also_arch: null } as any);
      return;
    }
    case "update":
      await cloud.updateCase(String(payload.id ?? entry.entity_id), payload.patch ?? {});
      return;
    case "finish":
      await cloud.finishCase(String(payload.id ?? entry.entity_id));
      return;
    case "reopen":
      await cloud.reopenCase(String(payload.id ?? entry.entity_id));
      return;
    case "delete":
      await cloud.deleteCase(String(payload.id ?? entry.entity_id));
      return;
    case "update_ti_bases":
      await cloud.updateCaseTiBases(String(payload.id ?? entry.entity_id), payload.map ?? {});
      return;
    default:
      throw new Error(`Operação offline de caso não suportada: ${entry.operation}`);
  }
}

export async function syncPendingCaseChanges() {
  if (!isDentalFlowDesktop() || !online()) return { processed: 0, failed: 0, conflicts: 0, cached: 0 };
  const owner = await ownerId();
  if (!owner) return { processed: 0, failed: 0, conflicts: 0, cached: 0 };
  const pending = (await getPendingOutbox<CaseOutboxPayload>(owner, 1000)).filter((entry) => entry.entity_type === ENTITY);
  let processed = 0;
  let failed = 0;

  for (const entry of pending) {
    try {
      await markOutbox(owner, entry.id, "syncing");
      await processCaseEntry(entry);
      await markOutbox(owner, entry.id, "done");
      processed += 1;
    } catch (error) {
      failed += 1;
      await markOutbox(owner, entry.id, "error", String((error as any)?.message ?? error));
    }
  }
  await clearDoneOutbox(owner);
  const cached = await warmCaseLocalCache().catch(() => 0);
  return { processed, failed, conflicts: 0, cached };
}

export async function warmCaseLocalCache() {
  if (!isDentalFlowDesktop() || !online()) return 0;
  const id = await ownerId();
  if (!id) return 0;
  const rows = await cloud.fetchCases("all");
  await writeAll(id, rows);
  return rows.length;
}
