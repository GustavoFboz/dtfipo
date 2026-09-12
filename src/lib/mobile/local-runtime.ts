type MobileIdentity = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  clinic_id: string | null;
  validated_at: number;
  valid_until: number;
};

type CacheEntry<T = unknown> = {
  owner_id: string;
  namespace: string;
  key: string;
  payload: T;
  updated_at: number;
};

type OutboxEntry<T = unknown> = {
  id: string;
  owner_id: string;
  entity_type: string;
  entity_id: string | null;
  operation: string;
  payload: T;
  base_version: string | null;
  status: "pending" | "syncing" | "done" | "error" | "conflict";
  attempts: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
};

const DB_NAME = "dentalflow-mobile-local-v1";
const DB_VERSION = 1;
const CACHE_STORE = "cache";
const OUTBOX_STORE = "outbox";
const IDENTITY_KEY = "dentalflow-mobile-device-identity:v1";
const DEVICE_VALID_DAYS = 30;

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
      Plugins?: Record<string, any>;
    };
  }
}

export function isNativeMobileLocalRuntime() {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.()) && window.Capacitor?.getPlatform?.() === "android";
  } catch {
    return false;
  }
}

function requireMobile() {
  if (!isNativeMobileLocalRuntime()) throw new Error("Runtime local Android indisponível.");
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha no banco local."));
  });
}

async function openDb() {
  requireMobile();
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        const cache = db.createObjectStore(CACHE_STORE, { keyPath: "id" });
        cache.createIndex("owner_namespace", ["owner_id", "namespace"], { unique: false });
        cache.createIndex("owner", "owner_id", { unique: false });
      }
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const outbox = db.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
        outbox.createIndex("owner_status", ["owner_id", "status"], { unique: false });
        outbox.createIndex("owner", "owner_id", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o armazenamento local."));
  });
}

function cacheId(ownerId: string, namespace: string, key: string) {
  return `${ownerId}::${namespace}::${key}`;
}

export async function mobileRuntimeInfo() {
  requireMobile();
  const db = await openDb();
  db.close();
  return { platform: "android", database_path: DB_NAME, schema_version: DB_VERSION };
}

export function mobileGetIdentity(): MobileIdentity | null {
  if (!isNativeMobileLocalRuntime()) return null;
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const identity = JSON.parse(raw) as MobileIdentity;
    if (!identity?.user_id || identity.valid_until <= Date.now()) return null;
    return identity;
  } catch {
    return null;
  }
}

export function mobileSetIdentity(input: {
  user_id: string;
  email?: string | null;
  full_name?: string | null;
  clinic_id?: string | null;
}) {
  requireMobile();
  const now = Date.now();
  const identity: MobileIdentity = {
    user_id: input.user_id,
    email: input.email ?? null,
    full_name: input.full_name ?? null,
    clinic_id: input.clinic_id ?? null,
    validated_at: now,
    valid_until: now + DEVICE_VALID_DAYS * 24 * 60 * 60 * 1000,
  };
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  return identity;
}

export function mobileClearIdentity() {
  if (typeof window !== "undefined") localStorage.removeItem(IDENTITY_KEY);
}

export async function mobileCachePut<T>(ownerId: string, namespace: string, key: string, payload: T) {
  const db = await openDb();
  try {
    const tx = db.transaction(CACHE_STORE, "readwrite");
    tx.objectStore(CACHE_STORE).put({
      id: cacheId(ownerId, namespace, key),
      owner_id: ownerId,
      namespace,
      key,
      payload,
      updated_at: Date.now(),
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao salvar cache local."));
      tx.onabort = () => reject(tx.error ?? new Error("Cache local cancelado."));
    });
  } finally {
    db.close();
  }
}

export async function mobileCacheGet<T>(ownerId: string, namespace: string, key: string): Promise<CacheEntry<T> | null> {
  const db = await openDb();
  try {
    const tx = db.transaction(CACHE_STORE, "readonly");
    const row = await requestResult<any>(tx.objectStore(CACHE_STORE).get(cacheId(ownerId, namespace, key)));
    return row ? {
      owner_id: row.owner_id,
      namespace: row.namespace,
      key: row.key,
      payload: row.payload as T,
      updated_at: Number(row.updated_at ?? 0),
    } : null;
  } finally {
    db.close();
  }
}

