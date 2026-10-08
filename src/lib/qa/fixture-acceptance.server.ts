import { createHash, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { z } from 'zod';

const contract = 'dentalflow-fixture-acceptance-v1';
const fixtureSchema = z.object({ user_id: z.string().uuid(), email: z.string().endsWith('@example.invalid'), clinic_id: z.string().uuid() });
const jobSchema = z.object({ id: z.string().uuid(), kind: z.enum(['identity','storage','billing']), fixtures: z.array(fixtureSchema).length(2) });
export type Job = z.infer<typeof jobSchema>;
export type Check = { check: string; passed: boolean; http_status?: number; code?: string;
  resource_id?: string; state?: string; count?: number; amount_cents?: number; period_end?: string; digest?: string };
type Receipt = { contract: string; kind: Job['kind']; passed: boolean; checked_at: string; checks: Check[]; fixture_ids: string[] };
type Dependencies = {
  claim?: (id: string, hash: string) => Promise<unknown>;
  finish?: (id: string, receipt: Receipt) => Promise<boolean>;
  run?: (job: Job) => Promise<Check[]>;
};
export class FixtureFailure extends Error {
  constructor(readonly safeCode: string, readonly httpStatus?: number) { super(safeCode); }
}
const reply = (status: number, body: object) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** A backend-created, expiring, single-use capability selects a fixed test job.
 * The request cannot select users, link types, passwords, roles, or destinations.
 * Credentials and generated links exist only in server memory and never return. */
export async function handleFixtureAcceptance(request: Request, dependencies: Dependencies = {}): Promise<Response> {
  if (request.method !== 'POST') return reply(405, { available: false });
  if (request.headers.has('origin')) return reply(403, { available: false });
  const token = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return reply(403, { available: false });
  if (Number(request.headers.get('content-length') ?? '0') > 100) return reply(413, { available: false });
  let id: string;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 100) return reply(413, { available: false });
    id = z.object({ jobId: z.string().uuid() }).strict().parse(JSON.parse(text)).jobId;
  } catch { return reply(400, { available: false }); }
  const hash = createHash('sha256').update(token).digest('hex');
  let job: Job;
  try {
    const value = dependencies.claim ? await dependencies.claim(id, hash) : await claimJob(id, hash);
    job = jobSchema.parse(value);
    if (job.id !== id) throw new Error('JOB_MISMATCH');
    assertAllowlist(job);
  } catch { return reply(403, { available: false }); }
  let checks: Check[];
  try { checks = await (dependencies.run ?? runJob)(job); }
  catch (error) { checks = [{ check: 'execution', passed: false, code: error instanceof FixtureFailure ? error.safeCode : 'FIXTURE_EXECUTION_FAILED',
    ...(error instanceof FixtureFailure && error.httpStatus ? { http_status: error.httpStatus } : {}) }]; }
  const receipt: Receipt = { contract, kind: job.kind, passed: checks.length > 0 && checks.every(c => c.passed),
    checked_at: new Date().toISOString(), checks, fixture_ids: job.fixtures.map(f => f.user_id) };
  try {
    const finished = dependencies.finish ? await dependencies.finish(id, receipt) : await finishJob(id, receipt);
    if (!finished) throw new Error('NOT_PERSISTED');
  } catch { return reply(503, { available: false, code: 'FIXTURE_RECEIPT_NOT_PERSISTED' }); }
  return reply(200, { available: true, jobId: id, receipt });
}

function assertAllowlist(job: Job) {
  const expected = new Map([
    ['ee083f63-1621-4b82-b7a4-fd13427c0b14', ['dentalflow-acceptance-20261004-e0537565-4015-4ffe-a249-5da489824e6e@example.invalid','081d3db4-1606-40f7-a878-19b51556317d']],
    ['24e7cdf9-457e-4af2-b1cb-cf366abbddb0', ['dentalflow-acceptance-20261004-237e6ef4-9893-43d2-b9a3-311f8708aa3d@example.invalid','3fc86c40-697e-4725-a9e9-633fc882aadc']],
  ]);
  if (new Set(job.fixtures.map(f => f.user_id)).size !== 2 || job.fixtures.some(f => {
    const entry = expected.get(f.user_id); return !entry || entry[0] !== f.email || entry[1] !== f.clinic_id;
  })) throw new FixtureFailure('FIXTURE_ALLOWLIST_MISMATCH');
}
async function claimJob(id: string, hash: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await (supabaseAdmin as SupabaseClient).rpc('saas_claim_fixture_acceptance_job', { p_job_id: id, p_token_hash: hash });
  if (error) throw new FixtureFailure('FIXTURE_JOB_FORBIDDEN');
  return data;
}
async function finishJob(id: string, receipt: Receipt) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await (supabaseAdmin as SupabaseClient).rpc('saas_finish_fixture_acceptance_job', { p_job_id: id, p_receipt: receipt });
  if (error) throw new FixtureFailure('FIXTURE_RECEIPT_NOT_PERSISTED');
  return data === true;
}

