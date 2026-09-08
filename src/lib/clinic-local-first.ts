import { supabase } from "@/integrations/supabase/client";
import type { ClinicContext } from "./clinic";
import * as cloud from "./clinic";
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
import {
  canUseDentalFlowCloud,
  requireDesktopOwnerId,
  resolveDesktopOwnerId,
} from "./desktop-identity";
import { fetchPatientLocalFirst } from "./patients-local-first";

const CONTEXT_NS = "clinic-context:v1";
const APPOINTMENTS_NS = "clinic-appointments:v1";
const CONTEXT_KEY = "current";
const APPOINTMENTS_KEY = "all";
const APPOINTMENT_ENTITY = "clinic_appointments";

type Appointment = Record<string, any> & {
  id: string;
  clinic_id: string;
  patient_id: string;
  doctor_id?: string | null;
  starts_at: string;
  ends_at: string;
  status?: string | null;
};

export type ClinicOfflineSyncSummary = {
  processed: number;
  failed: number;
  conflicts: number;
  appointmentsCached: number;
  contextCached: boolean;
};

function online() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function transient(error: unknown) {
  if (!online()) return true;
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  return ["failed to fetch", "networkerror", "network error", "load failed", "fetch failed", "connection", "offline", "cloud login"].some((x) => message.includes(x));
}

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  throw new Error("Este dispositivo não oferece geração segura de identificadores locais.");
}

async function ownerId() {
  return resolveDesktopOwnerId();
}

async function requireOwnerId() {
  return requireDesktopOwnerId();
}

async function cloudAvailable() {
  return online() && (await canUseDentalFlowCloud());
}

function inRange(rows: Appointment[], start?: string, end?: string) {
  return rows.filter((row) => {
    const value = new Date(row.starts_at).getTime();
    if (start && value < new Date(start).getTime()) return false;
    if (end && value >= new Date(end).getTime()) return false;
    return true;
  });
}

async function readAppointments(id: string) {
  const entry = await localCacheGet<Appointment[]>(id, APPOINTMENTS_NS, APPOINTMENTS_KEY);
  return Array.isArray(entry?.payload) ? entry.payload : null;
}

async function writeAppointments(id: string, rows: Appointment[]) {
  await localCachePut(id, APPOINTMENTS_NS, APPOINTMENTS_KEY, [...rows].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()));
}

async function upsertAppointment(id: string, row: Appointment) {
  const current = (await readAppointments(id)) ?? [];
  const next = current.some((item) => item.id === row.id)
    ? current.map((item) => (item.id === row.id ? { ...item, ...row } : item))
    : [...current, row];
  await writeAppointments(id, next);
}

async function hydrateLocalAppointment(input: Record<string, any>, existing?: Appointment | null): Promise<Appointment> {
  const id = input.id ?? existing?.id ?? uuid();
  const patientId = String(input.patient_id ?? existing?.patient_id ?? "");
  let patient = existing?.patient ?? null;
  if (patientId) {
    try {
      const cached = await fetchPatientLocalFirst(patientId);
      if (cached) patient = { id: cached.id, name: cached.name, photo_url: cached.photo_url };
    } catch {
      // Patient hydration is best effort; the appointment remains usable offline.
    }
  }
  return {
    ...existing,
    ...input,
    id,
    clinic_id: String(input.clinic_id ?? existing?.clinic_id ?? ""),
    patient_id: patientId,
    starts_at: String(input.starts_at ?? existing?.starts_at ?? new Date().toISOString()),
    ends_at: String(input.ends_at ?? existing?.ends_at ?? new Date().toISOString()),
    status: input.status ?? existing?.status ?? "scheduled",
    patient,
  } as Appointment;
}

function contextLooksAuthoritative(value: ClinicContext) {
  return Boolean(value?.clinicId || value?.hasClinicalModule);
}

