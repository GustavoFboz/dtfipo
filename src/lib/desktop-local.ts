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

export function localCachePut<T>(ownerId: string, namespace: string, key: string, payload: T) {
  return invokeDesktop<void>("local_cache_put", {
    owner_id: ownerId,
    namespace,
    key,
    payload,
  });
}

export function localCacheGet<T>(ownerId: string, namespace: string, key: string) {
  return invokeDesktop<LocalCacheEntry<T> | null>("local_cache_get", {
    owner_id: ownerId,
    namespace,
    key,
  });
}

export function localCacheList<T>(ownerId: string, namespace: string, limit = 100) {
  return invokeDesktop<Array<LocalCacheEntry<T>>>("local_cache_list", {
    owner_id: ownerId,
    namespace,
    limit,
  });
}

export function localCacheDelete(ownerId: string, namespace: string, key: string) {
  return invokeDesktop<void>("local_cache_delete", {
    owner_id: ownerId,
    namespace,
    key,
  });
}

export function localCacheClearOwner(ownerId: string) {
  return invokeDesktop<void>("local_cache_clear_owner", { owner_id: ownerId });
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
    owner_id: ownerId,
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
    owner_id: ownerId,
    id,
    status,
    last_error: lastError,
  });
}

export function clearDoneOutbox(ownerId: string) {
  return invokeDesktop<number>("outbox_clear_done", { owner_id: ownerId });
}
