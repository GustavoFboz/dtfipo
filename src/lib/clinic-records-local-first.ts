import { supabase } from "@/integrations/supabase/client";
import type { ClinicPatientEvolution, ClinicPatientTreatment } from "./clinic";
import * as cloud from "./clinic";
import { fetchPatientCasesLocalFirst } from "./cases-local-first";
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

const FINANCIAL_NS = "clinic-financial:v1";
const EVOLUTION_NS = "clinic-evolutions:v1";
const DASHBOARD_NS = "clinic-dashboard:v1";
const ROLE_NS = "clinic-role-permissions:v1";
const ALL_KEY = "all";
const FINANCIAL_ENTITY = "clinic_financial_entries";
const EVOLUTION_ENTITY = "clinic_patient_evolutions";
const ROLE_ENTITY = "clinic_role_permissions";

type FinancialRow = Record<string, any> & { id: string; patient_id?: string | null; due_date?: string | null; created_at?: string | null };
type RolePermissionRow = Record<string, any> & { id?: string; clinic_id: string; role: string; permission: string; allowed: boolean };

export type ClinicRecordsSyncSummary = {
  processed: number;
  failed: number;
  conflicts: number;
  financialCached: number;
  evolutionsCached: number;
  dashboardDatasetsCached: number;
};

function online() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function transient(error: unknown) {
  if (!online()) return true;
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  return ["failed to fetch", "networkerror", "network error", "load failed", "fetch failed", "connection", "offline"].some((x) => message.includes(x));
}

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  throw new Error("Este dispositivo não oferece geração segura de identificadores locais.");
}

async function ownerId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

async function requireOwnerId() {
  const id = await ownerId();
  if (!id) throw new Error("Sua sessão local não está disponível. Conecte-se novamente para revalidar este dispositivo.");
  return id;
}

async function readList<T>(owner: string, ns: string, key = ALL_KEY): Promise<T[]> {
  const entry = await localCacheGet<T[]>(owner, ns, key);
  return Array.isArray(entry?.payload) ? entry.payload : [];
}

async function writeList<T>(owner: string, ns: string, rows: T[], key = ALL_KEY) {
  await localCachePut(owner, ns, key, rows);
}

async function upsertById<T extends { id: string }>(owner: string, ns: string, row: T, key = ALL_KEY) {
  const current = await readList<T>(owner, ns, key);
  const next = current.some((item) => item.id === row.id)
    ? current.map((item) => (item.id === row.id ? row : item))
    : [row, ...current];
  await writeList(owner, ns, next, key);
}

async function removeById<T extends { id: string }>(owner: string, ns: string, id: string, key = ALL_KEY) {
  const current = await readList<T>(owner, ns, key);
  await writeList(owner, ns, current.filter((item) => item.id !== id), key);
}

function filterMonth(rows: FinancialRow[], month?: string) {
  if (!month) return rows;
  return rows.filter((row) => String(row.due_date ?? row.created_at ?? "").slice(0, 7) === month);
}

