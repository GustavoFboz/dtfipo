import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, open, readFile } from 'node:fs/promises';

const magic = Buffer.from('DFREC001');
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const fail = code => { throw new Error(code); };

export async function readKey(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077)) fail('RECOVERY_KEY_PERMISSIONS');
  const key = await readFile(path);
  if (key.length !== 32) fail('RECOVERY_KEY_LENGTH');
  return key;
}

// Each entry has its own nonce and authenticated name. Plaintext is never
// written to disk. Callers stream one entry at a time, including large objects.
export async function seal(chunks, path, key, name) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`dentalflow-recovery-v1:${name}`));
  const output = await open(path, 'wx', 0o600);
  const hash = createHash('sha256');
  let bytes = 0;
  try {
    await output.writeFile(Buffer.concat([magic, iv]));
    for await (const value of chunks) {
      const chunk = Buffer.from(value);
      bytes += chunk.length;
      hash.update(chunk);
      await output.writeFile(cipher.update(chunk));
    }
    await output.writeFile(cipher.final());
    await output.writeFile(cipher.getAuthTag());
    await output.sync();
  } finally { await output.close(); }
  return { bytes, sha256: hash.digest('hex') };
}

export async function* unseal(path, key, name) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 36) fail('RECOVERY_ENTRY_INVALID');
  const input = await open(path, 'r');
  const header = Buffer.alloc(20), tag = Buffer.alloc(16);
  try {
    await input.read(header, 0, 20, 0);
    await input.read(tag, 0, 16, info.size - 16);
  } finally { await input.close(); }
  if (!header.subarray(0, 8).equals(magic)) fail('RECOVERY_ENTRY_INVALID');
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(8));
  decipher.setAAD(Buffer.from(`dentalflow-recovery-v1:${name}`));
  decipher.setAuthTag(tag);
  try {
    if (info.size > 36) {
      for await (const chunk of createReadStream(path, { start: 20, end: info.size - 17 })) {
        const value = decipher.update(chunk);
        if (value.length) yield value;
      }
    }
    const final = decipher.final();
    if (final.length) yield final;
  } catch { fail('RECOVERY_ENTRY_AUTHENTICATION_FAILED'); }
}

export async function digest(chunks) {
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of chunks) { hash.update(chunk); bytes += chunk.length; }
  return { sha256: hash.digest('hex'), bytes };
}

export async function collect(chunks, limit = 32 * 1024 * 1024) {
  const values = []; let bytes = 0;
  for await (const chunk of chunks) {
    bytes += chunk.length;
    if (bytes > limit) fail('RECOVERY_MANIFEST_TOO_LARGE');
    values.push(chunk);
  }
  return Buffer.concat(values).toString('utf8');
}

export async function* lines(chunks) {
  const decoder = new TextDecoder('utf8', { fatal: true }); let pending = '';
  for await (const chunk of chunks) {
    pending += decoder.decode(chunk, { stream: true });
    let index;
    while ((index = pending.indexOf('\n')) >= 0) {
      yield pending.slice(0, index); pending = pending.slice(index + 1);
    }
    if (pending.length > 32 * 1024 * 1024) fail('RECOVERY_ROW_TOO_LARGE');
  }
  pending += decoder.decode();
  if (pending) fail('RECOVERY_TABLE_TRUNCATED');
}
