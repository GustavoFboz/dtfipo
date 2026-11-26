#!/usr/bin/env python3
"""Offline, read-only verifier for ZIPs downloaded via Lovable Storage UI.

No request to Lovable, Supabase, Asaas or Google Drive. Never extracts ZIPs,
prints a filename, or stores plaintext inventory. Uses the *owner's* private
AES-256-GCM checkpoint and key, supplied as local files at runtime.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import zipfile
from collections import Counter
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

INDEX_AAD = b"dentalflow-recovery-v1:dentalflow-storage-index-20261029"
INDEX_MAGIC = b"DFREC001"
EXPECTED_SOURCE = 708
EXPECTED_SAVED = 592
EXPECTED_MISSING = 116
EXPECTED_MISSING_BYTES = 1_968_840_906
# Keep all operational outputs anonymized, even on failed input.
FAILURE = "DENTALFLOW_LOCAL_CHECK_FAILED"


def _file_bytes(path: Path, max_bytes: int) -> bytes:
    if path.is_symlink() or not path.is_file() or path.stat().st_size > max_bytes:
        raise ValueError(FAILURE)
    return path.read_bytes()


def _load_index(index_path: Path, key_path: Path):
    key = _file_bytes(key_path, 32)
    if len(key) != 32:
        raise ValueError(FAILURE)
    blob = _file_bytes(index_path, 8 * 1024 * 1024)
    if len(blob) < 36 or blob[:8] != INDEX_MAGIC:
        raise ValueError(FAILURE)
    try:
        inventory = json.loads(AESGCM(key).decrypt(blob[8:20], blob[20:], INDEX_AAD))
    except (ValueError, KeyError, UnicodeDecodeError, json.JSONDecodeError, InvalidTag):
        raise ValueError(FAILURE) from None
    return inventory


def _basename(full_name: str) -> str:
    return full_name.replace("\\", "/").rstrip("/").rsplit("/", 1)[-1]


def _manifest(inventory):
    if (inventory.get("version") != 1 or
        inventory.get("source_objects") != EXPECTED_SOURCE or
        inventory.get("files_verified") != EXPECTED_SAVED or
        not isinstance(inventory.get("source_catalog"), list) or
        not isinstance(inventory.get("files"), list) or
        len(inventory["source_catalog"]) != EXPECTED_SOURCE or
        len(inventory["files"]) != EXPECTED_SAVED):
        raise ValueError(FAILURE)

    stored = set()
    for row in inventory["files"]:
        stored.add((row["bucket_id"], row["name"], row["source_version"]))

    missing = {}
    observed = set()
    for row in inventory["source_catalog"]:
        name = row["name"]
        if not isinstance(name, str) or not name:
            raise ValueError(FAILURE)
        identity = (row["bucket_id"], name, row["version"])
        if identity in observed:
            raise ValueError(FAILURE)
        observed.add(identity)
        if identity in stored:
            continue
        basename = _basename(name)
        # Flat ZIPs lose their folder prefix. Never guess in an ambiguous case.
        if basename in missing:
            raise ValueError(FAILURE)
        size = row["metadata"].get("size")
        if not isinstance(size, int) or isinstance(size, bool) or size < 0:
            raise ValueError(FAILURE)
        etag = str(row["metadata"].get("eTag") or "").strip('"')
        missing[basename] = (identity, size, etag)

    if len(missing) != EXPECTED_MISSING or sum(row[1] for row in missing.values()) != EXPECTED_MISSING_BYTES:
        raise ValueError(FAILURE)
    return missing


def _safe_file(path: Path, base: Path):
    if path.is_symlink() or not path.is_file():
        return False
    try:
        path.resolve().relative_to(base.resolve())
        return True
    except ValueError:
        return False


def _consume(reader, expected_size: int):
    md5 = hashlib.md5()
    sha = hashlib.sha256()
    total = 0
    while True:
        chunk = reader.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > expected_size:
            return None
        md5.update(chunk)
        sha.update(chunk)
    return (total, md5.hexdigest(), sha.hexdigest())


def check_panel_downloads(index_path: str | Path, key_path: str | Path, downloads_dir: str | Path):
    """Return only aggregate facts; does not print or persist any clinical info."""
    index_path, key_path, base = Path(index_path), Path(key_path), Path(downloads_dir)
    if not base.is_dir() or base.is_symlink():
        raise ValueError(FAILURE)

    missing = _manifest(_load_index(index_path, key_path))
    verified = set()
    md5_verified = set()
    name_size_only = set()
    scanned_archives = 0
    invalid_zip_count = 0
    invalid_entries = 0
    duplicates = 0
    encountered_nonmatching = 0

    def inspect(basename, reader, size):
        nonlocal invalid_entries, duplicates, encountered_nonmatching
        item = missing.get(basename)
        if item is None:
            encountered_nonmatching += 1
            return
        identity, expected_size, e_tag = item
        if size != expected_size:
            invalid_entries += 1
            return
        try:
            actual = _consume(reader, expected_size)
        except (OSError, RuntimeError, ValueError, EOFError, zipfile.BadZipFile):
            invalid_entries += 1
            return
        if actual is None or actual[0] != expected_size:
            invalid_entries += 1
            return
        if re.fullmatch("[a-fA-F0-9]{32}", e_tag):
            if actual[1].lower() != e_tag.lower():
                invalid_entries += 1
                return
            md5_verified.add(identity)
        else:
            # A SHA-256 was computed for transfer integrity, but historical
            # source metadata has no comparable digest. Do not claim byte
            # identity solely from filename + length + valid ZIP CRC.
            name_size_only.add(identity)
        if identity in verified:
            duplicates += 1
        verified.add(identity)

    for root, dirs, files in os.walk(base, followlinks=False):
        dirs[:] = [d for d in dirs if not (Path(root) / d).is_symlink()]
        for filename in sorted(files):
            path = Path(root) / filename
            if not _safe_file(path, base):
                continue
            basename = _basename(filename)
            try:
                if basename in missing and path.stat().st_size == missing[basename][1]:
                    with path.open("rb") as f:
                        inspect(basename, f, path.stat().st_size)
                    continue
                if path.suffix.lower() != ".zip":
                    continue
                scanned_archives += 1
                with zipfile.ZipFile(path, "r", allowZip64=True) as archive:
                    for member in archive.infolist():
                        if member.is_dir():
                            continue
                        # Never extract any archive path. Basename is allowed
                        # only because every missing basename is unique in
                        # the authenticated historical checkpoint.
                        member_basename = _basename(member.filename)
                        if member_basename not in missing:
                            encountered_nonmatching += 1
                            continue
                        with archive.open(member, "r") as stream:
                            inspect(member_basename, stream, member.file_size)
            except (OSError, RuntimeError, ValueError, zipfile.BadZipFile, EOFError):
                invalid_zip_count += 1

    remaining = len(missing) - len(verified)
    return {
        "scope": "private-offline-panel-zip-audit",
        "expected_historical_objects": EXPECTED_SOURCE,
        "previously_copied": EXPECTED_SAVED,
        "historically_missing": EXPECTED_MISSING,
        "historically_missing_bytes": EXPECTED_MISSING_BYTES,
        "matching_downloaded_objects": len(verified),
        "etag_md5_matches": len(md5_verified),
        "name_size_no_source_digest": len(name_size_only),
        "missing_after_local_check": remaining,
        "downloaded_zip_archives_scanned": scanned_archives,
        "invalid_archives": invalid_zip_count,
        "mismatched_or_corrupt_entries": invalid_entries,
        "repeated_matching_entries": duplicates,
        "ignored_nonmatching_entries": encountered_nonmatching,
        "requires_current_storage_reconciliation": True,
        "requires_integrated_database_restore": True,
        "operational_acceptance": False
    }


def main():
    parser = argparse.ArgumentParser(description="Conferência local de ZIPs do Storage, sem enviar dados")
    parser.add_argument("index_file", help="Índice .dfenc original")
    parser.add_argument("key_file", help="Chave binária original (nunca enviar ao GitHub)")
    parser.add_argument("downloads_dir", help="Pasta privada com os ZIPs baixados")
    args = parser.parse_args()
    try:
        report = check_panel_downloads(args.index_file, args.key_file, args.downloads_dir)
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except Exception:
        print(FAILURE)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