export async function fetchClinicContextLocalFirst(): Promise<ClinicContext> {
  if (!isDentalFlowDesktop()) return cloud.fetchClinicContext();
  const id = await requireOwnerId();
  const cached = await localCacheGet<ClinicContext>(id, CONTEXT_NS, CONTEXT_KEY);

  if (await cloudAvailable()) {
    try {
      const value = await cloud.fetchClinicContext();
      // A transient profile/entitlement hydration gap must never overwrite a
      // previously verified Clinic entitlement with the generic unavailable
      // state. A real authoritative server context is still allowed to revoke it.
      if (!contextLooksAuthoritative(value) && cached?.payload?.hasClinicalModule) {
        console.warn("[DentalFlow Desktop] Contexto vazio da Clínica ignorado; mantendo entitlement local verificado.");
        return cached.payload;
      }
      await localCachePut(id, CONTEXT_NS, CONTEXT_KEY, value);
      return value;
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  if (cached?.payload) return cached.payload;
  throw new Error("As permissões da clínica ainda não foram sincronizadas neste computador.");
}

export async function fetchClinicAppointmentsLocalFirst(start?: string, end?: string) {
  if (!isDentalFlowDesktop()) return cloud.fetchClinicAppointments(start, end);
  const id = await requireOwnerId();

  if (await cloudAvailable()) {
    try {
      const rows = (await cloud.fetchClinicAppointments()) as Appointment[];
      await writeAppointments(id, rows);
      return inRange(rows, start, end);
    } catch (error) {
      if (!transient(error)) throw error;
    }
  }

  const cached = await readAppointments(id);
  if (cached) return inRange(cached, start, end);
  throw new Error("A agenda ainda não foi sincronizada neste computador.");
}

export async function saveClinicAppointmentLocalFirst(input: Record<string, any>) {
  if (!isDentalFlowDesktop()) return cloud.saveClinicAppointment(input as any);
  const id = await requireOwnerId();
  const current = (await readAppointments(id)) ?? [];
  const existing = input.id ? current.find((row) => row.id === input.id) ?? null : null;
  const local = await hydrateLocalAppointment(input, existing);
  const operation = existing || input.id ? "update" : "create";

  const queue = async () => {
    await upsertAppointment(id, local);
    const payload: Record<string, any> = { ...input, id: local.id };
    delete payload.patient;
    delete payload.doctor;
    await enqueueOutbox({
      ownerId: id,
      entityType: APPOINTMENT_ENTITY,
      entityId: local.id,
      operation,
      payload,
    });
    return local;
  };

  if (!(await cloudAvailable())) return queue();

  try {
    const saved = await cloud.saveClinicAppointment(input as any) as Appointment;
    await upsertAppointment(id, await hydrateLocalAppointment(saved, local));
    return saved;
  } catch (error) {
    if (transient(error)) return queue();
    throw error;
  }
}

export async function cancelClinicAppointmentLocalFirst(appointmentId: string) {
  if (!isDentalFlowDesktop()) return cloud.cancelClinicAppointment(appointmentId);
  const id = await requireOwnerId();
  const current = (await readAppointments(id)) ?? [];
  const existing = current.find((row) => row.id === appointmentId) ?? null;

  const queue = async () => {
    if (existing) await upsertAppointment(id, { ...existing, status: "cancelled" });
    await enqueueOutbox({
      ownerId: id,
      entityType: APPOINTMENT_ENTITY,
      entityId: appointmentId,
      operation: "update",
      payload: { id: appointmentId, status: "cancelled" },
    });
  };

  if (!(await cloudAvailable())) return queue();
  try {
    await cloud.cancelClinicAppointment(appointmentId);
    if (existing) await upsertAppointment(id, { ...existing, status: "cancelled" });
  } catch (error) {
    if (transient(error)) return queue();
    throw error;
  }
}

async function syncAppointmentEntry(id: string, entry: OutboxEntry<Record<string, any>>) {
  await markOutbox(id, entry.id, "syncing");
  try {
    const payload = { ...(entry.payload ?? {}) };
    const appointmentId = entry.entity_id ?? payload.id;
    if (!appointmentId) throw new Error("Agendamento local sem identificador.");

    if (entry.operation === "create") {
      const { data, error } = await (supabase as any)
        .from("clinic_appointments")
        .upsert({ ...payload, id: appointmentId }, { onConflict: "id" })
        .select()
        .single();
      if (error) throw error;
      await upsertAppointment(id, await hydrateLocalAppointment(data ?? payload));
    } else if (entry.operation === "update") {
      delete payload.id;
      const { data, error } = await (supabase as any)
        .from("clinic_appointments")
        .update(payload)
        .eq("id", appointmentId)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        await markOutbox(id, entry.id, "conflict", "O agendamento não existe mais no servidor.");
        return "conflict" as const;
      }
      await upsertAppointment(id, await hydrateLocalAppointment(data));
    } else {
      await markOutbox(id, entry.id, "conflict", `Operação de agenda desconhecida: ${entry.operation}`);
      return "conflict" as const;
    }

    await markOutbox(id, entry.id, "done");
    return "done" as const;
  } catch (error) {
    const message = String((error as any)?.message ?? error ?? "Erro de sincronização da agenda");
    if (transient(error)) {
      await markOutbox(id, entry.id, "pending", message);
      return "network" as const;
    }
    await markOutbox(id, entry.id, "error", message);
    return "error" as const;
  }
}

export async function warmClinicLocalCache(): Promise<{ appointmentsCached: number; contextCached: boolean }> {
  if (!isDentalFlowDesktop() || !(await cloudAvailable())) return { appointmentsCached: 0, contextCached: false };
  const id = await ownerId();
  if (!id) return { appointmentsCached: 0, contextCached: false };

  let contextCached = false;
  let appointmentsCached = 0;

  try {
    const context = await cloud.fetchClinicContext();
    const existing = await localCacheGet<ClinicContext>(id, CONTEXT_NS, CONTEXT_KEY);
    if (contextLooksAuthoritative(context) || !existing?.payload?.hasClinicalModule) {
      await localCachePut(id, CONTEXT_NS, CONTEXT_KEY, context);
      contextCached = true;
    }
  } catch (error) {
    if (!transient(error)) console.warn("[DentalFlow Desktop] Falha ao cachear contexto da clínica", error);
  }

  try {
    const appointments = await cloud.fetchClinicAppointments() as Appointment[];
    await writeAppointments(id, appointments);
    appointmentsCached = appointments.length;
  } catch (error) {
    if (!transient(error)) console.warn("[DentalFlow Desktop] Falha ao cachear agenda", error);
  }

  return { appointmentsCached, contextCached };
}

export async function syncPendingClinicChanges(): Promise<ClinicOfflineSyncSummary> {
  if (!isDentalFlowDesktop() || !(await cloudAvailable())) {
    return { processed: 0, failed: 0, conflicts: 0, appointmentsCached: 0, contextCached: false };
  }
  const id = await ownerId();
  if (!id) return { processed: 0, failed: 0, conflicts: 0, appointmentsCached: 0, contextCached: false };

  const entries = (await getPendingOutbox<Record<string, any>>(id, 500)).filter((entry) => entry.entity_type === APPOINTMENT_ENTITY);
  let processed = 0;
  let failed = 0;
  let conflicts = 0;

  for (const entry of entries) {
    const result = await syncAppointmentEntry(id, entry);
    if (result === "done") processed += 1;
    if (result === "error") failed += 1;
    if (result === "conflict") conflicts += 1;
    if (result === "network") break;
  }

  if (processed > 0) await clearDoneOutbox(id);
  const warmed = await warmClinicLocalCache();
  return { processed, failed, conflicts, ...warmed };
}
