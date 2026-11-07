#!/usr/bin/env python3
"""Stream-verify an existing DentalFlow encrypted Storage subset offline.

No plaintext patient files are written. Only aggregate counts are emitted.
Requires the Python 'cryptography' package and an isolated archive vault.
This does NOT complete an incomplete historical backup.
"""
import argparse
import hashlib
import json
import os
import re
import stat
import sys
import zipfile
from pathlib import Path
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAGIC = b"DFREC001"
INDEX_NAME = "dentalflow-storage-index-20261029"
FILE_NAME = re.compile(r"^[a-f0-9]{64}\.dfenc$")

class VerificationError(Exception):
    pass

def _require(test, code):
    if not test:
        raise VerificationError(code)

def _decrypt_small(data, key, name):
    _require(data.startswith(MAGIC) and len(data) >= 36, "RECOVERY_ENCRYPTED_FORMAT_INVALID")
    return AESGCM(key).decrypt(data[8:20], data[20:],
        ("dentalflow-recovery-v1:" + name).encode("utf8"))

def _digest_file(filepath):
    digest = hashlib.sha256()
    with open(filepath, "rb") as input_file:
        while chunk := input_file.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()

def _decrypted_stream_digest(archive, member, key, name):
    with archive.open(member) as stream:
        header = stream.read(20)
        _require(len(header) == 20 and header.startswith(MAGIC),
            "RECOVERY_ENCRYPTED_OBJECT_INVALID")
        decipher = Cipher(algorithms.AES(key), modes.GCM(header[8:20])).decryptor()
        decipher.authenticate_additional_data(("dentalflow-recovery-v1:" + name).encode("utf8"))
        remainder = b""
        digest = hashlib.sha256()
        total = 0
        while chunk := stream.read(1024 * 1024):
            combined = remainder + chunk
            if len(combined) <= 16:
                remainder = combined
                continue
            plain = decipher.update(combined[:-16])
            remainder = combined[-16:]
            digest.update(plain)
            total += len(plain)
        _require(len(remainder) == 16, "RECOVERY_ENCRYPTED_OBJECT_TAG_MISSING")
        final = decipher.finalize_with_tag(remainder)
        digest.update(final)
        total += len(final)
        return total, digest.hexdigest()

