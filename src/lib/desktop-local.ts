type DesktopInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

type DentalFlowTauriGlobal = {
  core?: {
    invoke?: DesktopInvoke;
  };
};

declare global {
  interface Window {
    __TAURI__?: DentalFlowTauriGlobal;
  }
}

export type DesktopRuntimeInfo = {
  platform: "tauri";
  database_path: string;
  schema_version: number;
};

export type DesktopWindowState = {
  maximized: boolean;
  fullscreen: boolean;
  focused: boolean;
};

export type DeviceIdentity = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  clinic_id: string | null;
  validated_at: number;
  valid_until: number;
};

export type LocalCacheEntry<T = unknown> = {
  owner_id: string;
  namespace: string;
  key: string;
  payload: T;
  updated_at: number;
};

export type OutboxOperation = "create" | "update" | "delete" | string;
export type OutboxStatus = "pending" | "syncing" | "done" | "error" | "conflict";

export type OutboxEntry<T = unknown> = {
  id: string;
  owner_id: string;
  entity_type: string;
  entity_id: string | null;
  operation: OutboxOperation;
  payload: T;
  base_version: string | null;
  status: OutboxStatus;
  attempts: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
};

export type DesktopNotificationTarget = {
  route?: string;
  caseId?: string;
  activityId?: string;
};

function getDesktopInvoke(): DesktopInvoke | null {
  if (typeof window === "undefined") return null;
  return window.__TAURI__?.core?.invoke ?? null;
}

export function isDentalFlowDesktop() {
  return getDesktopInvoke() !== null;
}

async function invokeDesktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const invoke = getDesktopInvoke();
  if (!invoke) {
    throw new Error("O runtime local do DentalFlow Desktop não está disponível neste ambiente.");
  }
  return invoke<T>(command, args);
}

export function getDesktopRuntimeInfo() {
  return invokeDesktop<DesktopRuntimeInfo>("desktop_runtime_info");
}

export function getDesktopWindowState() {
  if (!isDentalFlowDesktop()) {
    return Promise.resolve<DesktopWindowState>({ maximized: false, fullscreen: false, focused: true });
  }
  return invokeDesktop<DesktopWindowState>("desktop_window_state");
}

export function performDesktopWindowAction(action: "minimize" | "toggle_maximize" | "drag" | "close") {
  return invokeDesktop<DesktopWindowState>("desktop_window_action", { action });
}

export async function sendDesktopNativeNotification(input: {
  title: string;
  body?: string | null;
  data?: DesktopNotificationTarget;
}) {
  if (!isDentalFlowDesktop()) return false;
  try {
    await invokeDesktop<void>("desktop_native_notification", {
      title: input.title || "DentalFlow",
      body: input.body ?? "",
      data: input.data ?? null,
    });
    return true;
  } catch (error) {
    console.warn("[DentalFlow Desktop] Não foi possível exibir a notificação nativa", error);
    return false;
  }
}

export async function playDesktopNotificationSound() {
  if (!isDentalFlowDesktop()) return false;
  try {
    return await invokeDesktop<boolean>("desktop_notification_sound");
  } catch (error) {
    console.warn("[DentalFlow Desktop] Não foi possível reproduzir o som nativo da notificação", error);
    return false;
  }
}

export function getProvisionedDesktopIdentity() {
  if (!isDentalFlowDesktop()) return Promise.resolve<DeviceIdentity | null>(null);
  return invokeDesktop<DeviceIdentity | null>("device_identity_get");
}

export function provisionDesktopIdentity(input: {
  userId: string;
  email?: string | null;
  fullName?: string | null;
  clinicId?: string | null;
}) {
  return invokeDesktop<DeviceIdentity>("device_identity_set", {
    input: {
      user_id: input.userId,
      email: input.email ?? null,
      full_name: input.fullName ?? null,
      clinic_id: input.clinicId ?? null,
    },
  });
}

export function clearProvisionedDesktopIdentity() {
  if (!isDentalFlowDesktop()) return Promise.resolve();
  return invokeDesktop<void>("device_identity_clear");
}

/**
 * Tauri command argument names are camelCased at the JS boundary even when the
 * Rust function parameters are snake_case. The 0.2.8 build passed `owner_id`
 * directly, so every local-cache/outbox command failed before reaching SQLite
 * with errors such as "missing required key ownerId". Keep this boundary explicit
 * here so all Desktop data domains share one correct contract.
 */
export function localCachePut<T>(ownerId: string, namespace: string, key: string, payload: T) {
  return invokeDesktop<void>("local_cache_put", {
    ownerId,
    namespace,
    key,
    payload,
  });
}

export function localCacheGet<T>(ownerId: string, namespace: string, key: string) {
  return invokeDesktop<LocalCacheEntry<T> | null>("local_cache_get", {
    ownerId,
    namespace,
    key,
  });
}

export function localCacheList<T>(ownerId: string, namespace: string, limit = 100) {
  return invokeDesktop<Array<LocalCacheEntry<T>>>("local_cache_list", {
    ownerId,
    namespace,
    limit,
  });
}

export function localCacheDelete(ownerId: string, namespace: string, key: string) {
  return invokeDesktop<void>("local_cache_delete", {
    ownerId,
    namespace,
    key,
  });
}

export function localCacheClearOwner(ownerId: string) {
  return invokeDesktop<void>("local_cache_clear_owner", { ownerId });
}