export async function mobileCacheList<T>(ownerId: string, namespace: string, limit = 100): Promise<Array<CacheEntry<T>>> {
  const db = await openDb();
  try {
    const tx = db.transaction(CACHE_STORE, "readonly");
    const index = tx.objectStore(CACHE_STORE).index("owner_namespace");
    const range = IDBKeyRange.only([ownerId, namespace]);
    const rows = await requestResult<any[]>(index.getAll(range, Math.max(1, limit)));
    return rows
      .map((row) => ({
        owner_id: row.owner_id,
        namespace: row.namespace,
        key: row.key,
        payload: row.payload as T,
        updated_at: Number(row.updated_at ?? 0),
      }))
      .sort((a, b) => b.updated_at - a.updated_at);
  } finally {
    db.close();
  }
}

export async function mobileCacheDelete(ownerId: string, namespace: string, key: string) {
  const db = await openDb();
  try {
    const tx = db.transaction(CACHE_STORE, "readwrite");
    tx.objectStore(CACHE_STORE).delete(cacheId(ownerId, namespace, key));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao remover cache."));
    });
  } finally {
    db.close();
  }
}

export async function mobileCacheClearOwner(ownerId: string) {
  const db = await openDb();
  try {
    const tx = db.transaction(CACHE_STORE, "readwrite");
    const index = tx.objectStore(CACHE_STORE).index("owner");
    const request = index.openKeyCursor(IDBKeyRange.only(ownerId));
    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve();
        tx.objectStore(CACHE_STORE).delete(cursor.primaryKey);
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? new Error("Falha ao limpar dados locais."));
    });
  } finally {
    db.close();
  }
}

export async function mobileEnqueueOutbox<T>(input: {
  ownerId: string;
  entityType: string;
  entityId?: string | null;
  operation: string;
  payload: T;
  baseVersion?: string | null;
  id?: string;
}) {
  const db = await openDb();
  const now = Date.now();
  const id = input.id ?? crypto.randomUUID();
  try {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    tx.objectStore(OUTBOX_STORE).put({
      id,
      owner_id: input.ownerId,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      operation: input.operation,
      payload: input.payload,
      base_version: input.baseVersion ?? null,
      status: "pending",
      attempts: 0,
      last_error: null,
      created_at: now,
      updated_at: now,
    } satisfies OutboxEntry<T>);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao enfileirar alteração offline."));
    });
    return id;
  } finally {
    db.close();
  }
}

export async function mobilePendingOutbox<T>(ownerId: string, limit = 100): Promise<Array<OutboxEntry<T>>> {
  const db = await openDb();
  try {
    const tx = db.transaction(OUTBOX_STORE, "readonly");
    const all = await requestResult<any[]>(tx.objectStore(OUTBOX_STORE).index("owner").getAll(IDBKeyRange.only(ownerId)));
    return all
      .filter((row) => ["pending", "error", "conflict"].includes(String(row.status)))
      .sort((a, b) => Number(a.created_at) - Number(b.created_at))
      .slice(0, Math.max(1, limit)) as Array<OutboxEntry<T>>;
  } finally {
    db.close();
  }
}

export async function mobileMarkOutbox(ownerId: string, id: string, status: OutboxEntry["status"], lastError: string | null) {
  const db = await openDb();
  try {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    const store = tx.objectStore(OUTBOX_STORE);
    const row = await requestResult<any>(store.get(id));
    if (row && row.owner_id === ownerId) {
      store.put({
        ...row,
        status,
        attempts: Number(row.attempts ?? 0) + (status === "error" ? 1 : 0),
        last_error: lastError,
        updated_at: Date.now(),
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao atualizar fila local."));
    });
  } finally {
    db.close();
  }
}

export async function mobileClearDoneOutbox(ownerId: string) {
  const db = await openDb();
  let removed = 0;
  try {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    const store = tx.objectStore(OUTBOX_STORE);
    const rows = await requestResult<any[]>(store.index("owner").getAll(IDBKeyRange.only(ownerId)));
    for (const row of rows) {
      if (row.status === "done") {
        store.delete(row.id);
        removed += 1;
      }
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao limpar fila sincronizada."));
    });
  } finally {
    db.close();
  }
  return removed;
}

export async function mobilePlayNotificationSound() {
  if (!isNativeMobileLocalRuntime()) return false;
  try {
    const plugin = window.Capacitor?.Plugins?.DentalFlowNative;
    if (!plugin?.playNotificationSound) return false;
    await plugin.playNotificationSound();
    return true;
  } catch {
    return false;
  }
}

export async function mobileNativeNotification(input: { title: string; body?: string | null; data?: unknown }) {
  if (!isNativeMobileLocalRuntime()) return false;
  try {
    const plugin = window.Capacitor?.Plugins?.DentalFlowNative;
    if (!plugin?.notify) return false;
    await plugin.notify({ title: input.title || "DentalFlow", body: input.body ?? "", data: input.data ?? null });
    return true;
  } catch {
    return false;
  }
}