export async function fetchClinicFinancialEntriesLocalFirst(month?: string) {
  if (!isDentalFlowDesktop()) return cloud.fetchClinicFinancialEntries(month);
  const owner = await requireOwnerId();

  if (online()) {
    try {
      const rows = await cloud.fetchClinicFinancialEntries() as FinancialRow[];
      await writeList(owner, FINANCIAL_NS, rows);
      return filterMonth(rows, month);
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  return filterMonth(await readList<FinancialRow>(owner, FINANCIAL_NS), month);
}

export async function fetchClinicPatientFinancialEntriesLocalFirst(patientId: string) {
  const rows = await fetchClinicFinancialEntriesLocalFirst();
  return rows.filter((row: any) => row.patient_id === patientId);
}

export async function saveClinicFinancialEntryLocalFirst(input: Record<string, any>) {
  if (!isDentalFlowDesktop()) return cloud.saveClinicFinancialEntry(input as any);
  const owner = await requireOwnerId();
  const current = await readList<FinancialRow>(owner, FINANCIAL_NS);
  const existing = input.id ? current.find((row) => row.id === input.id) ?? null : null;
  const id = input.id ?? uuid();
  const local: FinancialRow = {
    ...existing,
    ...input,
    id,
    created_by: existing?.created_by ?? owner,
    paid_at: input.status === "paid" ? (existing?.paid_at ?? new Date().toISOString()) : null,
    created_at: existing?.created_at ?? new Date().toISOString(),
  };
  const operation = existing || input.id ? "update" : "create";

  const queue = async () => {
    await upsertById(owner, FINANCIAL_NS, local);
    await enqueueOutbox({ ownerId: owner, entityType: FINANCIAL_ENTITY, entityId: id, operation, payload: { ...input, id } });
    return local;
  };

  if (!online()) return queue();
  try {
    const saved = await cloud.saveClinicFinancialEntry(input as any) as FinancialRow;
    await upsertById(owner, FINANCIAL_NS, saved);
    return saved;
  } catch (error) {
    if (transient(error)) return queue();
    throw error;
  }
}

export async function fetchClinicPatientEvolutionsLocalFirst(patientId: string): Promise<ClinicPatientEvolution[]> {
  if (!isDentalFlowDesktop()) return cloud.fetchClinicPatientEvolutions(patientId);
  const owner = await requireOwnerId();

  if (online()) {
    try {
      const rows = await cloud.fetchClinicPatientEvolutions(patientId);
      const current = await readList<ClinicPatientEvolution>(owner, EVOLUTION_NS);
      const merged = [...rows, ...current.filter((row) => row.patient_id !== patientId)];
      await writeList(owner, EVOLUTION_NS, merged);
      return rows;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  const cached = await readList<ClinicPatientEvolution>(owner, EVOLUTION_NS);
  return cached.filter((row) => row.patient_id === patientId);
}

export async function saveClinicPatientEvolutionLocalFirst(input: Record<string, any>) {
  if (!isDentalFlowDesktop()) return cloud.saveClinicPatientEvolution(input as any);
  const owner = await requireOwnerId();
  const description = String(input.description ?? "").trim();
  if (!description) throw new Error("Descreva a evolução clínica.");
  const id = input.id ?? uuid();
  const local: ClinicPatientEvolution = {
    id,
    clinic_id: String(input.clinic_id),
    patient_id: String(input.patient_id),
    author_id: owner,
    case_id: input.case_id ?? null,
    appointment_id: input.appointment_id ?? null,
    teeth_numbers: input.teeth_numbers ?? [],
    procedure: input.procedure ?? null,
    description,
    created_at: input.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const queue = async () => {
    await upsertById(owner, EVOLUTION_NS, local);
    await enqueueOutbox({ ownerId: owner, entityType: EVOLUTION_ENTITY, entityId: id, operation: "create", payload: local });
    return local;
  };

  if (!online()) return queue();
  try {
    const saved = await cloud.saveClinicPatientEvolution(input as any);
    await upsertById(owner, EVOLUTION_NS, saved);
    return saved;
  } catch (error) {
    if (transient(error)) return queue();
    throw error;
  }
}

export async function deleteClinicPatientEvolutionLocalFirst(id: string) {
  if (!isDentalFlowDesktop()) return cloud.deleteClinicPatientEvolution(id);
  const owner = await requireOwnerId();

  const queue = async () => {
    await removeById<ClinicPatientEvolution>(owner, EVOLUTION_NS, id);
    await enqueueOutbox({ ownerId: owner, entityType: EVOLUTION_ENTITY, entityId: id, operation: "delete", payload: { id } });
  };

  if (!online()) return queue();
  try {
    await cloud.deleteClinicPatientEvolution(id);
    await removeById<ClinicPatientEvolution>(owner, EVOLUTION_NS, id);
  } catch (error) {
    if (transient(error)) return queue();
    throw error;
  }
}

export async function fetchClinicLowStockItemsLocalFirst(limit = 6) {
  if (!isDentalFlowDesktop()) return cloud.fetchClinicLowStockItems(limit);
  const owner = await requireOwnerId();
  const key = "low-stock";
  if (online()) {
    try {
      const rows = await cloud.fetchClinicLowStockItems(500);
      await writeList(owner, DASHBOARD_NS, rows, key);
      return rows.slice(0, limit);
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }
  return (await readList<any>(owner, DASHBOARD_NS, key)).slice(0, limit);
}

export async function fetchClinicActiveTreatmentsLocalFirst() {
  if (!isDentalFlowDesktop()) return cloud.fetchClinicActiveTreatments();
  const owner = await requireOwnerId();
  const key = "active-treatments";
  if (online()) {
    try {
      const rows = await cloud.fetchClinicActiveTreatments();
      await writeList(owner, DASHBOARD_NS, rows, key);
      return rows;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }
  return readList<any>(owner, DASHBOARD_NS, key);
}

export async function fetchClinicPatientTreatmentsLocalFirst(patientId: string): Promise<ClinicPatientTreatment[]> {
  if (!isDentalFlowDesktop()) return cloud.fetchClinicPatientTreatments(patientId);
  const owner = await requireOwnerId();
  const key = `patient-treatments:${patientId}`;
  if (online()) {
    try {
      const rows = await cloud.fetchClinicPatientTreatments(patientId);
      await writeList(owner, DASHBOARD_NS, rows, key);
      return rows;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  const cached = await readList<ClinicPatientTreatment>(owner, DASHBOARD_NS, key);
  if (cached.length) return cached;
  const cases = await fetchPatientCasesLocalFirst(patientId);
  return cases as unknown as ClinicPatientTreatment[];
}

export async function fetchClinicRolePermissionsLocalFirst(clinicId: string) {
  if (!isDentalFlowDesktop()) return cloud.fetchClinicRolePermissions(clinicId);
  const owner = await requireOwnerId();
  const key = `clinic:${clinicId}`;
  if (online()) {
    try {
      const rows = await cloud.fetchClinicRolePermissions(clinicId);
      await writeList(owner, ROLE_NS, rows, key);
      return rows;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }
  return readList<RolePermissionRow>(owner, ROLE_NS, key);
}

export async function setClinicRolePermissionLocalFirst(clinicId: string, role: string, permission: any, allowed: boolean) {
  if (!isDentalFlowDesktop()) return cloud.setClinicRolePermission(clinicId, role, permission, allowed);
  const owner = await requireOwnerId();
  const normalizedRole = role.toUpperCase();
  const key = `clinic:${clinicId}`;
  const current = await readList<RolePermissionRow>(owner, ROLE_NS, key);
  const syntheticId = `${clinicId}:${normalizedRole}:${String(permission)}`;
  const nextRow: RolePermissionRow = { id: syntheticId, clinic_id: clinicId, role: normalizedRole, permission: String(permission), allowed };

  const queue = async () => {
    const next = current.filter((row) => !(row.role === normalizedRole && row.permission === permission));
    await writeList(owner, ROLE_NS, [nextRow, ...next], key);
    await enqueueOutbox({ ownerId: owner, entityType: ROLE_ENTITY, entityId: syntheticId, operation: "upsert", payload: nextRow });
  };

  if (!online()) return queue();
  try {
    await cloud.setClinicRolePermission(clinicId, normalizedRole, permission, allowed);
    const rows = await cloud.fetchClinicRolePermissions(clinicId);
    await writeList(owner, ROLE_NS, rows, key);
  } catch (error) {
    if (transient(error)) return queue();
    throw error;
  }
}

async function syncEntry(owner: string, entry: OutboxEntry<Record<string, any>>) {
  await markOutbox(owner, entry.id, "syncing");
  try {
    if (entry.entity_type === FINANCIAL_ENTITY) {
      const payload = { ...entry.payload };
      const id = entry.entity_id ?? payload.id;
      if (!id) throw new Error("Lançamento financeiro local sem identificador.");
      if (entry.operation === "create") {
        const { data, error } = await (supabase as any).from(FINANCIAL_ENTITY).upsert({ ...payload, id }, { onConflict: "id" }).select().single();
        if (error) throw error;
        await upsertById(owner, FINANCIAL_NS, data as FinancialRow);
      } else if (entry.operation === "update") {
        delete payload.id;
        const { data, error } = await (supabase as any).from(FINANCIAL_ENTITY).update(payload).eq("id", id).select().maybeSingle();
        if (error) throw error;
        if (!data) {
          await markOutbox(owner, entry.id, "conflict", "O lançamento financeiro não existe mais no servidor.");
          return "conflict" as const;
        }
        await upsertById(owner, FINANCIAL_NS, data as FinancialRow);
      }
    } else if (entry.entity_type === EVOLUTION_ENTITY) {
      const payload = { ...entry.payload };
      const id = entry.entity_id ?? payload.id;
      if (!id) throw new Error("Evolução clínica local sem identificador.");
      if (entry.operation === "create") {
        const { data, error } = await (supabase as any).from(EVOLUTION_ENTITY).upsert({ ...payload, id }, { onConflict: "id" }).select().single();
        if (error) throw error;
        await upsertById(owner, EVOLUTION_NS, data as ClinicPatientEvolution);
      } else if (entry.operation === "delete") {
        const { error } = await (supabase as any).from(EVOLUTION_ENTITY).delete().eq("id", id);
        if (error) throw error;
        await removeById<ClinicPatientEvolution>(owner, EVOLUTION_NS, id);
      }
    } else if (entry.entity_type === ROLE_ENTITY) {
      const { id: _synthetic, ...payload } = entry.payload;
      const { error } = await (supabase as any).from(ROLE_ENTITY).upsert(payload, { onConflict: "clinic_id,role,permission" });
      if (error) throw error;
    } else {
      return "skip" as const;
    }

    await markOutbox(owner, entry.id, "done");
    return "done" as const;
  } catch (error) {
    const message = String((error as any)?.message ?? error ?? "Erro de sincronização clínica");
    if (transient(error)) {
      await markOutbox(owner, entry.id, "pending", message);
      return "network" as const;
    }
    await markOutbox(owner, entry.id, "error", message);
    return "error" as const;
  }
}

export async function warmClinicRecordsLocalCache(): Promise<{ financialCached: number; evolutionsCached: number; dashboardDatasetsCached: number }> {
  if (!isDentalFlowDesktop() || !online()) return { financialCached: 0, evolutionsCached: 0, dashboardDatasetsCached: 0 };
  const owner = await ownerId();
  if (!owner) return { financialCached: 0, evolutionsCached: 0, dashboardDatasetsCached: 0 };

  let financialCached = 0;
  let evolutionsCached = 0;
  let dashboardDatasetsCached = 0;

  try {
    const financial = await cloud.fetchClinicFinancialEntries() as FinancialRow[];
    await writeList(owner, FINANCIAL_NS, financial);
    financialCached = financial.length;
  } catch (error) {
    if (!transient(error)) console.warn("[DentalFlow Desktop] Falha ao cachear financeiro", error);
  }

  try {
    const { data, error } = await (supabase as any).from(EVOLUTION_ENTITY).select("*").order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as ClinicPatientEvolution[];
    await writeList(owner, EVOLUTION_NS, rows);
    evolutionsCached = rows.length;
  } catch (error) {
    if (!transient(error)) console.warn("[DentalFlow Desktop] Falha ao cachear evoluções", error);
  }

  const dashboard = await Promise.allSettled([
    fetchClinicLowStockItemsLocalFirst(500),
    fetchClinicActiveTreatmentsLocalFirst(),
  ]);
  dashboardDatasetsCached = dashboard.filter((result) => result.status === "fulfilled").length;

  return { financialCached, evolutionsCached, dashboardDatasetsCached };
}

export async function syncPendingClinicRecordChanges(): Promise<ClinicRecordsSyncSummary> {
  if (!isDentalFlowDesktop() || !online()) {
    return { processed: 0, failed: 0, conflicts: 0, financialCached: 0, evolutionsCached: 0, dashboardDatasetsCached: 0 };
  }
  const owner = await ownerId();
  if (!owner) return { processed: 0, failed: 0, conflicts: 0, financialCached: 0, evolutionsCached: 0, dashboardDatasetsCached: 0 };

  const supported = new Set([FINANCIAL_ENTITY, EVOLUTION_ENTITY, ROLE_ENTITY]);
  const entries = (await getPendingOutbox<Record<string, any>>(owner, 500)).filter((entry) => supported.has(entry.entity_type));
  let processed = 0;
  let failed = 0;
  let conflicts = 0;

  for (const entry of entries) {
    const result = await syncEntry(owner, entry);
    if (result === "done") processed += 1;
    if (result === "error") failed += 1;
    if (result === "conflict") conflicts += 1;
    if (result === "network") break;
  }

  if (processed > 0) await clearDoneOutbox(owner);
  const warmed = await warmClinicRecordsLocalCache();
  return { processed, failed, conflicts, ...warmed };
}