export function enqueueOutbox<T>(input: {
  ownerId: string;
  entityType: string;
  entityId?: string | null;
  operation: OutboxOperation;
  payload: T;
  baseVersion?: string | null;
  id?: string;
}) {
  const id = input.id ?? crypto.randomUUID();
  return invokeDesktop<string>("outbox_enqueue", {
    input: {
      id,
      owner_id: input.ownerId,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      operation: input.operation,
      payload: input.payload,
      base_version: input.baseVersion ?? null,
    },
  });
}

export function getPendingOutbox<T = unknown>(ownerId: string, limit = 100) {
  return invokeDesktop<Array<OutboxEntry<T>>>("outbox_pending", {
    ownerId,
    limit,
  });
}

export function markOutbox(
  ownerId: string,
  id: string,
  status: OutboxStatus,
  lastError: string | null = null,
) {
  return invokeDesktop<void>("outbox_mark", {
    ownerId,
    id,
    status,
    lastError,
  });
}

export function clearDoneOutbox(ownerId: string) {
  return invokeDesktop<number>("outbox_clear_done", { ownerId });
}

const REALTIME_NOTIFICATION_CACHE_LIMIT = 500;
const REALTIME_CASE_ACTIVITY_CACHE_LIMIT = 300;

function newestFirst<T extends Record<string, any>>(rows: T[]) {
  return [...rows].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
}

function mergeRowsById<T extends Record<string, any>>(current: T[], incoming: T[], limit: number) {
  const byId = new Map<string, T>();
  for (const row of [...incoming, ...current]) {
    const id = String(row?.id ?? "");
    if (!id) continue;
    const previous = byId.get(id);
    byId.set(id, previous ? { ...previous, ...row } : row);
  }
  return newestFirst(Array.from(byId.values())).slice(0, limit);
}

/** Persist realtime notification rows immediately in the same bounded mirror used by the notification center. */
export async function upsertLocalNotifications(rows: Array<Record<string, any>>) {
  if (!isDentalFlowDesktop() || !rows.length) return;
  const identity = await getProvisionedDesktopIdentity();
  if (!identity?.user_id) return;
  const entry = await localCacheGet<Array<Record<string, any>>>(identity.user_id, "notifications:v1", "all");
  const current = Array.isArray(entry?.payload) ? entry.payload : [];
  await localCachePut(
    identity.user_id,
    "notifications:v1",
    "all",
    mergeRowsById(current, rows, REALTIME_NOTIFICATION_CACHE_LIMIT),
  );
}

/** Keep the most recent chat history per case. The cap prevents an unbounded SQLite mirror on high-volume accounts. */
export async function upsertLocalCaseActivities(rows: Array<Record<string, any>>) {
  if (!isDentalFlowDesktop() || !rows.length) return;
  const identity = await getProvisionedDesktopIdentity();
  if (!identity?.user_id) return;
  const groups = new Map<string, Array<Record<string, any>>>();
  for (const row of rows) {
    const caseId = String(row?.case_id ?? "");
    if (!caseId) continue;
    const group = groups.get(caseId) ?? [];
    group.push(row);
    groups.set(caseId, group);
  }
  await Promise.all(Array.from(groups.entries()).map(async ([caseId, incoming]) => {
    const entry = await localCacheGet<Array<Record<string, any>>>(identity.user_id, "case-activity:v1", caseId);
    const current = Array.isArray(entry?.payload) ? entry.payload : [];
    await localCachePut(
      identity.user_id,
      "case-activity:v1",
      caseId,
      mergeRowsById(current, incoming, REALTIME_CASE_ACTIVITY_CACHE_LIMIT),
    );
  }));
}

/**
 * Exercise the exact JS -> Tauri -> SQLite argument contract before starting a
 * real synchronization. This catches packaging/runtime mismatches immediately
 * instead of letting every Patients/Cases/Clinic request fail independently.
 */
export async function verifyDesktopLocalRuntime() {
  if (!isDentalFlowDesktop()) return;
  const ownerId = "__dentalflow_runtime_probe__";
  const namespace = "runtime-probe:v1";
  const key = "tauri-sqlite-contract";
  const payload = { ok: true, at: Date.now() };

  try {
    await localCachePut(ownerId, namespace, key, payload);
    const saved = await localCacheGet<typeof payload>(ownerId, namespace, key);
    if (!saved?.payload?.ok) {
      throw new Error("O banco local não confirmou a leitura do registro de teste.");
    }
  } catch (error) {
    throw new Error(
      `Falha no banco local do DentalFlow Desktop: ${String((error as any)?.message ?? error ?? "erro desconhecido")}`,
    );
  } finally {
    await localCacheDelete(ownerId, namespace, key).catch(() => undefined);
  }
}

export type DesktopPrinter = { name: string; is_default: boolean };

/** Impressoras instaladas no sistema operacional (apenas no aplicativo instalado). */
export async function listDesktopPrinters(): Promise<DesktopPrinter[]> {
  if (!isDentalFlowDesktop()) return [];
  const printers = await invokeDesktop<DesktopPrinter[]>("desktop_list_printers");
  return Array.isArray(printers) ? printers : [];
}

/** Abre o painel de impressoras do sistema operacional. */
export async function openDesktopPrinterSettings(): Promise<void> {
  if (!isDentalFlowDesktop()) return;
  await invokeDesktop<void>("desktop_open_printer_settings");
}

/**
 * Envia texto puro para uma impressora instalada. O nome é validado no lado
 * nativo contra a lista real de impressoras — nenhum comando de shell é
 * aceito a partir da interface.
 */
export async function desktopPrintText(printer: string, text: string): Promise<void> {
  await invokeDesktop<void>("desktop_print_text", { printer, text });
}
