import { supabase } from "@/integrations/supabase/client";
import { getProvisionedDesktopIdentity, isDentalFlowDesktop, localCacheDelete, localCacheGet, localCacheList, localCachePut } from "./desktop-local";
import { withDesktopCloudTimeout } from "./desktop-cloud";
import { readPrivateAttachmentImage } from "./desktop-runtime-optimizations";
import { hasOfflineAccess, offlineAccessDeadline, OFFLINE_ACCESS_EXPIRED_EVENT } from "./offline-access-policy";
import { parsePrivateFileReference, PRIVATE_FILE_URL_TTL_SECONDS, type PrivateFileReference } from "./private-file-reference";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_CACHE_NS = "private-images:v1";
const MAX_MEMORY_ENTRIES = 200;
const MAX_INSTALLED_IMAGES = 40;
const MAX_INSTALLED_IMAGE_BYTES = 20 * 1024 * 1024;
const storageOrigin = () => import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
type Scope = { ownerId: string | null; generation: number; ready: boolean };
type Resolution = { url: string; renewAt: number; release?: () => void };
type CachedImage = { dataUrl: string; authorizedAt: number; bucket: string; path: string };
const emptyScope: Scope = { ownerId: null, generation: 0, ready: false };
let scope = emptyScope;
let observing = false;
let authRevision = 0;
const listeners = new Set<() => void>();
const memory = new Map<string, Resolution>();
const pending = new Map<string, Promise<Resolution>>();
const imageWrites = new Map<string, Promise<void>>();

function applyOwner(ownerId: string | null, force = false) {
  if (scope.ready && scope.ownerId === ownerId && !force) return;
  scope = { ownerId, generation: scope.generation + 1, ready: true };
  memory.clear(); pending.clear(); listeners.forEach((listener) => listener());
}

function ensureObserver() {
  if (observing || typeof window === "undefined") return;
  observing = true;
  const initialRevision = authRevision;
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION" && authRevision !== initialRevision) return;
    authRevision++;
    applyOwner(event === "SIGNED_OUT" ? null : session?.user.id ?? null, event === "SIGNED_OUT" || event === "SIGNED_IN");
  });
  void supabase.auth.getSession().then(({ data, error }) => {
    if (authRevision === initialRevision) applyOwner(error ? null : data.session?.user.id ?? null);
  }).catch(() => { if (authRevision === initialRevision) applyOwner(null); });
  window.addEventListener(OFFLINE_ACCESS_EXPIRED_EVENT, () => { authRevision++; applyOwner(null, true); });
}

export function subscribePrivateFileScope(listener: () => void) {
  listeners.add(listener); ensureObserver(); return () => { listeners.delete(listener); };
}
export const getPrivateFileScope = () => scope;
export const getServerPrivateFileScope = () => emptyScope;

function assertScope(expected: Scope) {
  if (!expected.ownerId || scope !== expected) throw new Error("PRIVATE_FILE_SESSION_CHANGED");
}

function cacheKey(reference: PrivateFileReference) { return JSON.stringify([reference.bucket, reference.path]); }

async function offlineIdentity(expected: Scope) {
  assertScope(expected);
  const identity = await getProvisionedDesktopIdentity();
  assertScope(expected);
  if (!identity || identity.user_id !== expected.ownerId || !hasOfflineAccess(identity)) {
    throw new Error("PRIVATE_FILE_OFFLINE_EXPIRED");
  }
  return identity;
}

