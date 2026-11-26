"""DF-EID-01: private, bounded, sampled DB + Storage proof in one isolated run.

No internet, Supabase credentials, Web API, Asaas, source writes or patient data
on disk/logs. Must run only after the Docker image was downloaded. The selected
files briefly exist in Docker /tmp (tmpfs), with no ports/mounts/network, and
are deleted after in-memory decoding, digest checking and relationship checks.
"""
from __future__ import annotations

import hashlib
import io
import json
import re
import struct
import zipfile
from pathlib import Path

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.exceptions import InvalidTag

from local_staging_restore import _docker, restore_database_locally
from private_offsite_bundle import _key, _manifest_read
from verify_encrypted_116 import AuthenticatedZipView
from verify_panel_downloads import _load_index, _manifest, _basename

ERROR = "DF_STAGE3_PRIVATE_INTEGRATION_UNVERIFIED"
MAX_SAMPLE = 24 * 1024 * 1024
EXPECTED_DB = (93, 86, 8, 702)
SUFFIX_PRIORITY = {".png": 0, ".jpg": 0, ".jpeg": 0, ".webp": 0, ".pdf": 0,
                   ".stl": 0, ".obj": 1, ".zip": 2, ".tif": 0, ".tiff": 0}


def _fail(code=ERROR):
    raise ValueError(code)


def _identity(row, missing=False):
    return (row["bucket_id"], row["name"], row["version"] if missing else row["source_version"])


def _path_key(bucket, path):
    return (str(bucket), str(path).replace("\\", "/").lstrip("/"))


def _sample_rank(row, links, missing=False):
    size = row["metadata"]["size"] if missing else row["bytes"]
    match = links.get(_path_key(row["bucket_id"], row["name"]), [])
    valid = any(x.get("valid") for x in match)
    ext = Path(row["name"]).suffix.lower()
    digest = hashlib.sha256(repr(_identity(row, missing)).encode()).hexdigest()
    return (0 if valid else 1, SUFFIX_PRIORITY.get(ext, 9), size, digest)


def _select(index, links):
    archived = list(index["files"])
    stored = {_identity(r) for r in archived}
    missing = [r for r in index["source_catalog"] if _identity(r, True) not in stored]
    if len(archived) != 592 or len(missing) != 116:
        _fail("DF_STAGE3_HISTORICAL_INVENTORY_INCOMPLETE")
    eligible_old = [x for x in archived if 0 < x["bytes"] <= MAX_SAMPLE]
    eligible_new = [x for x in missing if 0 < x["metadata"]["size"] <= MAX_SAMPLE]
    if len(eligible_old) < 4 or len(eligible_new) < 4:
        _fail("DF_STAGE3_SAMPLE_TOO_LARGE_OR_MISSING")
    old = sorted(eligible_old, key=lambda x: _sample_rank(x, links))[:4]
    no_etag = [x for x in eligible_new if not re.fullmatch(
        r"[0-9a-fA-F]{32}", str(x["metadata"].get("eTag") or "").strip('"'))]
    if len(no_etag) < 2:
        _fail("DF_STAGE3_NO_DIGEST_EXCEPTIONS_UNAVAILABLE")
    no_etag.sort(key=lambda x: _sample_rank(x, links, True))
    new = no_etag[:2]
    new_ids = {_identity(x, True) for x in new}
    new.extend(x for x in sorted(eligible_new, key=lambda x: _sample_rank(x, links, True))
               if _identity(x, True) not in new_ids)
    new = new[:4]
    # Extra relational controls: up to four linked references if not already
    # included in the minimum 4+4. Never substitute an unrelated object.
    selected = {(False, _identity(x)): x for x in old}
    selected.update({(True, _identity(x, True)): x for x in new})
    extra = [(False, x) for x in eligible_old] + [(True, x) for x in eligible_new]
    extra = [(is_new, x) for is_new, x in extra
             if (is_new, _identity(x, is_new)) not in selected
             and any(z.get("valid") for z in links.get(_path_key(x["bucket_id"], x["name"]), []))]
    extra.sort(key=lambda pair: _sample_rank(pair[1], links, pair[0]))
    for is_new, row in extra[:4]:
        selected[(is_new, _identity(row, is_new))] = row
    return selected


