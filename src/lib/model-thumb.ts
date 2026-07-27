// Lazy STL/PLY thumbnail generator.
// Uses a SINGLE shared WebGL renderer + a small queue to avoid blowing
// past the browser's per-page WebGL context limit (~16). Each thumb
// is rendered once and cached as a JPEG data URL keyed by storage_path.
//
// Persistence: thumbs are also stored in IndexedDB so a page reload does
// NOT have to re-download + re-render every model — they hydrate from
// disk on the next call.

import type * as THREE_NS from "three";
import { getCaseAttachmentUrl } from "@/lib/api";
import { localPreviews } from "@/lib/local-previews";

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

let THREE: typeof THREE_NS | null = null;
let renderer: THREE_NS.WebGLRenderer | null = null;
let scene: THREE_NS.Scene | null = null;
let camera: THREE_NS.PerspectiveCamera | null = null;

const SIZE = 256;

// ---------- IndexedDB persistence ----------
const IDB_NAME = "model-thumbs-v2";
const IDB_STORE = "thumbs";
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

async function idbGet(key: string): Promise<string | undefined> {
  const db = await openDb(); if (!db) return undefined;
  return new Promise((res) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => res(typeof req.result === "string" ? req.result : undefined);
      req.onerror = () => res(undefined);
    } catch { res(undefined); }
  });
}

async function idbSet(key: string, val: string): Promise<void> {
  const db = await openDb(); if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(val, key);
  } catch { /* ignore */ }
}

async function init() {
  if (renderer) return;
  THREE = await import("three");
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE);
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);

  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(-1.2, 1.0, 1.2);
  scene.add(ambient, key);
}

// Process at most one thumbnail at a time to keep GPU work serialized.
let queue: Promise<unknown> = Promise.resolve();

async function renderFromBuffer(name: string, buf: ArrayBuffer): Promise<string> {
  await init();
  if (!THREE || !renderer || !scene || !camera) throw new Error("renderer not ready");

  const ext = name.split(".").pop()?.toLowerCase();
  let geometry: THREE_NS.BufferGeometry;
  let withColors = false;
  if (ext === "stl") {
    const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
    geometry = new STLLoader().parse(buf);
  } else if (ext === "ply") {
    const { PLYLoader } = await import("three/addons/loaders/PLYLoader.js");
    geometry = new PLYLoader().parse(buf);
    withColors = !!geometry.getAttribute("color");
  } else {
    throw new Error("unsupported");
  }

  geometry.computeVertexNormals();
  geometry.center();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshPhysicalMaterial({
    color: withColors ? 0xffffff : 0x3aa0ff,
    vertexColors: withColors,
    metalness: 0,
    roughness: 0.4,
    clearcoat: 0.5,
    clearcoatRoughness: 0.25,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const radius = geometry.boundingSphere?.radius ?? 50;
  camera.aspect = 1;
  camera.near = Math.max(radius / 100, 0.01);
  camera.far = radius * 100;
  const dist = radius * 2.6;
  camera.position.set(dist * 0.5, dist * 0.45, dist * 0.85);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL("image/png");

  scene.remove(mesh);
  geometry.dispose();
  material.dispose();

  return dataUrl;
}

async function renderOne(path: string, name: string): Promise<string> {
  const local = localPreviews.get(path);
  let buf: ArrayBuffer;
  if (local) {
    buf = await local.file.arrayBuffer();
  } else {
    const url = await getCaseAttachmentUrl(path);
    const res = await fetch(url);
    if (!res.ok) throw new Error("fetch failed");
    buf = await res.arrayBuffer();
  }
  return renderFromBuffer(name, buf);
}


/** Synchronous peek into the in-memory cache. Returns the dataURL if it's
 *  already hot, otherwise undefined. Use as initial state to avoid any
 *  loading flash when switching tabs after the thumb was prewarmed. */
export function peekModelThumb(storagePath: string): string | undefined {
  return cache.get(storagePath);
}

export function getModelThumb(storagePath: string, fileName: string): Promise<string> {
  const cached = cache.get(storagePath);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(storagePath);
  if (pending) return pending;

  const p = (async () => {
    // 1) Try the persistent disk cache first — avoids re-downloading + re-rendering on reload.
    const disk = await idbGet(storagePath);
    if (disk) {
      cache.set(storagePath, disk);
      return disk;
    }
    // 2) Otherwise render through the serialized GPU queue.
    const url = await new Promise<string>((resolve, reject) => {
      queue = queue.then(() => renderOne(storagePath, fileName).then(resolve, reject)).catch(() => undefined);
    });
    cache.set(storagePath, url);
    void idbSet(storagePath, url);
    return url;
  })().finally(() => { inflight.delete(storagePath); });

  inflight.set(storagePath, p);
  return p;
}

/** Fire-and-forget prefetch (used to warm thumbs as soon as the attachment
 *  list loads, so opening the "Modelos" tab is instant). */
export function prefetchModelThumb(storagePath: string, fileName: string): void {
  if (cache.has(storagePath) || inflight.has(storagePath)) return;
  void getModelThumb(storagePath, fileName).catch(() => undefined);
}

/** Generate the thumbnail directly from a local File at upload time.
 *  Seeds both the in-memory cache and IndexedDB keyed by storage_path so the
 *  thumb is available instantly the moment the attachment appears in the list
 *  (and on every future reload). No-op for non-STL/PLY files. */
export function primeModelThumbFromFile(storagePath: string, file: File): void {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "stl" && ext !== "ply") return;
  if (cache.has(storagePath) || inflight.has(storagePath)) return;

  const p = (async () => {
    const disk = await idbGet(storagePath);
    if (disk) { cache.set(storagePath, disk); return disk; }
    const url = await new Promise<string>((resolve, reject) => {
      queue = queue
        .then(async () => {
          const buf = await file.arrayBuffer();
          return renderFromBuffer(file.name, buf);
        })
        .then(resolve, reject)
        .catch(() => undefined);
    });
    cache.set(storagePath, url);
    void idbSet(storagePath, url);
    return url;
  })().finally(() => { inflight.delete(storagePath); });

  inflight.set(storagePath, p);
}

