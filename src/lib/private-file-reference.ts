export const PRIVATE_FILE_URL_TTL_SECONDS = 300;
export const PRIVATE_FILE_BUCKETS = ["patient-photos", "patient-files", "avatars", "case-files"] as const;
export type PrivateFileBucket = typeof PRIVATE_FILE_BUCKETS[number];
export type PrivateFileReference = { bucket: PrivateFileBucket; path: string };

function validPath(path: string) {
  return path.length > 0 && path.length <= 1024 && !/[\\\u0000-\u001f\u007f?#]/.test(path)
    && path.split("/").every((segment) => !!segment && segment !== "." && segment !== "..");
}

export function privateFileReference(bucket: PrivateFileBucket, path: string): string {
  if (!PRIVATE_FILE_BUCKETS.includes(bucket) || !validPath(path)) throw new Error("PRIVATE_FILE_REFERENCE_INVALID");
  return `storage://${bucket}/${path}`;
}

/** Discard the old bearer token. A stored URL is a reference, never authority. */
export function parsePrivateFileReference(value: string, storageOrigin: string): PrivateFileReference | null {
  let bucket: string;
  let path: string;
  if (value.startsWith("storage://")) {
    const split = value.slice(10).indexOf("/");
    if (split < 0) throw new Error("PRIVATE_FILE_REFERENCE_INVALID");
    bucket = value.slice(10, split + 10); path = value.slice(split + 11);
  } else {
    let url: URL;
    try { url = new URL(value); } catch { return null; }
    const match = url.pathname.match(/^\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/);
    if (!match) return null;
    if (url.origin !== new URL(storageOrigin).origin || url.username || url.password) {
      throw new Error("PRIVATE_FILE_ORIGIN_INVALID");
    }
    try { bucket = decodeURIComponent(match[1]); path = decodeURIComponent(match[2]); }
    catch { throw new Error("PRIVATE_FILE_REFERENCE_INVALID"); }
  }
  if (!PRIVATE_FILE_BUCKETS.includes(bucket as PrivateFileBucket) || !validPath(path)) {
    throw new Error("PRIVATE_FILE_REFERENCE_INVALID");
  }
  return { bucket: bucket as PrivateFileBucket, path };
}