def _read_archive_member(archive, member, key, name, expected_size, expected_sha):
    if member.file_size < 36 or member.file_size > MAX_SAMPLE + 36:
        _fail("DF_STAGE3_ENCRYPTED_SAMPLE_UNSUPPORTED_SIZE")
    with archive.open(member, "r") as reader:
        header = reader.read(20)
        if len(header) != 20 or header[:8] != b"DFREC001":
            _fail("DF_STAGE3_OBJECT_HEADER_INVALID")
        decrypt = Cipher(algorithms.AES(key), modes.GCM(header[8:20])).decryptor()
        decrypt.authenticate_additional_data(("dentalflow-recovery-v1:" + name).encode())
        pending = b""
        result = bytearray()
        while True:
            chunk = reader.read(1024 * 1024)
            if not chunk:
                break
            combined = pending + chunk
            if len(combined) <= 16:
                pending = combined
                continue
            result.extend(decrypt.update(combined[:-16]))
            pending = combined[-16:]
            if len(result) > expected_size:
                _fail("DF_STAGE3_SAMPLE_EXCEEDS_DECLARED_SIZE")
        if len(pending) != 16:
            _fail("DF_STAGE3_OBJECT_TAG_MISSING")
        try:
            result.extend(decrypt.finalize_with_tag(pending))
        except (InvalidTag, ValueError):
            _fail("DF_STAGE3_OBJECT_AUTHENTICATION_FAILED")
    plain = bytes(result)
    if len(plain) != expected_size or hashlib.sha256(plain).hexdigest() != expected_sha:
        _fail("DF_STAGE3_OBJECT_DIGEST_MISMATCH")
    return plain


def _historical_samples(index, index_key, volume_dir, targets):
    found = {}
    key = _key(Path(index_key))
    from verify_panel_downloads import INDEX_AAD, INDEX_MAGIC
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    base = Path(volume_dir)
    if not base.is_dir() or base.is_symlink():
        _fail("DF_STAGE3_HISTORICAL_VAULT_MISSING")
    for i, part in enumerate(index["parts"], 1):
        filename = base / ("DentalFlow_Anexos_2026-10-29_Parte_" + str(i).zfill(2) + ".zip")
        if filename.is_symlink() or not filename.is_file() or filename.stat().st_size != part["bytes"]:
            _fail("DF_STAGE3_HISTORICAL_VOLUME_MISSING")
        # SHA of the 33 volumes was previously approved. Do not rehash all.
        with zipfile.ZipFile(filename) as archive:
            info = json.loads(archive.read("part.json"))
            if info.get("part_number") != i:
                _fail("DF_STAGE3_HISTORICAL_PART_ORDER")
            sealed = archive.read("manifest.dfenc")
            if not sealed.startswith(INDEX_MAGIC):
                _fail("DF_STAGE3_HISTORICAL_MANIFEST_INVALID")
            try:
                manifest = json.loads(AESGCM(key).decrypt(
                    sealed[8:20], sealed[20:],
                    ("dentalflow-recovery-v1:" + info["authenticated_name"]).encode()))
            except (InvalidTag, KeyError, ValueError):
                _fail("DF_STAGE3_HISTORICAL_MANIFEST_AUTH")
            for row in manifest.get("files", []):
                identity = _identity(row)
                if (False, identity) not in targets:
                    continue
                if identity in found:
                    _fail("DF_STAGE3_DUPLICATE_HISTORICAL_SAMPLE")
                expected = targets[(False, identity)]
                if row["bytes"] != expected["bytes"] or row["sha256"] != expected["sha256"]:
                    _fail("DF_STAGE3_HISTORICAL_RECEIPT_MISMATCH")
                member = archive.getinfo("files/" + row["encrypted_file"])
                payload = _read_archive_member(
                    archive, member, key, "storage:" + row["bucket_id"] + "/" + row["name"],
                    row["bytes"], row["sha256"])
                found[identity] = payload
        if len(found) == len([v for k, v in targets.items() if not k[0]]):
            break
    if len(found) != len([k for k in targets if not k[0]]):
        _fail("DF_STAGE3_HISTORICAL_SAMPLE_MISSING")
    return found


