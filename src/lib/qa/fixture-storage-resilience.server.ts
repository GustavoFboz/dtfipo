import { FixtureFailure, requireResult, type Check } from './fixture-acceptance.server';
import type { FixtureSession } from './fixture-sessions.server';

type Usage = { used: number; limit: number };
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const sameUsage = (a: Usage, b: Usage) => a.used === b.used && a.limit === b.limit;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6BYAAAAASUVORK5CYII=', 'base64');

/** Runs only inside the existing claimed, allowlisted fixture job. All quota,
 * Storage and readback operations use its real unprivileged user session. */
export async function exerciseFixtureStorageResilience(fixture: FixtureSession, jobId: string): Promise<Check[]> {
  if (!uuid.test(jobId)) throw new FixtureFailure('FIXTURE_JOB_ID_INVALID');
  const checks: Check[] = [];
  const paths = ['parallel-a', 'parallel-b', 'interrupted', 'mismatch', 'present']
    .map(label => `${fixture.user_id}/qa-${jobId}-resilience-${label}.png`);
  const reservations = new Set<string>();
  const storage = fixture.client.storage.from('avatars');
  const usage = async (): Promise<Usage> => {
    const data = requireResult(await fixture.client.rpc('get_storage_usage'), 'FIXTURE_USAGE_FAILED') as any;
    const row = Array.isArray(data) ? data[0] : data;
    const used = Number(row?.used_bytes), limit = Number(row?.limit_bytes);
    if (!Number.isSafeInteger(used) || !Number.isSafeInteger(limit) || used < 0 || limit < used)
      throw new FixtureFailure('FIXTURE_USAGE_INVALID');
    return { used, limit };
  };
  const reserve = async (path: string, size: number) => {
    const result = await fixture.client.rpc('reserve_storage_upload', {
      _size_bytes: size, _bucket: 'avatars', _object_path: path, _source_type: 'user_avatar',
      _case_id: null, _patient_id: null, _original_name: 'qa-resilience.png', _mime_type: 'image/png',
    });
    if (result.error) return { error: result.error, id: null };
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!uuid.test(row?.file_id ?? '')) throw new FixtureFailure('FIXTURE_RESERVATION_INVALID');
    reservations.add(row.file_id);
    return { error: null, id: row.file_id as string };
  };
  const required = async (path: string, size: number) => {
    const result = await reserve(path, size);
    if (result.error || !result.id) throw new FixtureFailure('FIXTURE_RESERVATION_FAILED');
    return result.id;
  };
  const release = async (id: string) => {
    requireResult(await fixture.client.rpc('cancel_storage_upload', { _file_id: id }), 'FIXTURE_RESERVATION_RELEASE_FAILED');
    reservations.delete(id);
  };
  const record = (check: string, passed: boolean, count?: number) => {
    checks.push({ check, passed, ...(count === undefined ? {} : { count }) });
    if (!passed) throw new FixtureFailure(check.toUpperCase());
  };
  const baseline = await usage();
  try {
    const available = baseline.limit - baseline.used;
    if (available < png.length + 1) throw new FixtureFailure('FIXTURE_RESILIENCE_CAPACITY_REQUIRED');
    // Two overlapping requests cannot both consume more than the real company
    // quota. They reserve metadata only; no large file or quota change is made.
    const amount = Math.floor(available / 2) + 1;
    const parallel = await Promise.allSettled([reserve(paths[0], amount), reserve(paths[1], amount)]);
    if (parallel.some(result => result.status === 'rejected')) throw new FixtureFailure('FIXTURE_RESERVATION_TRANSPORT_AMBIGUOUS');
    const values = parallel.map(result => (result as PromiseFulfilledResult<Awaited<ReturnType<typeof reserve>>>).value);
    const won = values.filter(value => value.id), refused = values.filter(value => value.error);
    record('parallel_quota_single_winner', won.length === 1 && refused.length === 1
      && String(refused[0].error?.message).includes('STORAGE_QUOTA_EXCEEDED'), won.length);
    record('parallel_quota_authoritative_usage', (await usage()).used === baseline.used + amount);
    for (const value of won) await release(value.id!);
    record('parallel_quota_restored', sameUsage(await usage(), baseline));

    const interrupted = await required(paths[2], 3);
    const absent = await fixture.client.rpc('complete_storage_upload', { _file_id: interrupted, _source_id: fixture.user_id });
    record('interrupted_upload_completion_denied', !!absent.error && absent.error.message.includes('STORAGE_OBJECT_SIZE_MISMATCH'));
    record('interrupted_upload_remains_reserved', (await usage()).used === baseline.used + 3);
    await release(interrupted);
    requireResult(await fixture.client.rpc('cancel_storage_upload', { _file_id: interrupted }), 'FIXTURE_REPEAT_RELEASE_FAILED');
    record('interrupted_release_idempotent', sameUsage(await usage(), baseline));

    const mismatch = await required(paths[3], png.length - 1);
    const oversized = await storage.upload(paths[3], png, { contentType: 'image/png', upsert: false });
    record('actual_size_mismatch_upload_denied', !!oversized.error);
    record('mismatch_does_not_inflate_quota', (await usage()).used === baseline.used + png.length - 1);
    await release(mismatch);

    const present = await required(paths[4], png.length);
    requireResult(await storage.upload(paths[4], png, { contentType: 'image/png', upsert: false }), 'FIXTURE_RESILIENCE_UPLOAD_FAILED');
    const premature = await fixture.client.rpc('cancel_storage_upload', { _file_id: present });
    record('existing_bytes_prevent_quota_release', !!premature.error && premature.error.message.includes('STORAGE_OBJECT_STILL_EXISTS'));
    record('existing_bytes_remain_accounted', (await usage()).used === baseline.used + png.length);
    const bytes = requireResult(await storage.download(paths[4]), 'FIXTURE_RESILIENCE_READ_FAILED');
    record('premature_release_preserves_bytes', Buffer.from(await bytes.arrayBuffer()).equals(png));
    requireResult(await storage.remove([paths[4]]), 'FIXTURE_RESILIENCE_DELETE_FAILED');
    record('deleted_resilience_object_absent', !!(await storage.download(paths[4])).error);
    await release(present);
  } catch (error) {
    checks.push({ check: 'storage_resilience_flow', passed: false,
      code: error instanceof FixtureFailure ? error.safeCode : 'FIXTURE_RESILIENCE_FAILED' });
  } finally {
    try {
      // A timed-out reservation may have committed. Recover only exact paths
      // generated for this job, this fixture owner and this company.
      const found = requireResult(await fixture.client.from('storage_files').select('id,object_path')
        .eq('clinic_id', fixture.clinic_id).eq('uploaded_by', fixture.user_id).eq('bucket', 'avatars')
        .in('object_path', paths).in('status', ['reserved', 'ready']), 'FIXTURE_RESILIENCE_READBACK_FAILED');
      for (const row of found ?? []) if (uuid.test(row.id) && paths.includes(row.object_path)) reservations.add(row.id);
      // Remove only the two tiny upload destinations, never historical files.
      requireResult(await storage.remove(paths.slice(3)), 'FIXTURE_RESILIENCE_DELETE_FAILED');
      for (const id of reservations) await release(id);
      const final = await usage();
      checks.push({ check: 'resilience_quota_restored', passed: sameUsage(final, baseline), count: final.used });
    } catch (error) {
      checks.push({ check: 'storage_resilience_cleanup', passed: false,
        code: error instanceof FixtureFailure ? error.safeCode : 'FIXTURE_RESILIENCE_CLEANUP_FAILED' });
    }
  }
  return checks;
}