export function publicClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new FixtureFailure('FIXTURE_AUTH_CONFIGURATION_MISSING');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fixturePublicFetch(key) } });
}
export function fixturePublicFetch(key: string, transport: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    if ((key.startsWith('sb_publishable_') || key.startsWith('sb_secret_')) && headers.get('authorization') === `Bearer ${key}`)
      headers.delete('authorization');
    headers.set('apikey', key);
    return transport(input, { ...init, headers, signal: AbortSignal.timeout(6000) });
  };
}
export function requireResult<R extends { error: unknown; data?: unknown }>(result: R, code: string): NonNullable<R['data']> {
  if (result.error) {
    const status = typeof result.error === 'object' && 'status' in result.error && typeof result.error.status === 'number'
      ? result.error.status : undefined;
    throw new FixtureFailure(code, status);
  }
  return result.data as NonNullable<R['data']>;
}
async function runJob(job: Job): Promise<Check[]> {
  if (job.kind === 'identity') return runIdentity(job);
  if (job.kind === 'billing') return (await import('./fixture-billing.server')).runFixtureBilling(job);
  if (job.kind === 'storage') return (await import('./fixture-storage.server')).runFixtureStorage(job);
  throw new FixtureFailure('FIXTURE_JOB_NOT_IMPLEMENTED');
}

