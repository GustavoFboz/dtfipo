/**
 * Local preview registry used to render attachments instantly while the
 * upload is still in flight. Keyed by the attachment's `storage_path`
 * (a temporary `__local__/...` path during optimistic insert, then the
 * real server path once the upload completes — we `transfer` between them).
 *
 * Holds the original `File` (so 3D thumbnails can be generated from
 * memory without re-downloading) and a blob `objectUrl` (so <img>
 * previews show immediately).
 */
type Entry = { file: File; objectUrl: string };

const map = new Map<string, Entry>();
const listeners = new Set<() => void>();

function emit() { for (const l of listeners) l(); }

export const localPreviews = {
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
  set(path: string, file: File) {
    const existing = map.get(path);
    if (existing) URL.revokeObjectURL(existing.objectUrl);
    map.set(path, { file, objectUrl: URL.createObjectURL(file) });
    emit();
  },
  get(path: string): Entry | undefined { return map.get(path); },
  has(path: string) { return map.has(path); },
  transfer(fromPath: string, toPath: string) {
    const e = map.get(fromPath);
    if (!e) return;
    map.delete(fromPath);
    const existing = map.get(toPath);
    if (existing) URL.revokeObjectURL(existing.objectUrl);
    map.set(toPath, e);
    emit();
  },
  delete(path: string) {
    const e = map.get(path);
    if (!e) return;
    URL.revokeObjectURL(e.objectUrl);
    map.delete(path);
    emit();
  },
};
