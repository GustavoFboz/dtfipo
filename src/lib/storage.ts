import { supabase } from "@/integrations/supabase/client";
import { isDentalFlowDesktop, localCacheGet, localCachePut } from "@/lib/desktop-local";
import { resolveDesktopOwnerId } from "@/lib/desktop-identity";
import { withDesktopCloudTimeout } from "@/lib/desktop-cloud";

export const DEFAULT_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;
export const STORAGE_WARNING_RATIO = 0.85;
export const STORAGE_CRITICAL_RATIO = 0.95;
export const STORAGE_RESERVATION_REVIEW_AGE_MS = 24 * 60 * 60 * 1000;

const STORAGE_USAGE_NS = "storage-usage:v1";
const STORAGE_USAGE_KEY = "current";

export type StorageUsage = {
  clinic_id: string | null;
  clinic_name: string | null;
  used_bytes: number;
  limit_bytes: number;
  available_bytes: number;
  usage_ratio: number;
  file_count: number;
  almost_full: boolean;
  full: boolean;
  quota_enforced: boolean;
};

export type ManagedStorageFile = {
  id: string;
  clinic_id: string;
  bucket: string;
  object_path: string;
  source_type: string;
  source_id: string | null;
  case_id: string | null;
  patient_id: string | null;
  original_name: string;
  mime_type: string | null;
  size_bytes: number;
  uploaded_by: string | null;
  status: "reserved" | "ready";
  created_at: string;
  updated_at: string;
};

type UsageListener = () => void;
type UsageState = { data: StorageUsage | null; loading: boolean; error: string | null; revision: number };
let state: UsageState = { data: null, loading: false, error: null, revision: 0 };
let pendingDelta = 0;
const listeners = new Set<UsageListener>();

function emit() {
  state = { ...state, revision: state.revision + 1 };
  listeners.forEach((listener) => listener());
}

function normalizeUsage(raw: any, quotaEnforced = true): StorageUsage {
  const row = Array.isArray(raw) ? raw[0] : raw;
  const limit = Math.max(0, Number(row?.limit_bytes ?? DEFAULT_STORAGE_LIMIT_BYTES));
  const used = Math.max(0, Number(row?.used_bytes ?? 0) + pendingDelta);
  const ratio = limit > 0 ? used / limit : 1;
  return {
    clinic_id: row?.clinic_id ?? null,
    clinic_name: row?.clinic_name ?? null,
    used_bytes: used,
    limit_bytes: limit,
    available_bytes: Math.max(0, limit - used),
    usage_ratio: ratio,
    file_count: Math.max(0, Number(row?.file_count ?? 0)),
    almost_full: ratio >= STORAGE_WARNING_RATIO,
    full: used >= limit,
    quota_enforced: quotaEnforced,
  };
}

function fallbackUsage() {
  return normalizeUsage({ used_bytes: 0, limit_bytes: DEFAULT_STORAGE_LIMIT_BYTES, file_count: 0 }, false);
}

function isMissingStorageBackend(error: any) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  return code === "PGRST202" || code === "42883" || message.includes("get_storage_usage") || message.includes("schema cache");
}

async function readDesktopStorageUsage(): Promise<StorageUsage | null> {
  if (!isDentalFlowDesktop()) return null;
  const ownerId = await resolveDesktopOwnerId().catch(() => null);
  if (!ownerId) return null;
  const entry = await localCacheGet<StorageUsage>(ownerId, STORAGE_USAGE_NS, STORAGE_USAGE_KEY).catch(() => null);
  return entry?.payload ?? null;
}

async function persistDesktopStorageUsage(usage: StorageUsage) {
  if (!isDentalFlowDesktop()) return;
  const ownerId = await resolveDesktopOwnerId().catch(() => null);
  if (!ownerId) return;
  await localCachePut(ownerId, STORAGE_USAGE_NS, STORAGE_USAGE_KEY, usage).catch(() => undefined);
}

