import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collect, digest, lines, readKey, seal, unseal } from './archive.mjs';
import { assertTargetUrl } from './database.mjs';
import { filesystemSource, objectPath, supabaseSource } from './storage.mjs';

async function temporary(fn) {
  const root = await mkdtemp(join(tmpdir(), 'df-recovery-test-'));
  try { return await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test('encrypted streaming round trip includes empty and large binary entries with private file permissions', async () => temporary(async root => {
  for (const bytes of [Buffer.alloc(0), randomBytes(3 * 1024 * 1024 + 1)]) {
    const key = randomBytes(32), name = `entry-${bytes.length}.enc`, path = join(root, name);
    async function* chunks() { for (let i = 0; i < bytes.length; i += 7919) yield bytes.subarray(i, i + 7919); }
    const expected = await seal(chunks(), path, key, name);
    assert.deepEqual(await digest(unseal(path, key, name)), expected);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal((await readFile(path)).includes(bytes.subarray(0, 50)), bytes.length === 0);
  }
}));

test('wrong keys, replaced ciphertext, renamed entries and truncated tags fail authentication', async () => temporary(async root => {
  const key = randomBytes(32), path = join(root, 'entry.enc');
  await seal([Buffer.from('private patient and financial payload')], path, key, 'entry.enc');
  const original = await readFile(path);
  await assert.rejects(collect(unseal(path, randomBytes(32), 'entry.enc')), /AUTHENTICATION_FAILED/);
  await assert.rejects(collect(unseal(path, key, 'another.enc')), /AUTHENTICATION_FAILED/);
  for (const value of [Buffer.from(original), original.subarray(0, original.length - 1)]) {
    value[22] ^= 1;
    await writeFile(path, value);
    await assert.rejects(collect(unseal(path, key, 'entry.enc')), /AUTHENTICATION_FAILED/);
  }
}));

test('UTF-8 and bigint JSON survive chunk boundaries without conversion to Number', async () => {
  const value = '{"name":"ação 🦷","number":900719925474099312345}\n';
  const bytes = Buffer.from(value), values = [];
  async function* chunks() { for (const byte of bytes) yield Buffer.from([byte]); }
  for await (const line of lines(chunks())) values.push(line);
  assert.deepEqual(values, [value.trimEnd()]);
  await assert.rejects(async () => { for await (const line of lines([Buffer.from(value.trimEnd())])) void line; }, /TABLE_TRUNCATED/);
});

test('keys require exactly 32 bytes, private permissions and no symlink', async () => temporary(async root => {
  const path = join(root, 'key');
  await writeFile(path, randomBytes(32), { mode: 0o600 });
  assert.equal((await readKey(path)).length, 32);
  await chmod(path, 0o644); await assert.rejects(readKey(path), /KEY_PERMISSIONS/);
  await chmod(path, 0o600); await writeFile(path, randomBytes(31)); await assert.rejects(readKey(path), /KEY_LENGTH/);
  await symlink(path, join(root, 'alias')); await assert.rejects(readKey(join(root, 'alias')), /KEY_PERMISSIONS/);
}));

test('restore refuses remote hosts, ordinary database names, encoded names and extra connection options', () => {
  assertTargetUrl('postgresql://postgres:example@127.0.0.1:54326/dentalflow_recovery_drill');
  for (const url of ['postgresql://postgres:x@production.example/postgres',
    'postgresql://postgres:x@127.0.0.1:5432/postgres', 'postgresql://postgres:x@localhost/dentalflow_recovery_drill',
    'postgresql://postgres:x@127.0.0.1/dentalflow_recovery_%64rill',
    'postgresql://postgres:x@127.0.0.1/dentalflow_recovery_drill?options=-csearch_path=public'])
    assert.throws(() => assertTargetUrl(url), /TARGET_NOT_ISOLATED/);
});

test('object paths cannot escape their vault and filesystem source refuses symlinks', async () => temporary(async root => {
  for (const [bucket, name] of [['..','x'], ['cases','../x'], ['cases','/x'], ['cases','a//x'],
    ['cases','a/./x'], ['cases','a\\x'], ['cases','a\0x']]) assert.throws(() => objectPath(root, bucket, name), /PATH_INVALID/);
  await symlink(root, join(root, 'cases'));
  await assert.rejects(filesystemSource(root)({ bucket: 'cases', name: 'file.bin' }), /SYMLINK/);
}));

test('Supabase object transport is serialized by the caller, GET only, bounded and never redirects or retries', async () => {
  for (const key of ['sb_secret_example', 'legacy-service-jwt']) {
    let calls = 0;
    const get = supabaseSource('https://source.supabase.co', key, async (url, init) => {
      calls++;
      assert.equal(url.toString(), 'https://source.supabase.co/storage/v1/object/authenticated/cases/a%20b/%C3%A7.bin');
      assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
      assert.equal(init.headers.apikey, key); assert.equal(init.headers.Authorization, key.startsWith('sb_') ? undefined : `Bearer ${key}`);
      assert(init.signal instanceof AbortSignal); return new Response(Buffer.from('actual file bytes'));
    });
    assert.equal(await collect(await get({ bucket: 'cases', name: 'a b/ç.bin' })), 'actual file bytes');
    assert.equal(calls, 1);
  }
  let calls = 0;
  const failed = supabaseSource('https://source.supabase.co', 'example', async () => { calls++; return new Response('private error', { status: 503 }); });
  await assert.rejects(failed({ bucket: 'cases', name: 'file' }), /^Error: RECOVERY_OBJECT_DOWNLOAD_FAILED$/);
  assert.equal(calls, 1);
  for (const url of ['http://source.supabase.co', 'https://user:password@source.supabase.co', 'https://source.supabase.co/other'])
    assert.throws(() => supabaseSource(url, 'key'), /URL_INVALID/);
});