async function readOfflineImage(reference: PrivateFileReference, expected: Scope): Promise<Resolution> {
  if (!isDentalFlowDesktop()) throw new Error("PRIVATE_FILE_REQUIRES_NETWORK");
  const identity = await offlineIdentity(expected);
  if (reference.bucket === "case-files") {
    const blob = await readPrivateAttachmentImage(expected.ownerId!, reference.path);
    await offlineIdentity(expected);
    if (blob) {
      const url = URL.createObjectURL(blob);
      return { url, renewAt: Math.min(offlineAccessDeadline(identity), Date.now() + 30_000), release: () => URL.revokeObjectURL(url) };
    }
  }
  const cached = await localCacheGet<CachedImage>(expected.ownerId!, IMAGE_CACHE_NS, cacheKey(reference));
  await offlineIdentity(expected);
  const value = cached?.payload;
  if (!value || value.bucket !== reference.bucket || value.path !== reference.path
    || !/^data:image\/(?:jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(value.dataUrl)
    || value.dataUrl.length > MAX_IMAGE_BYTES * 1.4 || !Number.isFinite(value.authorizedAt)
    || value.authorizedAt > Date.now()) throw new Error("PRIVATE_FILE_NOT_CACHED");
  return { url: value.dataUrl, renewAt: Math.min(offlineAccessDeadline(identity), Date.now() + 30_000) };
}

async function cacheInstalledImage(reference: PrivateFileReference, url: string, expected: Scope) {
  if (!isDentalFlowDesktop()) return;
  try {
    await offlineIdentity(expected);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: "omit", cache: "no-store" });
      if (!response.ok || response.redirected) return;
      const type = response.headers.get("content-type")?.split(";")[0].trim();
      if (!type || !/^image\/(jpeg|png|gif|webp)$/.test(type) || !response.body) return;
      const reader = response.body.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > MAX_IMAGE_BYTES) { await reader.cancel(); return; }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      await offlineIdentity(expected);
      const previous = imageWrites.get(expected.ownerId!) ?? Promise.resolve();
      const write = previous.catch(() => undefined).then(async () => {
        await offlineIdentity(expected);
        await localCachePut(expected.ownerId!, IMAGE_CACHE_NS, cacheKey(reference), {
          bucket: reference.bucket, path: reference.path, authorizedAt: Date.now(), dataUrl: `data:${type};base64,${btoa(binary)}`,
        } satisfies CachedImage);
        const entries = await localCacheList<CachedImage>(expected.ownerId!, IMAGE_CACHE_NS, MAX_INSTALLED_IMAGES + 1);
        let bytes = 0;
        for (let index = 0; index < entries.length; index++) {
          bytes += entries[index].payload.dataUrl.length;
          if (index >= MAX_INSTALLED_IMAGES || bytes > MAX_INSTALLED_IMAGE_BYTES) {
            await offlineIdentity(expected);
            await localCacheDelete(expected.ownerId!, IMAGE_CACHE_NS, entries[index].key);
          }
        }
      });
      imageWrites.set(expected.ownerId!, write);
      try { await write; } finally { if (imageWrites.get(expected.ownerId!) === write) imageWrites.delete(expected.ownerId!); }
    } finally { clearTimeout(timer); }
  } catch { /* An optional image mirror may fail without breaking the online view. */ }
}

/** Shared Web/installed transport. Each fresh signature uses the caller's RLS;
 * only a verified owner may read an installed image mirror. No bearer URL is
 * written to the local cache, and reading an image never renews offline access. */
export async function resolvePrivateFile(value: string, expected?: Scope): Promise<Resolution> {
  ensureObserver();
  if (!expected) {
    const before = authRevision;
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session || before !== authRevision) throw new Error("PRIVATE_FILE_SESSION_CHANGED");
    if (!scope.ready) applyOwner(data.session.user.id);
    expected = scope;
    if (expected.ownerId !== data.session.user.id) throw new Error("PRIVATE_FILE_SESSION_CHANGED");
  }
  assertScope(expected);
  const reference = parsePrivateFileReference(value, storageOrigin());
  if (!reference) {
    if (!/^(?:https:\/\/|blob:|data:image\/(?:jpeg|png|gif|webp);base64,)/.test(value)) throw new Error("PRIVATE_FILE_REFERENCE_INVALID");
    return { url: value, renewAt: Date.now() + PRIVATE_FILE_URL_TTL_SECONDS * 1000 };
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return readOfflineImage(reference, expected);
  const key = JSON.stringify([expected.ownerId, expected.generation, reference.bucket, reference.path]);
  const cached = memory.get(key);
  if (cached && cached.renewAt > Date.now()) return cached;
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const task = (async () => {
    const { data: auth, error: authError } = await supabase.auth.getSession();
    assertScope(expected);
    if (authError || !auth.session || auth.session.user.id !== expected.ownerId) throw new Error("PRIVATE_FILE_SESSION_CHANGED");
    const startedAt = Date.now();
    const { data, error } = await withDesktopCloudTimeout("acesso ao arquivo", Promise.resolve(
      supabase.storage.from(reference.bucket).createSignedUrl(reference.path, PRIVATE_FILE_URL_TTL_SECONDS)), 12_000);
    assertScope(expected);
    if (error || !data?.signedUrl) throw new Error("PRIVATE_FILE_ACCESS_DENIED");
    const signed = parsePrivateFileReference(data.signedUrl, storageOrigin());
    if (!signed || signed.bucket !== reference.bucket || signed.path !== reference.path) throw new Error("PRIVATE_FILE_RESPONSE_INVALID");
    const renewed = { url: data.signedUrl, renewAt: startedAt + (PRIVATE_FILE_URL_TTL_SECONDS - 30) * 1000 };
    if (renewed.renewAt <= Date.now()) throw new Error("PRIVATE_FILE_RESPONSE_EXPIRED");
    if (memory.size >= MAX_MEMORY_ENTRIES) memory.delete(memory.keys().next().value!);
    memory.set(key, renewed);
    void cacheInstalledImage(reference, renewed.url, expected);
    return renewed;
  })().finally(() => { if (pending.get(key) === task) pending.delete(key); });
  pending.set(key, task); return task;
}