export function subscribeStorageUsage(listener: UsageListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStorageUsageSnapshot() {
  return state;
}

export function applyOptimisticStorageDelta(delta: number) {
  if (!Number.isFinite(delta) || delta === 0) return;
  pendingDelta += delta;
  if (state.data) {
    const baseUsed = Math.max(0, state.data.used_bytes + delta);
    const ratio = state.data.limit_bytes > 0 ? baseUsed / state.data.limit_bytes : 1;
    state = {
      ...state,
      data: {
        ...state.data,
        used_bytes: baseUsed,
        available_bytes: Math.max(0, state.data.limit_bytes - baseUsed),
        usage_ratio: ratio,
        almost_full: ratio >= STORAGE_WARNING_RATIO,
        full: baseUsed >= state.data.limit_bytes,
      },
    };
    void persistDesktopStorageUsage(state.data as StorageUsage);
  }
  emit();
}

export async function refreshStorageUsage(): Promise<StorageUsage> {
  state = { ...state, loading: true, error: null };
  emit();

  const cached = await readDesktopStorageUsage();
  try {
    const { data, error } = await supabase.rpc("get_storage_usage" as never);
    if (error) throw error;

    // A null RPC payload is not authoritative enough to erase a known local
    // snapshot. This can occur briefly while an online Desktop session resumes.
    const payload = data as unknown;
    if ((payload == null || (Array.isArray(payload) && payload.length === 0)) && cached) {
      state = { ...state, data: cached, loading: false, error: null };
      pendingDelta = 0;
      emit();
      return cached;
    }

    pendingDelta = 0;
    const usage = normalizeUsage(data, true);
    state = { ...state, data: usage, loading: false, error: null };
    emit();
    void persistDesktopStorageUsage(usage);
    return usage;
  } catch (error: any) {
    if (isMissingStorageBackend(error)) {
      const fallback = cached ?? fallbackUsage();
      state = { ...state, data: fallback, loading: false, error: null };
      pendingDelta = 0;
      emit();
      return fallback;
    }

    // The old Desktop implementation left state.data = null on any auth/network
    // hiccup, producing the exact "— disponível / — de 1 GB usados" seen in the
    // screenshot. Keep the last verified measurement (or a safe non-enforced
    // fallback) while the session self-heals instead of blanking the card.
    const fallback = cached ?? state.data ?? fallbackUsage();
    state = { ...state, data: fallback, loading: false, error: String(error?.message ?? error ?? "") || null };
    pendingDelta = 0;
    emit();
    return fallback;
  }
}

export async function fetchStorageFiles(): Promise<ManagedStorageFile[]> {
  const { data, error } = await supabase
    .from("storage_files" as never)
    .select("*")
    .eq("status", "ready")
    .order("created_at", { ascending: false });
  if (error) {
    if (isMissingStorageBackend(error)) return [];
    throw error;
  }
  return (data ?? []) as unknown as ManagedStorageFile[];
}

export async function fetchStorageUploadReservations(clinicId: string): Promise<ManagedStorageFile[]> {
  if (!clinicId) return [];
  const { data, error } = await withDesktopCloudTimeout("envios pendentes", Promise.resolve(supabase.from("storage_files" as never).select("*")
    .eq("clinic_id", clinicId).eq("status", "reserved")
    .order("created_at", { ascending: true }).limit(200)));
  if (error) throw error;
  return (data ?? []) as unknown as ManagedStorageFile[];
}

export function canReviewStorageReservation(file: ManagedStorageFile, now = Date.now()) {
  const created = Date.parse(file.created_at);
  return file.status === "reserved" && Number.isFinite(created) && now - created >= STORAGE_RESERVATION_REVIEW_AGE_MS;
}

export async function releaseStorageUploadReservation(file: ManagedStorageFile): Promise<{ released: boolean; releasedBytes: number }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("Conecte-se à internet para verificar e liberar este envio pendente.");
  }
  if (!canReviewStorageReservation(file)) {
    throw new Error("Somente envios pendentes há pelo menos 24 horas podem ser revisados.");
  }
  const { data, error } = await withDesktopCloudTimeout("recuperação do envio", Promise.resolve(supabase.rpc("release_storage_upload_reservation" as never, {
    _file_id: file.id, _clinic_id: file.clinic_id,
  } as never))).catch(() => {
    throw new Error("O servidor não confirmou a liberação. Atualize a lista antes de tentar novamente.");
  });
  if (error) {
    const message = String(error.message ?? "");
    if (message.includes("STORAGE_OBJECT_STILL_EXISTS")) throw new Error("O arquivo já existe. A reserva foi preservada; atualize a lista antes de tentar novamente.");
    if (message.includes("STORAGE_RESERVATION_HAS_SOURCE")) throw new Error("Este envio possui um registro vinculado e precisa de revisão. O espaço foi preservado.");
    if (message.includes("STORAGE_RESERVATION_TOO_RECENT")) throw new Error("Este envio ainda é recente. Aguarde 24 horas antes de revisá-lo.");
    if (message.includes("STORAGE_RESERVATION_NOT_PENDING")) throw new Error("Este envio já foi concluído. Atualize a lista.");
    if (message.includes("STORAGE_MANAGEMENT_NOT_ALLOWED") || message.includes("NOT_AUTHENTICATED")) throw new Error("Entre com um administrador autorizado desta organização para liberar o envio.");
    if (isMissingStorageBackend(error)) throw new Error("A recuperação de envios pendentes está indisponível. Tente novamente mais tarde.");
    throw new Error("Não foi possível verificar o envio no servidor. O espaço foi preservado; tente novamente.");
  }
  const row = data as unknown as { id?: unknown; released?: unknown; released_bytes?: unknown } | null;
  if (row?.id !== file.id || typeof row.released !== "boolean" || typeof row.released_bytes !== "number"
      || !Number.isSafeInteger(row.released_bytes) || row.released_bytes < 0
      || (row.released ? row.released_bytes !== Number(file.size_bytes) : row.released_bytes !== 0)) {
    throw new Error("O servidor não confirmou a liberação. Atualize a lista antes de tentar novamente.");
  }
  // Never adjust quota optimistically or delete an object. The caller refreshes
  // the authoritative measurement only after a valid, idempotent server result.
  return { released: row.released, releasedBytes: row.released_bytes };
}

