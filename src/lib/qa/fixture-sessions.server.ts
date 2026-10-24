import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { FixtureFailure, publicClient, requireResult, type Job } from './fixture-acceptance.server';

export type FixtureSession = Job['fixtures'][number] & { client: SupabaseClient; session: Session };

/** Actual Auth verification, scoped to the already checked private job. No
 * identity, role, MFA, credentials or delivery destination comes from HTTP. */
export async function withFixtureSessions<T>(job: Job, run: (sessions: FixtureSession[]) => Promise<T>): Promise<T> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const admin = supabaseAdmin as SupabaseClient;
  const sessions: FixtureSession[] = [];
  try {
    for (const fixture of job.fixtures) {
      const generated = requireResult(await admin.auth.admin.generateLink({ type: 'magiclink', email: fixture.email }), 'FIXTURE_LINK_FAILED');
      if (generated.user?.id !== fixture.user_id || generated.user.email !== fixture.email || !generated.properties?.hashed_token)
        throw new FixtureFailure('FIXTURE_LINK_IDENTITY_MISMATCH');
      const client = publicClient();
      const actual = requireResult(await client.auth.verifyOtp({ token_hash: generated.properties.hashed_token, type: 'magiclink' }), 'FIXTURE_SESSION_FAILED');
      if (!actual.session || actual.user?.id !== fixture.user_id) throw new FixtureFailure('FIXTURE_SESSION_IDENTITY_MISMATCH');
      sessions.push({ ...fixture, client, session: actual.session });
      const verified = requireResult(await client.auth.getUser(), 'FIXTURE_SESSION_LOOKUP_FAILED');
      const profile = requireResult(await client.from('profiles').select('id,clinic_id').eq('id', fixture.user_id).single(), 'FIXTURE_PROFILE_FAILED');
      if (verified.user?.id !== fixture.user_id || profile.clinic_id !== fixture.clinic_id) throw new FixtureFailure('FIXTURE_PROFILE_MISMATCH');
    }
    return await run(sessions);
  } finally {
    for (const fixture of sessions) await fixture.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }
}

export async function fixtureAppPost(path: '/api/billing/asaas-checkout' | '/api/billing/asaas-document', fixture: FixtureSession, body: object) {
  const response = await fetch(`https://dtfipo.lovable.app${path}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${fixture.session.access_token}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  return { status: response.status, body: await response.json() as any };
}
