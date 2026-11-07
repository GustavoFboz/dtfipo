import { pathToFileURL } from 'node:url';
import { readKey } from './recovery/archive.mjs';
import { backup, restore, verify } from './recovery/operations.mjs';
import { filesystemSource, supabaseSource } from './recovery/storage.mjs';

export async function main(args = process.argv.slice(2), env = process.env) {
  const [command, directory, filesOutput] = args;
  if (!['backup','verify','restore'].includes(command) || !directory) throw new Error('RECOVERY_USAGE');
  const key = await readKey(env.DENTALFLOW_RECOVERY_KEY_FILE);
  const restoreSql = env.DENTALFLOW_RECOVERY_SCHEMA_FILE ?? 'public/restore.sql';
  if (command === 'verify') return verify({ input: directory, key });
  if (command === 'restore') return restore({ input: directory, key, targetUrl: env.DENTALFLOW_RECOVERY_TARGET_DB_URL,
    guardToken: env.DENTALFLOW_RECOVERY_GUARD_TOKEN, filesOutput, restoreSql });
  if (!env.DENTALFLOW_RECOVERY_SOURCE_DB_URL) throw new Error('RECOVERY_SOURCE_REQUIRED');
  const readObject = env.DENTALFLOW_RECOVERY_SOURCE_FILES
    ? filesystemSource(env.DENTALFLOW_RECOVERY_SOURCE_FILES)
    : supabaseSource(env.DENTALFLOW_RECOVERY_STORAGE_URL, env.DENTALFLOW_RECOVERY_STORAGE_KEY);
  const intervalMs = Number(env.DENTALFLOW_RECOVERY_INTERVAL_MS ?? '250');
  return backup({ sourceUrl: env.DENTALFLOW_RECOVERY_SOURCE_DB_URL, output: directory, key, readObject, restoreSql,
    intervalMs, revision: env.DENTALFLOW_RECOVERY_REVISION ?? 'unrecorded' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await main(), null, 2)); }
  catch (error) {
    // Arbitrary DB/HTTP errors may contain source URLs, SQL or patient data.
    // Only our fixed codes reach stdout/stderr. No stack, query or response body.
    console.error(/^RECOVERY_[A-Z_]+$/.test(error?.message ?? '') ? error.message : 'RECOVERY_OPERATION_FAILED');
    process.exitCode = 1;
  }
}
