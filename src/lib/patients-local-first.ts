import { supabase } from "@/integrations/supabase/client";
import type { Patient } from "@/lib/types";
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
} from "@/lib/desktop-local";
import { requireDesktopOwnerId, resolveDesktopOwnerId } from "@/lib/desktop-identity";

const PATIENT_CACHE_NAMESPACE = "patients:v1";
const PATIENT_LIST_KEY = "all";
const PATIENT_ENTITY = "patients";

export type PatientWriteResult = {
  patient: Patient;
  queued: boolean;
  operation: "create" | "update";
};

export type PatientDeleteResult = {
  id: string;
  queued: boolean;
};

export type PatientSyncSummary = {
  processed: number;
  failed: number;
  conflicts: number;
};

function isOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function isTransientNetworkError(error: unknown) {
  if (!isOnline()) return true;
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  return [
    "failed to fetch",
    "networkerror",
    "network error",
    "load failed",
    "fetch failed",
    "connection",
    "offline",
    "timeout",
  ].some((needle) => message.includes(needle));
}

function makeUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  throw new Error("Este dispositivo não oferece geração segura de identificadores locais.");
}

async function getOwnerId() {
  return resolveDesktopOwnerId();
}

async function requireOwnerId() {
  return requireDesktopOwnerId();
}

function patientSort(a: Patient, b: Patient) {
  return String(a.name ?? "").localeCompare(String(b.name ?? ""), "pt-BR", { sensitivity: "base" });
}

async function cloudFetchPatients(): Promise<Patient[]> {
  const { data, error } = await supabase
    .from("patients")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as Patient[];
}

