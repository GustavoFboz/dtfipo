import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { fail, sha256 } from './archive.mjs';

const schemas = ['public', 'auth', 'storage', 'supabase_migrations'];
const connections = new WeakMap();
export const identifier = name => '"' + String(name).replaceAll('"', '""') + '"';
export const relation = table => `${identifier(table.schema)}.${identifier(table.name)}`;

export function connect(url, readOnly = true) {
  const state = { generation: 0 };
  const sql = postgres(url, { max: 1, connect_timeout: 10, idle_timeout: 20, prepare: false,
    onnotice() {}, onclose() { state.generation++; }, connection: { application_name: 'dentalflow-operational-recovery',
      statement_timeout: 60_000, lock_timeout: 2_000, timezone: 'UTC',
      ...(readOnly ? { default_transaction_read_only: 'on' } : {}) } });
  connections.set(sql, state);
  return sql;
}

// postgres@3.4.9 begin() can continue its callback and attempt ROLLBACK on a
// dead reserved connection (#1248 upstream). Reserve explicitly, fence the
// connection generation and never send another command after disconnect.
// There is no reconnect/retry of a partially executed recovery transaction.
export async function transaction(sql, options, fn) {
  if (!['', 'isolation level repeatable read read only'].includes(options)) fail('RECOVERY_TRANSACTION_OPTIONS_INVALID');
  const session = await sql.reserve(), state = connections.get(sql), generation = state.generation;
  let broken = false, began = false;
  const check = () => { if (broken || state.generation !== generation) fail('RECOVERY_TRANSACTION_CONNECTION_LOST'); };
  const tx = new Proxy(session, {
    apply(target, receiver, args) { check(); return Reflect.apply(target, receiver, args); },
    get(target, name) {
      const value = Reflect.get(target, name);
      return typeof value === 'function' ? (...args) => { check(); return Reflect.apply(value, target, args); } : value;
    },
  });
  try {
    await tx.unsafe('BEGIN ' + options).simple(); began = true;
    const result = await fn(tx);
    const committed = await tx.unsafe('COMMIT').simple();
    if (committed.command !== 'COMMIT') fail('RECOVERY_TRANSACTION_NOT_COMMITTED');
    return result;
  } catch (error) {
    broken = state.generation !== generation || /^(?:CONNECTION_|CONNECT_TIMEOUT|08|57P0)/.test(error?.code ?? '')
      || error?.message === 'RECOVERY_TRANSACTION_CONNECTION_LOST';
    if (began && !broken) {
      try { await tx.unsafe('ROLLBACK').simple(); }
      catch { broken = true; }
    }
    throw error;
  } finally { if (!broken && state.generation === generation) session.release(); }
}

export function assertTargetUrl(value) {
  const url = new URL(value);
  // There is deliberately no remote restore escape hatch. A local tunnel by
  // itself is insufficient: marker, empty clinical data and no cron also apply.
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
    || !/^\/dentalflow_recovery_[a-z0-9_]+$/.test(url.pathname)
    || url.search) fail('RECOVERY_TARGET_NOT_ISOLATED');
  return url;
}

export async function inventory(sql) {
  const tables = await sql`
    SELECT n.nspname AS schema, c.relname AS name,
      (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
        'generated',a.attgenerated,'identity',a.attidentity,'notnull',a.attnotnull) ORDER BY a.attnum)
       FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
      coalesce((SELECT jsonb_agg(a.attname ORDER BY k.ordinality) FROM pg_index i
       CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ordinality)
       JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum WHERE i.indrelid=c.oid AND i.indisprimary),'[]'::jsonb) AS pk
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ${sql(schemas)} AND c.relkind IN ('r','p') AND NOT c.relispartition
    ORDER BY n.nspname,c.relname`;
  if (!tables.some(t => t.schema === 'public' && t.name === 'billing_payments')
    || !tables.some(t => t.schema === 'storage' && t.name === 'objects')) fail('RECOVERY_DATABASE_CONTRACT_MISSING');
  return tables;
}

export const schemaDigest = tables => sha256(JSON.stringify(tables));

export async function* tableChunks(sql, table) {
  const order = table.pk.length ? table.pk.map(identifier).join(',') : 'to_jsonb(t)::text COLLATE "C"';
  // Keep JSON as PostgreSQL text. Parsing a bigint into a JavaScript Number
  // here would silently change financial/audit values during a round trip.
  for await (const batch of sql.unsafe(`SELECT to_jsonb(t)::text AS value FROM ${relation(table)} t ORDER BY ${order}`).cursor(128)) {
    for (const row of batch) yield Buffer.from(row.value + '\n');
  }
}

export async function tableDigest(sql, table) {
  const hash = createHash('sha256'); let rows = 0, bytes = 0;
  for await (const chunk of tableChunks(sql, table)) { hash.update(chunk); bytes += chunk.length; rows++; }
  return { sha256: hash.digest('hex'), bytes, rows };
}

export async function objects(sql) {
  return sql`SELECT bucket_id AS bucket, name, version,
    (metadata->>'size') AS size, coalesce(metadata->>'mimetype','application/octet-stream') AS mime,
    id::text AS id, updated_at::text AS updated_at FROM storage.objects ORDER BY bucket_id,name`;
}
export const objectDigest = values => sha256(JSON.stringify(values));

