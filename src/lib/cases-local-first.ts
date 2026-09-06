import { supabase } from "@/integrations/supabase/client";
import type { CaseRow } from "./types";
import * as cloud from "./api";
import { isDentalFlowDesktop, localCacheGet, localCachePut } from "./desktop-local";

const NS = "cases:v1";
const ALL_KEY = "all";

type CaseScope = "active" | "finished" | "deleted" | "all" | "archived" | "solicitacoes";

function online() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function transient(error: unknown) {
  if (!online()) return true;
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  return ["failed to fetch", "networkerror", "network error", "load failed", "fetch failed", "connection", "offline"].some((x) => message.includes(x));
}

async function ownerId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

async function readAll(id: string) {
  const entry = await localCacheGet<CaseRow[]>(id, NS, ALL_KEY);
  return Array.isArray(entry?.payload) ? entry.payload : null;
}

async function writeAll(id: string, rows: CaseRow[]) {
  await localCachePut(id, NS, ALL_KEY, rows);
  await Promise.allSettled(rows.map((row) => localCachePut(id, NS, row.id, row)));
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

function applyScope(rows: CaseRow[], scope: CaseScope, filters?: { startDate?: string; endDate?: string }) {
  let result = rows;
  if (scope === "solicitacoes") result = result.filter((row) => row.status === "pendente");
  if (scope === "active") result = result.filter((row) => row.status === "em_andamento");
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

export async function warmCaseLocalCache() {
  if (!isDentalFlowDesktop() || !online()) return 0;
  const id = await ownerId();
  if (!id) return 0;
  const rows = await cloud.fetchCases("all");
  await writeAll(id, rows);
  return rows.length;
}
