import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;
export const STORAGE_WARNING_RATIO = 0.85;
export const STORAGE_CRITICAL_RATIO = 0.95;

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

function isMissingStorageBackend(error: any) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  return code === "PGRST202" || code === "42883" || message.includes("get_storage_usage") || message.includes("schema cache");
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
  }
  emit();
}

export async function refreshStorageUsage(): Promise<StorageUsage> {
  state = { ...state, loading: true, error: null };
  emit();
  const { data, error } = await supabase.rpc("get_storage_usage" as never);
  if (error) {
    if (isMissingStorageBackend(error)) {
      const fallback = normalizeUsage({ used_bytes: 0, limit_bytes: DEFAULT_STORAGE_LIMIT_BYTES, file_count: 0 }, false);
      state = { ...state, data: fallback, loading: false, error: null };
      pendingDelta = 0;
      emit();
      return fallback;
    }
    state = { ...state, loading: false, error: error.message };
    emit();
    throw error;
  }
  pendingDelta = 0;
  const usage = normalizeUsage(data, true);
  state = { ...state, data: usage, loading: false, error: null };
  emit();
  return usage;
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
  // Reflect the pending upload immediately in every storage card/page in this tab.
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
      // Keep the legacy upload path working until the database migration is deployed.
      applyOptimisticStorageDelta(-input.sizeBytes);
      return { reservationId: null, quotaEnforced: false };
    }
    applyOptimisticStorageDelta(-input.sizeBytes);
    if (String(error.message).includes("STORAGE_QUOTA_EXCEEDED")) {
      throw new Error("O armazenamento da clínica está cheio. Remova arquivos antes de enviar novos itens.");
    }
    throw error;
  }
  const row: any = Array.isArray(data) ? data[0] : data;
  return { reservationId: row?.file_id ?? row?.id ?? (typeof data === "string" ? data : null), quotaEnforced: true };
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
  if (error && !isMissingStorageBackend(error)) throw error;
  void refreshStorageUsage().catch(() => undefined);
}

export async function cancelStorageUpload(reservationId: string | null, sizeBytes: number) {
  applyOptimisticStorageDelta(-Math.max(0, sizeBytes));
  if (!reservationId) return;
  const { error } = await supabase.rpc("cancel_storage_upload" as never, { _file_id: reservationId } as never);
  if (error && !isMissingStorageBackend(error)) console.warn("storage reservation cleanup failed", error);
  void refreshStorageUsage().catch(() => undefined);
}

export async function deleteManagedStorageFile(file: ManagedStorageFile) {
  applyOptimisticStorageDelta(-Math.max(0, Number(file.size_bytes || 0)));
  const { data, error } = await supabase.rpc("delete_managed_storage_file" as never, { _file_id: file.id } as never);
  if (error) {
    applyOptimisticStorageDelta(Math.max(0, Number(file.size_bytes || 0)));
    throw error;
  }
  const payload: any = Array.isArray(data) ? data[0] : data;
  const bucket = payload?.bucket ?? file.bucket;
  const objectPath = payload?.object_path ?? file.object_path;
  const { error: storageError } = await supabase.storage.from(bucket).remove([objectPath]);
  if (storageError) console.warn("managed storage object cleanup failed", storageError);
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
  return `${n.toFixed(digits).replace(".00", "").replace(".0", "")} ${units[i]}`;
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
