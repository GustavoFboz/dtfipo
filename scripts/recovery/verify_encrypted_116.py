#!/usr/bin/env python3
"""Offline verification of 116 recovered DentalFlow Storage objects, inside
the 14-piece separately encrypted offsite bundle. Never writes plaintext,
extracts ZIPs, opens the network or prints clinical names."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import zipfile
from pathlib import Path

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from private_offsite_bundle import MAGIC, _key, _manifest_read, _readback
from verify_panel_downloads import (
    _load_index, _manifest, _basename, _consume,
    EXPECTED_SOURCE, EXPECTED_SAVED, EXPECTED_MISSING,
)

FAILURE = "DF_PRIVATE_STORAGE_RECONCILIATION_FAILED"


class AuthenticatedZipView(io.RawIOBase):
    """A seekable plaintext view of a fully authenticated AES-256-GCM file.

    The GCM tag, ciphertext SHA256, plaintext SHA256 and byte count are
    verified before the first read. GCM (96-bit nonce) uses AES-CTR with
    counter = 2 for the first plaintext block, permitting bounded random
    access for ZipFile without writing extracted bytes to disk.
    """
    def __init__(self, path: Path, key: bytes, unit: str, receipt: dict):
        super().__init__()
        self._reader = None
        if path.is_symlink() or not path.is_file() or not _readback(path, key, unit, receipt):
            raise ValueError(FAILURE)
        self._path = path
        self._initial = (path.stat().st_size, path.stat().st_mtime_ns)
        self._reader = path.open("rb")
        header = self._reader.read(20)
        if len(header) != 20 or header[:8] != MAGIC:
            self.close()
            raise ValueError(FAILURE)
        self._key = key
        self._nonce = header[8:20]
        self._length = receipt["size"]
        self._position = 0

    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self._position

    def seek(self, offset, whence=os.SEEK_SET):
        if whence == os.SEEK_CUR:
            offset += self._position
        elif whence == os.SEEK_END:
            offset += self._length
        elif whence != os.SEEK_SET or offset < 0:
            raise ValueError(FAILURE)
        if offset < 0:
            raise ValueError(FAILURE)
        self._position = offset
        return offset

    def read(self, size=-1):
        if self.closed:
            raise ValueError(FAILURE)
        if self._position >= self._length:
            return b""
        if size is None or size < 0:
            size = self._length - self._position
        size = min(size, self._length - self._position)
        if size == 0:
            return b""
        block, skip = divmod(self._position, 16)
        if block >= 0xFFFFFFFE:
            raise ValueError(FAILURE)
        counter = self._nonce + (2 + block).to_bytes(4, "big")
        decryptor = Cipher(algorithms.AES(self._key), modes.CTR(counter)).decryptor()
        if skip:
            decryptor.update(b"\x00" * skip)
        self._reader.seek(self._position + 20)
        encrypted = self._reader.read(size)
        if len(encrypted) != size:
            raise ValueError(FAILURE)
        self._position += size
        return decryptor.update(encrypted) + decryptor.finalize()

    def close(self):
        if not self.closed:
            if self._reader is not None:
                modified = (self._path.stat().st_size, self._path.stat().st_mtime_ns) != self._initial
                self._reader.close()
                self._reader = None
                super().close()
                if modified:
                    raise ValueError(FAILURE)
            else:
                super().close()


def verify_encrypted_116(index_file, old_key_file, bundle_dir, offsite_key_file, on_progress=None):
    """Only anonymized aggregate results. Input sources are never modified."""
    directory = Path(bundle_dir)
    key_path = Path(offsite_key_file)
    if (directory.is_symlink() or not directory.is_dir() or
        key_path.is_symlink() or not key_path.is_file() or
        directory.resolve() in key_path.resolve().parents):
        raise ValueError(FAILURE)
    historical = _manifest(_load_index(Path(index_file), Path(old_key_file)))
    new_key = _key(key_path)
    meta = _manifest_read(directory / "catalog.dfenc", new_key)
    parts = meta["files"]
    if len(parts) != 14 or len(list(directory.iterdir())) != 15:
        raise ValueError(FAILURE)

    verified = {}  # private SHA-256 per historical identity; never printed
    etag_matched = set()
    no_source_digest = set()
    invalid = 0
    broken_zips = 0
    duplicates = 0
    ignored = 0
    total_bundle_bytes = 0

    def validate(basename, reader, declared_size):
        nonlocal invalid, duplicates, ignored
        expected = historical.get(basename)
        if expected is None:
            ignored += 1
            return
        identity, size, etag = expected
        if declared_size != size:
            invalid += 1
            return
        scanned = _consume(reader, size)
        if scanned is None or scanned[0] != size:
            invalid += 1
            return
        tag = etag.strip('"')
        if re.fullmatch(r"[0-9a-fA-F]{32}", tag):
            if scanned[1].lower() != tag.lower():
                invalid += 1
                return
            etag_matched.add(identity)
        else:
            no_source_digest.add(identity)
        if identity in verified:
            duplicates += 1
            if verified[identity] != scanned[2]:
                invalid += 1
                return
        verified[identity] = scanned[2]

    for i, receipt in enumerate(parts, 1):
        unit = f"part-{i:03d}"
        encrypted = directory / receipt["encrypted"]
        with AuthenticatedZipView(encrypted, new_key, unit, receipt) as plaintext:
            total_bundle_bytes += receipt["size"]
            basename = _basename(receipt["name"])
            # A directly downloaded source file (possibly ending in .zip)
            # must be treated as one object, not an archive of other files.
            if basename in historical and historical[basename][1] == receipt["size"]:
                validate(basename, plaintext, receipt["size"])
                if on_progress is not None:
                    on_progress(i, len(parts))
                continue
            if not receipt["name"].lower().endswith(".zip"):
                ignored += 1
                if on_progress is not None:
                    on_progress(i, len(parts))
                continue
            try:
                with zipfile.ZipFile(plaintext, "r", allowZip64=True) as zip_reader:
                    for entry in zip_reader.infolist():
                        if entry.is_dir():
                            continue
                        name = _basename(entry.filename)
                        if name not in historical:
                            ignored += 1
                            continue
                        if entry.flag_bits & 1 or entry.file_size != historical[name][1]:
                            invalid += 1
                            continue
                        with zip_reader.open(entry, "r") as stream:
                            validate(name, stream, entry.file_size)
            except (OSError, RuntimeError, ValueError, EOFError, zipfile.BadZipFile):
                broken_zips += 1
        if on_progress is not None:
            on_progress(i, len(parts))

    # Stop on missing, invalid, corrupted or conflicting duplicate bytes.
    if len(verified) != EXPECTED_MISSING or invalid or broken_zips:
        raise ValueError(FAILURE)
    return {
        "scope": "local-offline-encrypted-storage-audit",
        "private_index_authenticated": True,
        "offsite_encrypted_parts_authenticated": len(parts),
        "offsite_plaintext_zip_bytes_verified": total_bundle_bytes,
        "historical_objects_in_index": EXPECTED_SOURCE,
        "previous_historical_objects_in_33_volumes": EXPECTED_SAVED,
        "recovered_objects_readable_and_verified": len(verified),
        "recovered_objects_missing": EXPECTED_MISSING - len(verified),
        "matching_historical_md5_etags": len(etag_matched),
        "without_historical_digest_for_comparison": len(no_source_digest),
        "invalid_entries": invalid,
        "invalid_zip_files": broken_zips,
        "identical_duplicate_entries": duplicates,
        "other_unmatched_entries_ignored": ignored,
        "plaintext_documents_written": False,
        "network_used": False,
        "original_33_archive_volumes_rechecked_here": False,
        "real_postgresql_and_storage_joint_restore": False,
        "beta_release_authorized": False,
    }


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description="Private DentalFlow 116-object offline audit")
    cli.add_argument("--index", required=True)
    cli.add_argument("--old-key", required=True)
    cli.add_argument("--offsite", required=True)
    cli.add_argument("--offsite-key", required=True)
    args = cli.parse_args()
    try:
        print(json.dumps(verify_encrypted_116(
            args.index, args.old_key, args.offsite, args.offsite_key
        ), ensure_ascii=False, indent=2))
    except Exception:
        print(FAILURE)
        raise SystemExit(1)