async function runIdentity(job: Job): Promise<Check[]> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const admin = supabaseAdmin as SupabaseClient;
  const checks: Check[] = [];
  const sessions: { client: SupabaseClient; session: Session }[] = [];
  let temporaryId: string | undefined;
  const temporaryEmail = `dentalflow-acceptance-signup-${job.id}@example.invalid`;
  const initial = `Df!${randomUUID()}Aa9`;
  const changed = `Df!${randomUUID()}Bb8`;
  async function verifiedLink(type: 'magiclink' | 'recovery' | 'signup', email: string, expectedId?: string) {
    const generated = requireResult(await admin.auth.admin.generateLink(type === 'signup'
      ? { type, email, password: initial, options: { data: { acceptance_fixture: true, acceptance_job: job.id, full_name: 'DentalFlow Disposable Signup Fixture', role: 'USER' } } }
      : { type, email }), `AUTH_${type.toUpperCase()}_LINK_FAILED`);
    if (!generated.user || !generated.properties?.hashed_token || (expectedId && generated.user.id !== expectedId)
      || generated.user.email !== email) throw new FixtureFailure('AUTH_LINK_IDENTITY_MISMATCH');
    if (type === 'signup') {
      temporaryId = generated.user.id;
      const before = await publicClient().auth.signInWithPassword({ email, password: initial });
      checks.push({ check: 'unconfirmed_login_denied', passed: !!before.error && before.error.code === 'email_not_confirmed', http_status: before.error?.status });
    }
    const client = publicClient();
    const confirmed = requireResult(await client.auth.verifyOtp({ token_hash: generated.properties.hashed_token, type }), `AUTH_${type.toUpperCase()}_VERIFY_FAILED`);
    if (!confirmed.session || confirmed.user?.id !== generated.user.id) throw new FixtureFailure('AUTH_SESSION_IDENTITY_MISMATCH');
    sessions.push({ client, session: confirmed.session });
    const user = requireResult(await client.auth.getUser(), 'AUTH_SESSION_LOOKUP_FAILED');
    if (user.user?.id !== generated.user.id) throw new FixtureFailure('AUTH_SESSION_LOOKUP_MISMATCH');
    const reused = await publicClient().auth.verifyOtp({ token_hash: generated.properties.hashed_token, type });
    checks.push({ check: `${type}_token_single_use`, passed: !!reused.error, http_status: reused.error?.status });
    return { client, session: confirmed.session, user: confirmed.user };
  }
  try {
    for (const fixture of job.fixtures) {
      const actual = await verifiedLink('magiclink', fixture.email, fixture.user_id);
      const own = requireResult(await actual.client.from('profiles').select('id,clinic_id').eq('id', fixture.user_id).single(), 'AUTH_OWN_PROFILE_FAILED');
      checks.push({ check: fixture.user_id.startsWith('ee08') ? 'fixture_a_real_session' : 'fixture_b_real_session', passed: own.id === fixture.user_id && own.clinic_id === fixture.clinic_id });
      const other = job.fixtures.find(f => f.user_id !== fixture.user_id)!;
      const foreign = await actual.client.from('patients').select('id').eq('clinic_id', other.clinic_id);
      checks.push({ check: fixture.user_id.startsWith('ee08') ? 'fixture_a_company_isolation' : 'fixture_b_company_isolation', passed: !foreign.error && Array.isArray(foreign.data) && foreign.data.length === 0 });
    }
    const signup = await verifiedLink('signup', temporaryEmail);
    checks.push({ check: 'signup_confirmation_consumed', passed: !!signup.user.email_confirmed_at });
    const weak = await signup.client.auth.updateUser({ password: 'Aa1!xy7' });
    checks.push({ check: 'short_credential_denied', passed: !!weak.error && weak.error.status === 422, http_status: weak.error?.status });
    // A failed policy check may have changed the disposable account. Restore
    // its known credential before independently testing recovery and login.
    if (!weak.error) requireResult(await signup.client.auth.updateUser({ password: initial }), 'AUTH_FIXTURE_CREDENTIAL_RESTORE_FAILED');
    const login = publicClient();
    const logged = requireResult(await login.auth.signInWithPassword({ email: temporaryEmail, password: initial }), 'AUTH_CONFIRMED_LOGIN_FAILED');
    if (!logged.session || logged.user.id !== temporaryId) throw new FixtureFailure('AUTH_CONFIRMED_LOGIN_MISMATCH');
    sessions.push({ client: login, session: logged.session });
    checks.push({ check: 'confirmed_login_succeeded', passed: true });
    const recovery = await verifiedLink('recovery', temporaryEmail, temporaryId);
    requireResult(await recovery.client.auth.updateUser({ password: changed }), 'AUTH_RECOVERY_UPDATE_FAILED');
    const old = await publicClient().auth.signInWithPassword({ email: temporaryEmail, password: initial });
    checks.push({ check: 'previous_credential_denied', passed: !!old.error, http_status: old.error?.status });
    const freshClient = publicClient();
    const fresh = requireResult(await freshClient.auth.signInWithPassword({ email: temporaryEmail, password: changed }), 'AUTH_RECOVERY_LOGIN_FAILED');
    if (!fresh.session || fresh.user.id !== temporaryId) throw new FixtureFailure('AUTH_RECOVERY_LOGIN_MISMATCH');
    sessions.push({ client: freshClient, session: fresh.session });
    checks.push({ check: 'recovered_login_succeeded', passed: true });
    requireResult(await freshClient.auth.signOut({ scope: 'global' }), 'AUTH_GLOBAL_LOGOUT_FAILED');
    const retired = await publicClient().auth.refreshSession({ refresh_token: fresh.session.refresh_token });
    checks.push({ check: 'logout_refresh_denied', passed: !!retired.error, http_status: retired.error?.status });
  } catch (error) {
    checks.push({ check: 'identity_flow', passed: false, code: error instanceof FixtureFailure ? error.safeCode : 'AUTH_FIXTURE_FLOW_FAILED',
      ...(error instanceof FixtureFailure && error.httpStatus ? { http_status: error.httpStatus } : {}) });
  } finally {
    for (const { client } of sessions) { await client.auth.signOut({ scope: 'local' }).catch(() => undefined); }
    if (temporaryId) {
      // Re-read identity and the run marker before deleting only this disposable account.
      const own = await admin.auth.admin.getUserById(temporaryId);
      const matches = !own.error && own.data.user?.email === temporaryEmail
        && own.data.user?.user_metadata.acceptance_job === job.id;
      const removed = matches ? await admin.auth.admin.deleteUser(temporaryId) : { error: new Error('IDENTITY_MISMATCH') };
      checks.push({ check: 'disposable_identity_removed', passed: !removed.error });
    }
  }
  return checks;
}
