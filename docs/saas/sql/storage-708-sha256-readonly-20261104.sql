-- DentalFlow: only aggregate fingerprints for the FOUR original buckets.
-- READ ONLY. No patient names, case paths, URLs or object content returned.
-- Copy the FOUR aggregate rows into a LOCAL private JSON file if repeating
-- the audit with scripts/recovery/reconcile-cloud-storage-snapshot.mjs.
-- Do NOT send encrypted checkpoint, key or raw storage.objects to CI/GitHub.
SELECT
  bucket_id,
  count(*)::int AS objects,
  COALESCE(sum((metadata->>'size')::bigint),0)::bigint AS bytes,
  encode(sha256(convert_to(string_agg(
      bucket_id || chr(31) || name || chr(31) || COALESCE(version,''),
      chr(10) ORDER BY bucket_id COLLATE "C", name COLLATE "C"
    ),'UTF8')),'hex') AS sha_version,
  encode(sha256(convert_to(string_agg(
      bucket_id || chr(31) || name || chr(31) || COALESCE(metadata->>'size',''),
      chr(10) ORDER BY bucket_id COLLATE "C", name COLLATE "C"
    ),'UTF8')),'hex') AS sha_size,
  encode(sha256(convert_to(string_agg(
      bucket_id || chr(31) || name || chr(31) || COALESCE(metadata->>'eTag',''),
      chr(10) ORDER BY bucket_id COLLATE "C", name COLLATE "C"
    ),'UTF8')),'hex') AS sha_etag
FROM storage.objects
WHERE bucket_id IN ('avatars','case-files','database_export_05_09_26','patient-photos')
GROUP BY bucket_id ORDER BY bucket_id;

-- EXTRA BUCKET IS NOT PART OF THE 29/10 FROZEN SNAPSHOT.
-- Its objects require a separately versioned export/retention decision.
SELECT bucket_id, count(*)::int AS objects,
  COALESCE(sum((metadata->>'size')::bigint),0)::bigint AS bytes,
  count(*) FILTER (WHERE created_at >= '2026-10-30'::timestamptz)::int AS created_since_oct30_utc
FROM storage.objects
WHERE bucket_id = 'database_export_29_10_26'
GROUP BY bucket_id;