export async function assertStorageConsistent(sql) {
  const [row] = await sql`SELECT
    (SELECT count(*) FROM public.storage_files WHERE status='reserved')::int AS reserved,
    (SELECT count(*) FROM public.storage_files f LEFT JOIN storage.objects o
      ON o.bucket_id=f.bucket AND o.name=f.object_path WHERE f.status='ready'
      AND (o.id IS NULL OR (o.metadata->>'size')::bigint IS DISTINCT FROM f.size_bytes))::int AS broken`;
  if (row.reserved || row.broken) fail('RECOVERY_SOURCE_STORAGE_NOT_QUIESCENT');
  for (const name of ['s3_multipart_uploads', 's3_multipart_uploads_parts']) {
    const [present] = await sql`SELECT to_regclass(${`storage.${name}`}) IS NOT NULL AS yes`;
    if (present.yes) {
      const [count] = await sql.unsafe(`SELECT count(*)::int AS n FROM storage.${identifier(name)}`);
      if (count.n) fail('RECOVERY_SOURCE_MULTIPART_PENDING');
    }
  }
}

export async function sequenceStates(sql) {
  const values = await sql`SELECT schemaname AS schema,sequencename AS name,increment_by::text AS increment,
    min_value::text AS min,max_value::text AS max,cycle FROM pg_sequences
    WHERE schemaname IN ${sql(schemas)} ORDER BY schemaname,sequencename`;
  for (const value of values) {
    const [state] = await sql.unsafe(`SELECT last_value::text AS last,is_called FROM ${relation(value)}`);
    let next = BigInt(state.last) + (state.is_called ? BigInt(value.increment) : 0n);
    if (next > BigInt(value.max) || next < BigInt(value.min)) {
      if (!value.cycle) fail('RECOVERY_SEQUENCE_EXHAUSTED');
      next = BigInt(value.increment) > 0n ? BigInt(value.min) : BigInt(value.max);
    }
    value.next = next.toString();
  }
  return values;
}

export async function assertTargetGuard(sql, token) {
  if (!/^[a-f0-9]{64}$/.test(token ?? '')) fail('RECOVERY_GUARD_REQUIRED');
  const [guard] = await sql`SELECT mode,token_hash FROM recovery_guard.destination WHERE singleton=true FOR UPDATE`;
  if (guard?.mode !== 'isolated-offline-no-runtime' || guard.token_hash !== sha256(token)) fail('RECOVERY_GUARD_MISMATCH');
  const [row] = await sql`SELECT (SELECT count(*) FROM auth.users)::int AS users,
    (SELECT count(*) FROM public.patients)::int AS patients,(SELECT count(*) FROM public.cases)::int AS cases,
    (SELECT count(*) FROM public.account_subscriptions)::int AS subscriptions,
    (SELECT count(*) FROM storage.objects)::int AS objects`;
  if (Object.values(row).some(n => n !== 0)) fail('RECOVERY_TARGET_NOT_EMPTY');
  const [cron] = await sql`SELECT to_regclass('cron.job') IS NOT NULL AS present`;
  if (cron.present) {
    const [active] = await sql`SELECT count(*)::int AS n FROM cron.job WHERE active`;
    if (active.n) fail('RECOVERY_TARGET_HAS_ACTIVE_JOBS');
  }
}

export async function validateForeignKeys(sql, tables) {
  const constraints = await sql`
    SELECT n.nspname AS schema,c.relname AS name,pn.nspname AS parent_schema,pc.relname AS parent_name,
      f.confmatchtype AS match,
      (SELECT jsonb_agg(jsonb_build_object('child',a.attname,'parent',pa.attname) ORDER BY k.ordinality)
       FROM unnest(f.conkey,f.confkey) WITH ORDINALITY k(child_key,parent_key,ordinality)
       JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=k.child_key
       JOIN pg_attribute pa ON pa.attrelid=f.confrelid AND pa.attnum=k.parent_key) AS keys
    FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_class pc ON pc.oid=f.confrelid JOIN pg_namespace pn ON pn.oid=pc.relnamespace
    WHERE f.contype='f' AND n.nspname IN ${sql(schemas)}`;
  const names = new Set(tables.map(t => `${t.schema}.${t.name}`));
  for (const c of constraints) {
    if (!names.has(`${c.schema}.${c.name}`)) continue;
    if (!['s', 'f'].includes(c.match)) fail('RECOVERY_FOREIGN_KEY_MATCH_UNSUPPORTED');
    const all = c.keys.map(k => `c.${identifier(k.child)} IS NOT NULL`).join(' AND ');
    const any = c.keys.map(k => `c.${identifier(k.child)} IS NOT NULL`).join(' OR ');
    const equality = c.keys.map(k => `p.${identifier(k.parent)}=c.${identifier(k.child)}`).join(' AND ');
    const partial = c.match === 'f' ? `((${any}) AND NOT (${all})) OR ` : '';
    const [row] = await sql.unsafe(`SELECT EXISTS(SELECT 1 FROM ${relation(c)} c WHERE ${partial}
      ((${all}) AND NOT EXISTS(SELECT 1 FROM ${identifier(c.parent_schema)}.${identifier(c.parent_name)} p WHERE ${equality}))) AS broken`);
    if (row.broken) fail('RECOVERY_FOREIGN_KEY_BROKEN');
  }
  return constraints.length;
}
