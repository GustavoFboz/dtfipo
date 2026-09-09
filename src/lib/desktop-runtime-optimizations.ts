const DB_NAME = "dentalflow-attachment-cache-v1";
const DB_STORE = "files";
const DB_VERSION = 1;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CACHEABLE_FILE_BYTES = 64 * 1024 * 1024;

const STORAGE_MARKERS = [
  "/storage/v1/object/sign/case-files/",
  "/storage/v1/object/authenticated/case-files/",
  "/storage/v1/object/public/case-files/",
];

type CachedFile = {
  blob: Blob;
  contentType: string;
  contentDisposition: string;
  savedAt: number;
  size: number;
};

let installed = false;
let dbPromise: Promise<IDBDatabase | null> | null = null;
const hot = new Map<string, CachedFile>();
const warming = new Map<string, Promise<CachedFile | null>>();

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function currentOwnerHint(): string | null {
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.includes("auth-token")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as any;
      const userId = parsed?.user?.id ?? parsed?.session?.user?.id ?? parsed?.currentSession?.user?.id;
      if (typeof userId === "string" && userId.length > 10) return userId;
    }
  } catch {
    // Restricted storage: do not persist cross-session file data without an owner.
  }
  return null;
}

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    const raw = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input);
    return new URL(raw, window.location.href);
  } catch {
    return null;
  }
}

function attachmentPath(url: URL): string | null {
  for (const marker of STORAGE_MARKERS) {
    const index = url.pathname.indexOf(marker);
    if (index < 0) continue;
    const encoded = url.pathname.slice(index + marker.length);
    if (!encoded) return null;
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return null;
}

function persistentKey(input: RequestInfo | URL): string | null {
  const owner = currentOwnerHint();
  if (!owner) return null;
  const url = requestUrl(input);
  if (!url) return null;
  const path = attachmentPath(url);
  return path ? `${owner}:${path}` : null;
}

async function deleteCached(key: string) {
  hot.delete(key);
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(key);
  } catch {
    // best effort
  }
}

async function readCached(key: string): Promise<CachedFile | null> {
  const memory = hot.get(key);
  if (memory && Date.now() - memory.savedAt <= CACHE_TTL_MS) return memory;
  if (memory) hot.delete(key);

  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, "readonly");
      const request = tx.objectStore(DB_STORE).get(key);
      request.onsuccess = () => {
        const entry = request.result as CachedFile | undefined;
        if (!entry?.blob || Date.now() - Number(entry.savedAt || 0) > CACHE_TTL_MS) {
          if (entry) void deleteCached(key);
          resolve(null);
          return;
        }
        hot.set(key, entry);
        resolve(entry);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeCached(key: string, entry: CachedFile): Promise<void> {
  hot.set(key, entry);
  const db = await openDb();
  if (!db) return;
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota && estimate.usage && estimate.usage / estimate.quota > 0.88) return;
  } catch {
    // Quota estimation is optional; the IDB write below is still guarded.
  }
  try {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(entry, key);
  } catch {
    // Quota errors must never block opening a case/file.
  }
}

function cachedResponse(entry: CachedFile): Response {
  const headers = new Headers();
  if (entry.contentType) headers.set("content-type", entry.contentType);
  if (entry.contentDisposition) headers.set("content-disposition", entry.contentDisposition);
  headers.set("content-length", String(entry.size));
  headers.set("x-dentalflow-local-cache", "hit");
  return new Response(entry.blob, { status: 200, headers });
}

function keepBackgroundRuntimeAlive() {
  const locks = (navigator as Navigator & {
    locks?: { request: (name: string, options: { mode: "shared" }, callback: () => Promise<void>) => Promise<void> };
  }).locks;
  if (!locks?.request) return;

  void locks
    .request("dentalflow-background-notification-runtime", { mode: "shared" }, async () => {
      // Tauri/Windows cannot disable WebView background suspension directly.
      // Keeping a WebLock pending is the Chromium/WebView workaround that keeps
      // the hidden notification renderer alive more reliably while in the tray.
      await new Promise<void>((resolve) => {
        window.addEventListener("beforeunload", () => resolve(), { once: true });
      });
    })
    .catch(() => undefined);
}

/**
 * Desktop runtime optimizations shared by the current Windows client and future
 * native shells:
 * - keep the hidden notification WebView alive while the app sits in the tray;
 * - persist already-downloaded case files by authenticated owner + storage path;
 * - serve repeat JS fetches from IndexedDB, eliminating repeated model downloads
 *   and most thumbnail/viewer loading on subsequent opens.
 */
export function installDesktopRuntimeOptimizations() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  keepBackgroundRuntimeAlive();
  void navigator.storage?.persist?.().catch(() => false);

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "GET" || init?.cache === "no-store") return nativeFetch(input, init);

    const key = persistentKey(input);
    if (!key) return nativeFetch(input, init);

    const cached = await readCached(key);
    if (cached) return cachedResponse(cached);

    const warmingNow = warming.get(key);
    if (warmingNow) {
      const warmed = await warmingNow;
      if (warmed) return cachedResponse(warmed);
    }

    const response = await nativeFetch(input, init);
    if (!response.ok) return response;

    const declaredLength = Number(response.headers.get("content-length") || "0");
    if (declaredLength > MAX_CACHEABLE_FILE_BYTES) return response;

    const clone = response.clone();
    const warm = (async () => {
      try {
        const blob = await clone.blob();
        if (!blob.size || blob.size > MAX_CACHEABLE_FILE_BYTES) return null;
        const entry: CachedFile = {
          blob,
          contentType: clone.headers.get("content-type") || blob.type || "application/octet-stream",
          contentDisposition: clone.headers.get("content-disposition") || "",
          savedAt: Date.now(),
          size: blob.size,
        };
        await writeCached(key, entry);
        return entry;
      } catch {
        return null;
      } finally {
        warming.delete(key);
      }
    })();
    warming.set(key, warm);

    return response;
  }) as typeof window.fetch;
}