def _new_samples(index, new_dir, new_key, targets):
    from private_offsite_bundle import _manifest_read
    from verify_panel_downloads import _manifest, _consume
    missing = _manifest(index)
    key = _key(Path(new_key))
    base = Path(new_dir)
    catalog = _manifest_read(base / "catalog.dfenc", key)
    receipts = catalog["files"]
    if len(receipts) != 14 or len(list(base.iterdir())) != 15:
        _fail("DF_STAGE3_RECOVERED_BUNDLE_INCOMPLETE")
    wanted = {_basename(row["name"]): identity for (is_new, identity), row in targets.items() if is_new}
    found = {}
    for i, item in enumerate(receipts, 1):
        with AuthenticatedZipView(base / item["encrypted"], key, "part-%03d" % i, item) as view:
            direct = _basename(item["name"])
            if direct in wanted and item["size"] == missing[direct][1]:
                candidates = [(direct, item["size"], view)]
                for basename, size, stream in candidates:
                    identity = wanted[basename]
                    raw = stream.read(MAX_SAMPLE + 1)
                    if len(raw) != size or identity in found:
                        _fail("DF_STAGE3_RECOVERED_DIRECT_SAMPLE_INVALID")
                    found[identity] = raw
                continue
            if not item["name"].lower().endswith(".zip"):
                continue
            with zipfile.ZipFile(view, "r") as archive:
                for member in archive.infolist():
                    basename = _basename(member.filename)
                    if member.is_dir() or basename not in wanted:
                        continue
                    identity = wanted[basename]
                    if identity in found or member.flag_bits & 1 or member.file_size != missing[basename][1]:
                        _fail("DF_STAGE3_RECOVERED_ARCHIVE_SAMPLE_INVALID")
                    with archive.open(member, "r") as stream:
                        raw = stream.read(MAX_SAMPLE + 1)
                    if len(raw) != member.file_size:
                        _fail("DF_STAGE3_RECOVERED_SAMPLE_TRUNCATED")
                    found[identity] = raw
        if len(found) == len(wanted):
            break
    if len(found) != len(wanted):
        _fail("DF_STAGE3_RECOVERED_SAMPLE_MISSING")
    etags = 0
    no_digest = 0
    for identity, raw in found.items():
        row = targets[(True, identity)]
        md5 = str(row["metadata"].get("eTag") or "").strip('"')
        if len(raw) != row["metadata"]["size"]:
            _fail("DF_STAGE3_RECOVERED_SIZE_MISMATCH")
        if re.fullmatch(r"[0-9a-fA-F]{32}", md5):
            if hashlib.md5(raw).hexdigest().lower() != md5.lower():
                _fail("DF_STAGE3_RECOVERED_ETAG_MISMATCH")
            etags += 1
        else:
            no_digest += 1
    return found, etags, no_digest


