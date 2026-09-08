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
  if (!isDentalFlowDesktop()) return Promise.resolve<DesktopWindowState>({ maximized: false, fullscreen: false });
  return invokeDesktop<DesktopWindowState>("desktop_window_state");
}

export function performDesktopWindowAction(action: "minimize" | "toggle_maximize" | "drag" | "close") {
  return invokeDesktop<DesktopWindowState>("desktop_window_action", { action });
}

export async function sendDesktopNativeNotification(input: { title: string; body?: string | null }) {
  if (!isDentalFlowDesktop()) return false;
  try {
    await invokeDesktop<void>("desktop_native_notification", {
      title: input.title || "DentalFlow",
      body: input.body ?? "",
    });
    return true;
  } catch (error) {
    console.warn("[DentalFlow Desktop] Não foi possível exibir a notificação nativa", error);
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
