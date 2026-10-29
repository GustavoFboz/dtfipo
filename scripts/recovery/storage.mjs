import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fail } from './archive.mjs';

export function objectPath(root, bucket, name) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(bucket) || typeof name !== 'string'
    || !name || name.includes('\\') || name.includes('\0')
    || name.split('/').some(part => !part || part === '.' || part === '..')) fail('RECOVERY_OBJECT_PATH_INVALID');
  const path = resolve(root, bucket, name);
  if (!path.startsWith(resolve(root) + sep)) fail('RECOVERY_OBJECT_PATH_INVALID');
  return path;
}

export async function assertNoSymlinks(root, bucket, name) {
  objectPath(root, bucket, name);
  let path = resolve(root);
  for (const part of [null, bucket, ...name.split('/')]) {
    if (part !== null) path = join(path, part);
    const info = await lstat(path);
    if (info.isSymbolicLink()) fail('RECOVERY_OBJECT_SYMLINK');
  }
}

// This adapter is for an operator's existing local object copy and the real
// filesystem drill. It is not described as a Supabase Storage API test.
export function filesystemSource(root) {
  return async object => {
    await assertNoSymlinks(root, object.bucket, object.name);
    return createReadStream(objectPath(root, object.bucket, object.name));
  };
}

export function supabaseSource(baseUrl, key, transport = fetch) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash
    || (base.pathname !== '/' && base.pathname !== '')) fail('RECOVERY_STORAGE_URL_INVALID');
  if (!key || /[\r\n]/.test(key)) fail('RECOVERY_STORAGE_KEY_INVALID');
  return async object => {
    objectPath('/recovery', object.bucket, object.name);
    const url = new URL(`/storage/v1/object/authenticated/${encodeURIComponent(object.bucket)}/${object.name.split('/').map(encodeURIComponent).join('/')}`, base);
    const headers = { apikey: key };
    if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
    // No retries and no redirects with the service key. The caller supplies a
    // pacing interval; a failed object prevents the COMPLETE manifest.
    const response = await transport(url, { method: 'GET', headers, redirect: 'error',
      cache: 'no-store', signal: AbortSignal.timeout(120_000) });
    if (!response.ok || !response.body) fail('RECOVERY_OBJECT_DOWNLOAD_FAILED');
    return response.body;
  };
}