def _render_sample(data, suffix):
    """Real in-memory parser/renderer, not filename or magic-byte-only."""
    ext = suffix.lower()
    try:
        if ext in (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp", ".bmp", ".gif"):
            from PIL import Image
            with Image.open(io.BytesIO(data)) as im:
                im.load()
                if im.width < 1 or im.height < 1:
                    return "failed"
                im.getpixel((0, 0))
            return "opened"
        if ext == ".pdf":
            import pypdfium2 as pdfium
            pdf = pdfium.PdfDocument(data)
            try:
                if len(pdf) < 1:
                    return "failed"
                page = pdf[0]
                try:
                    bitmap = page.render(scale=0.4)
                    bitmap.to_pil().getpixel((0, 0))
                finally:
                    page.close()
            finally:
                pdf.close()
            return "opened"
        if ext == ".stl":
            if len(data) >= 84:
                n = struct.unpack_from("<I", data, 80)[0]
                if n > 0 and 84 + 50 * n == len(data):
                    return "opened"
            if len(data) < 4 * 1024 * 1024:
                text = data.decode("ascii", errors="strict")
                if text.lstrip().startswith("solid") and text.count("facet normal") > 0 \
                        and text.count("endfacet") == text.count("facet normal"):
                    return "opened"
            return "failed"
        if ext == ".zip":
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                names = archive.infolist()
                if not names or sum(m.file_size for m in names) > 64 * 1024 * 1024:
                    return "unsupported"
                if archive.testzip() is not None:
                    return "failed"
            return "opened"
    except Exception:
        return "failed"
    return "unsupported"


def _relation_rows(container):
    sql = """
SELECT row_to_json(r) FROM (
  SELECT sf.bucket, sf.object_path,
         ((sf.case_id IS NULL OR c.id IS NOT NULL)
          AND (sf.patient_id IS NULL OR p.id IS NOT NULL)
          AND (sf.clinic_id IS NULL OR cl.id IS NOT NULL)) AS valid,
         (sf.case_id IS NOT NULL OR sf.patient_id IS NOT NULL) AS clinical
  FROM public.storage_files sf
  LEFT JOIN public.cases c ON c.id=sf.case_id
  LEFT JOIN public.patients p ON p.id=sf.patient_id
  LEFT JOIN public.clinics cl ON cl.id=sf.clinic_id
  UNION ALL
  SELECT 'case-files', ca.storage_path,
         c.id IS NOT NULL, true
  FROM public.case_attachments ca LEFT JOIN public.cases c ON c.id=ca.case_id
) r;
"""
    out = _docker(["exec", "-i", container, "psql", "-At", "-v", "ON_ERROR_STOP=1",
                   "-U", "supabase_admin", "-d", "postgres", "-f", "-"], data=sql.encode(), timeout=35)
    if out.returncode:
        _fail("DF_STAGE3_RESTORED_RELATIONS_UNAVAILABLE")
    links = {}
    try:
        for ln in out.stdout.decode("utf-8").splitlines():
            item = json.loads(ln)
            if isinstance(item.get("bucket"), str) and isinstance(item.get("object_path"), str):
                links.setdefault(_path_key(item["bucket"], item["object_path"]), []).append(item)
    except (ValueError, UnicodeError, KeyError):
        _fail("DF_STAGE3_RELATION_OUTPUT_INVALID")
    return links


def _restore_sample_to_container(container, data):
    # The filename is fixed and opaque. The container was already inspected
    # for network=none, 0 host mounts and 0 exposed ports before DB import.
    command = "umask 077; cat >/tmp/df-stage3-sample; sha256sum /tmp/df-stage3-sample; rm -f /tmp/df-stage3-sample"
    out = _docker(["exec", "-i", container, "sh", "-c", command], data=data, timeout=65)
    if out.returncode or not re.fullmatch(rb"[0-9a-f]{64}  /tmp/df-stage3-sample\s*", out.stdout):
        _fail("DF_STAGE3_IN_CONTAINER_SAMPLE_RESTORE_FAILED")
    digest = out.stdout.split(b" ", 1)[0].decode("ascii")
    if digest != hashlib.sha256(data).hexdigest():
        _fail("DF_STAGE3_IN_CONTAINER_SAMPLE_HASH_MISMATCH")


def _rollback_probe(container):
    script = """
BEGIN;
CREATE TABLE public.df_stage3_disposable_reversal_probe(marker integer);
INSERT INTO public.df_stage3_disposable_reversal_probe VALUES (1);
ROLLBACK;
SELECT CASE WHEN to_regclass('public.df_stage3_disposable_reversal_probe') IS NULL
  THEN 'ROLLBACK_OK' ELSE 'ROLLBACK_FAILED' END;
"""
    out = _docker(["exec", "-i", container, "psql", "-At", "-v", "ON_ERROR_STOP=1",
                   "-U", "supabase_admin", "-d", "postgres", "-f", "-"], data=script.encode(), timeout=20)
    if out.returncode or b"ROLLBACK_OK" not in out.stdout or b"ROLLBACK_FAILED" in out.stdout:
        _fail("DF_STAGE3_LOCAL_ROLLBACK_FAILED")
    return True


def run_integrated_stage3(index_file, historical_key, vault_33, recovered_dir,
                          recovered_key, db_dir, db_key, progress=None):
    def notify(phase):
        if progress:
            progress(phase)
    files = [Path(index_file), Path(historical_key), Path(recovered_key), Path(db_key)]
    if len({str(x.resolve()) for x in files}) != len(files):
        _fail("DF_STAGE3_DISTINCT_PRIVATE_KEYS_REQUIRED")
    if Path(historical_key).read_bytes() == Path(recovered_key).read_bytes() \
        or Path(db_key).read_bytes() == Path(historical_key).read_bytes() \
        or Path(db_key).read_bytes() == Path(recovered_key).read_bytes():
        _fail("DF_STAGE3_WRONG_KEY_REUSED")
    notify("Conferindo índice histórico e fontes locais")
    index = _load_index(Path(index_file), Path(historical_key))
    _manifest(index)
    if len(index["files"]) != 592 or len(index["parts"]) != 33:
        _fail("DF_STAGE3_HISTORICAL_CHECKPOINT_INCOMPLETE")
    new_meta = _manifest_read(Path(recovered_dir) / "catalog.dfenc", _key(Path(recovered_key)))
    if len(new_meta["files"]) != 14:
        _fail("DF_STAGE3_RECOVERED_CHECKPOINT_INCOMPLETE")
    result = {}
    private = {}

    def inspect_same_isolated_db(container):
        private["container"] = container
        notify("Comparando banco restaurado e vínculos de anexos")
        links = _relation_rows(container)
        targets = _select(index, links)
        notify("Recuperando 4 anexos históricos da amostra, sem repetir 592")
        archived = _historical_samples(index, historical_key, vault_33, targets)
        notify("Recuperando amostra dos 116 anexos cifrados")
        recent, etags, exceptions = _new_samples(index, recovered_dir, recovered_key, targets)

        opened = unsupported = linked = broken = 0
        old_opened = new_opened = 0
        # Plaintext stays in process memory and isolated container tmpfs only.
        for (is_new, identity), row in targets.items():
            raw = recent[identity] if is_new else archived[identity]
            _restore_sample_to_container(container, raw)
            status = _render_sample(raw, Path(row["name"]).suffix)
            if status == "failed":
                _fail("DF_STAGE3_SAMPLE_DECODER_FAILED")
            opened += status == "opened"
            unsupported += status == "unsupported"
            old_opened += status == "opened" and not is_new
            new_opened += status == "opened" and is_new
            relations = links.get(_path_key(row["bucket_id"], row["name"]), [])
            if relations and any(x.get("valid") for x in relations):
                linked += 1
            if relations and not any(x.get("valid") for x in relations):
                broken += 1
        notify("Testando reversão no banco descartável")
        rollback = _rollback_probe(container)
        return {
            "sampled_from_592": len(archived),
            "sampled_from_116": len(recent),
            "sampled_total": len(targets),
            "sampled_bytes_copied_to_isolated_container": True,
            "sampled_items_opened_in_trusted_parser": opened,
            "sampled_items_unsupported": unsupported,
            "sampled_items_linked_to_restored_db": linked,
            "sampled_broken_clinical_links": broken,
            "recovered_etags_matched_in_sample": etags,
            "recovered_no_original_hash_in_sample": exceptions,
            "rollback_in_isolated_pg_verified": rollback,
            "sampled_integrated_recovery_passed": (
                len(archived) >= 4 and len(recent) >= 4 and old_opened >= 1
                and new_opened >= 1 and linked >= 1 and broken == 0 and rollback
            ),
        }

    try:
        notify("Restaurando banco em PostgreSQL Supabase isolado (Docker)")
        result = restore_database_locally(db_dir, db_key, isolated_callback=inspect_same_isolated_db)
    finally:
        # Even when the callback fails, the restore tool has a finally cleanup.
        name = private.get("container")
        if name:
            destroyed = _docker(["inspect", name], timeout=12)
            private["disposed"] = destroyed.returncode != 0
            if not private["disposed"]:
                _fail("DF_STAGE3_DISPOSABLE_DATABASE_STILL_RUNNING")
    counts = tuple(result.get(x) for x in (
        "restored_patients", "restored_cases", "restored_appointments",
        "restored_storage_metadata_rows"))
    if counts != EXPECTED_DB:
        _fail("DF_STAGE3_DB_BASELINE_COUNTS_DIFFER")
    result["isolated_database_disposed"] = private.get("disposed", False)
    result["protocol"] = "DF-EID-01"
    result["integrated_database_storage_restore_verified"] = bool(
        result["sampled_integrated_recovery_passed"] and result["isolated_database_disposed"])
    result["status"] = "SAMPLED_INTEGRATED_OK" if result[
        "integrated_database_storage_restore_verified"] else "SAMPLED_INTEGRATION_PARTIAL"
    result["qa_ui_2_clinics_authenticated"] = False
    result["all_708_individually_opened"] = False
    result["24_without_origin_hash_proven"] = False
    result["paid_beta_release_authorized"] = False
    # Never leak source_paths, medical content, patient/case names or IDs.
    return result