async function cloudFetchPatient(id: string): Promise<Patient | null> {
  const { data, error } = await supabase
    .from("patients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as Patient | null;
}

async function readCachedPatients(ownerId: string): Promise<Patient[] | null> {
  const entry = await localCacheGet<Patient[]>(ownerId, PATIENT_CACHE_NAMESPACE, PATIENT_LIST_KEY);
  return Array.isArray(entry?.payload) ? entry.payload : null;
}

async function readCachedPatient(ownerId: string, id: string): Promise<Patient | null> {
  const direct = await localCacheGet<Patient>(ownerId, PATIENT_CACHE_NAMESPACE, id);
  if (direct?.payload) return direct.payload;
  const list = await readCachedPatients(ownerId);
  return list?.find((patient) => patient.id === id) ?? null;
}

/**
 * Never let an ambiguous zero-row cloud response erase a previously verified
 * non-empty local patient list. Cloud Login/RLS can briefly answer with an empty
 * result while the authenticated profile is still being rehydrated. Explicit
 * patient deletes update the local list through removeCachedPatient, so a real
 * user-initiated deletion is not blocked by this safety rail.
 */
async function cachePatientSnapshot(ownerId: string, patients: Patient[]): Promise<Patient[]> {
  const current = await readCachedPatients(ownerId);
  if (patients.length === 0 && current && current.length > 0) {
    console.warn("[DentalFlow Desktop] Resposta vazia de pacientes ignorada para preservar o último snapshot local válido.");
    return current;
  }

  const sorted = [...patients].sort(patientSort);
  await localCachePut(ownerId, PATIENT_CACHE_NAMESPACE, PATIENT_LIST_KEY, sorted);
  await Promise.allSettled(
    sorted.map((patient) => localCachePut(ownerId, PATIENT_CACHE_NAMESPACE, patient.id, patient)),
  );
  return sorted;
}

async function upsertCachedPatient(ownerId: string, patient: Patient) {
  const current = (await readCachedPatients(ownerId)) ?? [];
  const next = current.some((item) => item.id === patient.id)
    ? current.map((item) => (item.id === patient.id ? patient : item))
    : [...current, patient];
  await Promise.all([
    localCachePut(ownerId, PATIENT_CACHE_NAMESPACE, patient.id, patient),
    localCachePut(ownerId, PATIENT_CACHE_NAMESPACE, PATIENT_LIST_KEY, next.sort(patientSort)),
  ]);
}

async function removeCachedPatient(ownerId: string, id: string) {
  const current = (await readCachedPatients(ownerId)) ?? [];
  await Promise.all([
    localCacheDelete(ownerId, PATIENT_CACHE_NAMESPACE, id),
    localCachePut(
      ownerId,
      PATIENT_CACHE_NAMESPACE,
      PATIENT_LIST_KEY,
      current.filter((patient) => patient.id !== id),
    ),
  ]);
}

function buildLocalPatient(
  id: string,
  values: Record<string, unknown>,
  existing?: Patient | null,
): Patient {
  return {
    id,
    name: String(values.name ?? existing?.name ?? ""),
    photo_url: (values.photo_url as string | null | undefined) ?? existing?.photo_url ?? null,
    notes: (values.notes as string | null | undefined) ?? existing?.notes ?? null,
    first_name: (values.first_name as string | null | undefined) ?? existing?.first_name ?? null,
    last_name: (values.last_name as string | null | undefined) ?? existing?.last_name ?? null,
    age: Number(values.age ?? existing?.age ?? 0),
    birth_date: (values.birth_date as string | null | undefined) ?? existing?.birth_date ?? null,
    gender: (values.gender as string | null | undefined) ?? existing?.gender ?? null,
    cpf: (values.cpf as string | null | undefined) ?? existing?.cpf ?? null,
    rg: (values.rg as string | null | undefined) ?? existing?.rg ?? null,
    phone: (values.phone as string | null | undefined) ?? existing?.phone ?? null,
    email: (values.email as string | null | undefined) ?? existing?.email ?? null,
    address: (values.address as string | null | undefined) ?? existing?.address ?? null,
    medical_history: (values.medical_history as string | null | undefined) ?? existing?.medical_history ?? null,
    allergies: (values.allergies as string | null | undefined) ?? existing?.allergies ?? null,
    medications: (values.medications as string | null | undefined) ?? existing?.medications ?? null,
    clinical_notes: (values.clinical_notes as string | null | undefined) ?? existing?.clinical_notes ?? null,
    created_at: existing?.created_at ?? new Date().toISOString(),
    cases: existing?.cases ?? null,
  };
}

export async function fetchPatientsLocalFirst(): Promise<Patient[]> {
  if (!isDentalFlowDesktop()) return cloudFetchPatients();

  const ownerId = await getOwnerId();
  if (!ownerId) return [];

  if (isOnline()) {
    try {
      const remote = await cloudFetchPatients();
      return await cachePatientSnapshot(ownerId, remote);
    } catch (error) {
      if (!isTransientNetworkError(error)) throw error;
    }
  }

  const cached = await readCachedPatients(ownerId);
  if (cached) return cached;

  throw new Error("Os pacientes ainda não foram sincronizados neste computador. Conecte-se à internet ao menos uma vez.");
}

export async function fetchPatientLocalFirst(id: string): Promise<Patient | null> {
  if (!isDentalFlowDesktop()) return cloudFetchPatient(id);

  const ownerId = await getOwnerId();
  if (!ownerId) return null;

  if (isOnline()) {
    try {
      const remote = await cloudFetchPatient(id);
      if (remote) await upsertCachedPatient(ownerId, remote);
      if (!remote) {
        const cached = await readCachedPatient(ownerId, id);
        if (cached) return cached;
      }
      return remote;
    } catch (error) {
      if (!isTransientNetworkError(error)) throw error;
    }
  }

  return readCachedPatient(ownerId, id);
}

export async function warmPatientLocalCache() {
  if (!isDentalFlowDesktop() || !isOnline()) return 0;
  const ownerId = await getOwnerId();
  if (!ownerId) return 0;
  const patients = await cloudFetchPatients();
  const snapshot = await cachePatientSnapshot(ownerId, patients);
  return snapshot.length;
}

export async function savePatientLocalFirst(
  values: Record<string, unknown>,
  existing?: Patient | null,
): Promise<PatientWriteResult> {
  const ownerId = await requireOwnerId();
  const operation = existing ? "update" : "create";
  const id = existing?.id ?? makeUuid();
  const localPatient = buildLocalPatient(id, values, existing);

  const persistOffline = async () => {
    if (!isDentalFlowDesktop()) {
      throw new Error("Não foi possível acessar o servidor para salvar o paciente.");
    }
    await upsertCachedPatient(ownerId, localPatient);
    await enqueueOutbox({
      ownerId,
      entityType: PATIENT_ENTITY,
      entityId: id,
      operation,
      payload: operation === "create" ? { id, ...values } : values,
      baseVersion: null,
    });
    return { patient: localPatient, queued: true, operation } as PatientWriteResult;
  };

  if (!isOnline()) return persistOffline();

  try {
    if (operation === "create") {
      const { data, error } = await supabase
        .from("patients")
        .insert({ id, ...values } as any)
        .select("*")
        .single();
      if (error) throw error;
      const patient = data as unknown as Patient;
      if (isDentalFlowDesktop()) await upsertCachedPatient(ownerId, patient);
      return { patient, queued: false, operation };
    }

    const { data, error } = await supabase
      .from("patients")
      .update(values as any)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    const patient = data as unknown as Patient;
    if (isDentalFlowDesktop()) await upsertCachedPatient(ownerId, patient);
    return { patient, queued: false, operation };
  } catch (error) {
    if (isTransientNetworkError(error)) return persistOffline();
    throw error;
  }
}

export async function deletePatientLocalFirst(id: string): Promise<PatientDeleteResult> {
  const ownerId = await requireOwnerId();

  const persistOffline = async () => {
    if (!isDentalFlowDesktop()) {
      throw new Error("Não foi possível acessar o servidor para excluir o paciente.");
    }
    await removeCachedPatient(ownerId, id);
    await enqueueOutbox({
      ownerId,
      entityType: PATIENT_ENTITY,
      entityId: id,
      operation: "delete",
      payload: { id },
    });
    return { id, queued: true };
  };

  if (!isOnline()) return persistOffline();

  try {
    const { error } = await supabase.from("patients").delete().eq("id", id);
    if (error) throw error;
    if (isDentalFlowDesktop()) await removeCachedPatient(ownerId, id);
    return { id, queued: false };
  } catch (error) {
    if (isTransientNetworkError(error)) return persistOffline();
    throw error;
  }
}

async function syncPatientEntry(ownerId: string, entry: OutboxEntry<Record<string, unknown>>) {
  await markOutbox(ownerId, entry.id, "syncing");

  try {
    if (entry.operation === "create") {
      const { data, error } = await supabase
        .from("patients")
        .upsert(entry.payload as any, { onConflict: "id" })
        .select("*")
        .single();
      if (error) throw error;
      await upsertCachedPatient(ownerId, data as unknown as Patient);
    } else if (entry.operation === "update") {
      if (!entry.entity_id) throw new Error("Alteração local sem identificador de paciente.");
      const { data, error } = await supabase
        .from("patients")
        .update(entry.payload as any)
        .eq("id", entry.entity_id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        await markOutbox(ownerId, entry.id, "conflict", "O paciente não existe mais no servidor.");
        return "conflict" as const;
      }
      await upsertCachedPatient(ownerId, data as unknown as Patient);
    } else if (entry.operation === "delete") {
      if (!entry.entity_id) throw new Error("Exclusão local sem identificador de paciente.");
      const { error } = await supabase.from("patients").delete().eq("id", entry.entity_id);
      if (error) throw error;
      await removeCachedPatient(ownerId, entry.entity_id);
    } else {
      await markOutbox(ownerId, entry.id, "conflict", `Operação local desconhecida: ${entry.operation}`);
      return "conflict" as const;
    }

    await markOutbox(ownerId, entry.id, "done");
    return "done" as const;
  } catch (error) {
    const message = String((error as any)?.message ?? error ?? "Erro de sincronização");
    if (isTransientNetworkError(error)) {
      await markOutbox(ownerId, entry.id, "pending", message);
      return "network" as const;
    }
    await markOutbox(ownerId, entry.id, "error", message);
    return "error" as const;
  }
}

export async function syncPendingPatientChanges(): Promise<PatientSyncSummary> {
  if (!isDentalFlowDesktop() || !isOnline()) return { processed: 0, failed: 0, conflicts: 0 };
  const ownerId = await getOwnerId();
  if (!ownerId) return { processed: 0, failed: 0, conflicts: 0 };

  const entries = (await getPendingOutbox<Record<string, unknown>>(ownerId, 250))
    .filter((entry) => entry.entity_type === PATIENT_ENTITY);

  let processed = 0;
  let failed = 0;
  let conflicts = 0;

  for (const entry of entries) {
    const result = await syncPatientEntry(ownerId, entry);
    if (result === "done") processed += 1;
    if (result === "error") failed += 1;
    if (result === "conflict") conflicts += 1;
    if (result === "network") break;
  }

  if (processed > 0) await clearDoneOutbox(ownerId);

  if (isOnline()) {
    try {
      const remote = await cloudFetchPatients();
      await cachePatientSnapshot(ownerId, remote);
    } catch (error) {
      if (!isTransientNetworkError(error)) console.warn("[DentalFlow Desktop] Falha ao atualizar cache de pacientes", error);
    }
  }

  return { processed, failed, conflicts };
}