def verify_archived_subset(index_path, key_path, volumes_directory, on_progress=None):
    index_path = Path(index_path)
    key_path = Path(key_path)
    vault = Path(volumes_directory)
    info = key_path.lstat()
    # NTFS permissions are ACL-based: POSIX mode bits cannot validate them.
    # Still reject links and any file whose content is not a 32-byte key.
    _require(stat.S_ISREG(info.st_mode) and not key_path.is_symlink()
             and (os.name == "nt" or info.st_mode & 0o077 == 0),
             "RECOVERY_KEY_PERMISSIONS")
    key = key_path.read_bytes()
    _require(len(key) == 32, "RECOVERY_KEY_LENGTH")
    _require(index_path.is_file() and not index_path.is_symlink()
             and index_path.stat().st_size <= 8 * 1024 * 1024,
             "RECOVERY_INDEX_READ_FAILED")
    index = json.loads(_decrypt_small(index_path.read_bytes(), key, INDEX_NAME))
    _require(index.get("version") == 1 and isinstance(index.get("files"), list)
             and isinstance(index.get("parts"), list)
             and isinstance(index.get("source_catalog"), list),
             "RECOVERY_INDEX_FORMAT_INVALID")
    _require(len(index["source_catalog"]) == index["source_objects"],
             "RECOVERY_INDEX_SOURCE_COUNT")
    expected = {}
    for row in index["files"]:
        record = (row["bucket_id"], row["name"], row["source_version"])
        _require(record not in expected, "RECOVERY_DUPLICATE_RECEIPT")
        expected[record] = (row["bytes"], row["sha256"])
    _require(len(expected) == index["files_verified"],
             "RECOVERY_INDEX_RECEIPT_COUNT")
    source = {(row["bucket_id"], row["name"], row["version"]):row["metadata"]["size"]
              for row in index["source_catalog"]}
    _require(len(source) == index["source_objects"], "RECOVERY_DUPLICATE_SOURCE")
    for identity, (size, _) in expected.items():
        _require(identity in source and source[identity] == size, "RECOVERY_SOURCE_MISMATCH")

    seen = set()
    total_plain = 0
    total_zip = 0
    for i, part in enumerate(index["parts"], start=1):
        _require(part["part"] == i, "RECOVERY_PART_ORDER_INVALID")
        archive_path = vault / ("DentalFlow_Anexos_2026-10-29_Parte_" + str(i).zfill(2) + ".zip")
        archive_stat = archive_path.lstat()
        _require(stat.S_ISREG(archive_stat.st_mode) and not archive_path.is_symlink()
                 and archive_stat.st_size == part["bytes"], "RECOVERY_ZIP_SIZE_INVALID")
        _require(_digest_file(archive_path) == part["sha256"], "RECOVERY_ZIP_SHA256_MISMATCH")
        total_zip += archive_stat.st_size
        with zipfile.ZipFile(archive_path) as archive:
            part_meta = json.loads(archive.read("part.json"))
            _require(part_meta["part_number"] == i, "RECOVERY_PART_META_INVALID")
            manifest = json.loads(_decrypt_small(archive.read("manifest.dfenc"), key,
                           part_meta["authenticated_name"]))
            rows = manifest["files"]
            _require(manifest["backup_id"] == part_meta["backup_id"] and
                     manifest["part_number"] == i and len(rows) == part["files"] and
                     (part_meta.get("files") is None or len(rows) == part_meta["files"]),
                     "RECOVERY_MANIFEST_MISMATCH")
            for row in rows:
                identity = (row["bucket_id"], row["name"], row["source_version"])
                _require(identity in expected and identity not in seen,
                         "RECOVERY_UNEXPECTED_OBJECT")
                encrypted_name = row["encrypted_file"]
                _require(FILE_NAME.fullmatch(encrypted_name) is not None,
                         "RECOVERY_ENCRYPTED_NAME_INVALID")
                size, digest = _decrypted_stream_digest(
                    archive, "files/" + encrypted_name, key,
                    "storage:" + row["bucket_id"] + "/" + row["name"])
                _require((size, digest) == expected[identity] and
                         (size, digest) == (row["bytes"], row["sha256"]),
                         "RECOVERY_DECRYPTED_OBJECT_MISMATCH")
                seen.add(identity)
                total_plain += size
        if on_progress is not None:
            on_progress(i, len(index["parts"]))
    _require(len(seen) == len(expected) and total_plain == index["bytes_verified"],
             "RECOVERY_VERIFIED_TOTAL_MISMATCH")
    return {
        "authenticated_index": True,
        "zip_manifests_verified": len(index["parts"]),
        "zip_bytes_sha256_verified": total_zip,
        "archived_objects_verified": len(seen),
        "verified_decrypted_bytes_without_plaintext_files": total_plain,
        "historical_objects_missing": index["source_objects"] - len(seen),
        "historical_copy_complete": len(seen) == index["source_objects"],
        "operational_acceptance": False,
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Private, offline DentalFlow encrypted Storage verification")
    parser.add_argument("--index", required=True)
    parser.add_argument("--key", required=True)
    parser.add_argument("--volumes", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(verify_archived_subset(args.index, args.key, args.volumes)))
    except Exception as error:
        # No paths, object names, account identities or keys in operational logs.
        code = str(error) if isinstance(error, VerificationError) else "RECOVERY_OFFLINE_VALIDATION_FAILED"
        print(json.dumps({"passed": False, "code": code}), file=sys.stderr)
        sys.exit(1)