export async function reserveStorageUpload(input: {
  sizeBytes: number;
  bucket: string;
  objectPath: string;
  sourceType: string;
  caseId?: string | null;
  patientId?: string | null;
  originalName: string;
  mimeType?: string | null;
}): Promise<{ reservationId: string | null; quotaEnforced: boolean }> {
  applyOptimisticStorageDelta(input.sizeBytes);
  const { data, error } = await supabase.rpc("reserve_storage_upload" as never, {
    _size_bytes: input.sizeBytes,
    _bucket: input.bucket,
    _object_path: input.objectPath,
    _source_type: input.sourceType,
    _case_id: input.caseId ?? null,
    _patient_id: input.patientId ?? null,
    _original_name: input.originalName,
    _mime_type: input.mimeType ?? null,
  } as never);
  if (error) {
    if (isMissingStorageBackend(error)) {
      applyOptimisticStorageDelta(-input.sizeBytes);
      throw new Error("A reserva de armazenamento está indisponível. Tente enviar o arquivo novamente mais tarde.");
    }
    applyOptimisticStorageDelta(-input.sizeBytes);
    if (String(error.message).includes("STORAGE_QUOTA_EXCEEDED")) {
      throw new Error("O armazenamento da clínica está cheio. Remova arquivos antes de enviar novos itens.");
    }
    throw error;
  }
  const row: any = Array.isArray(data) ? data[0] : data;
  const reservationId = row?.file_id ?? row?.id ?? (typeof data === "string" ? data : null);
  if (!reservationId) {
    applyOptimisticStorageDelta(-input.sizeBytes);
    throw new Error("Não foi possível confirmar a reserva de armazenamento.");
  }
  return { reservationId, quotaEnforced: true };
}

export async function completeStorageUpload(reservationId: string | null, sourceId?: string | null) {
  if (!reservationId) {
    void refreshStorageUsage().catch(() => undefined);
    return;
  }
  const { error } = await supabase.rpc("complete_storage_upload" as never, {
    _file_id: reservationId,
    _source_id: sourceId ?? null,
  } as never);
  if (error) throw error;
  void refreshStorageUsage().catch(() => undefined);
}

export async function cancelStorageUpload(reservationId: string | null, _sizeBytes: number) {
  if (!reservationId) return;
  const { error } = await withDesktopCloudTimeout("cancelamento do envio", Promise.resolve(supabase.rpc("cancel_storage_upload" as never, { _file_id: reservationId } as never)));
  if (error) throw error;
  // Only a new authoritative measurement frees visible quota. This also avoids
  // subtracting twice when the idempotent RPC is retried after a lost response.
  void refreshStorageUsage().catch(() => undefined);
}

export async function deleteManagedStorageFile(file: ManagedStorageFile) {
  const { error: storageError } = await supabase.storage.from(file.bucket).remove([file.object_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.rpc("delete_managed_storage_file" as never, { _file_id: file.id } as never);
  if (error) throw error;
  applyOptimisticStorageDelta(-Math.max(0, Number(file.size_bytes || 0)));
  void refreshStorageUsage().catch(() => undefined);
}

export function formatStorageBytes(bytes: number) {
  const value = Math.max(0, Number(bytes || 0));
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let n = value / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  const digits = n >= 100 ? 0 : n >= 10 ? 1 : 2;
  const amount = n.toFixed(digits).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
  return `${amount} ${units[i]}`;
}

export function storageSourceLabel(source: string) {
  const labels: Record<string, string> = {
    case_attachment: "Caso",
    patient_attachment: "Paciente",
    patient_photo: "Foto do paciente",
    user_avatar: "Avatar",
    other: "Outro",
  };
  return labels[source] ?? "Arquivo";
}
