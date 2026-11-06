#!/usr/bin/env python3
"""Isolated, LOCAL database restore rehearsal for a verified DentalFlow backup.

There is NO network or host-volume access inside the PostgreSQL container.
Never connect to a database URL or a paid provider. The encrypted owner-owned
database bundle is authenticated in memory and piped only to Docker stdin.

This checks the database dump ONLY, not an integrated Storage restoration.
It must never certify the beta, even if PostgreSQL restore succeeds.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import secrets
import shutil
import subprocess
import sys
import time
import zipfile
from pathlib import Path

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.exceptions import InvalidTag

from private_offsite_bundle import (
    AAD, CHUNK, MAGIC, _key, _manifest_read, _readback,
)

POSTGRES_IMAGE = "supabase/postgres:17.11.0.018"
POSTGRES_USERNAME = "supabase_admin"
MAX_DATABASE_BYTES = 96 * 1024 * 1024
ERROR = "DF_ISOLATED_DB_RESTORE_UNVERIFIED"
FORMAT_ERROR = "DF_DB_EXPORT_UNSUPPORTED_FORMAT"


def _fail(message=ERROR):
    raise ValueError(message)


def read_database_export(encrypted_dir: str | Path, private_key: str | Path):
    """Validate catalog, then decrypt the one encrypted DB file into memory."""
    directory = Path(encrypted_dir).resolve()
    keypath = Path(private_key).resolve()
    if not directory.is_dir() or directory.is_symlink():
        _fail()
    if keypath == directory or directory in keypath.parents:
        _fail()
    key = _key(keypath)
    catalog = _manifest_read(directory / "catalog.dfenc", key)
    files = catalog["files"]
    if len(files) != 1 or len(list(directory.iterdir())) != 2:
        _fail()
    item = files[0]
    if item["encrypted"] != "part-001.dfenc":
        _fail()
    if item["size"] > MAX_DATABASE_BYTES:
        _fail("DF_DATABASE_TOO_LARGE_FOR_MEMORY_ONLY_CHECK")
    encrypted = directory / "part-001.dfenc"
    if not _readback(encrypted, key, "part-001", item):
        _fail()
    if encrypted.is_symlink() or encrypted.stat().st_size > MAX_DATABASE_BYTES + 36:
        _fail()
    blob = encrypted.read_bytes()
    if len(blob) < 36 or blob[:8] != MAGIC:
        _fail()
    cipher = Cipher(
        algorithms.AES(key),
        modes.GCM(blob[8:20], blob[-16:]),
    ).decryptor()
    cipher.authenticate_additional_data(AAD + b"part-001")
    try:
        plain = cipher.update(blob[20:-16]) + cipher.finalize()
    except (InvalidTag, ValueError):
        _fail()
    if len(plain) != item["size"] or hashlib.sha256(plain).hexdigest() != item["sha256"]:
        _fail()
    data, export_type = _unwrap_export(plain)
    return data, export_type


def _unwrap_export(data: bytes):
    if data.startswith(b"PGDMP"):
        return data, "pg_custom"
    if data.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                members = [m for m in archive.infolist() if not m.is_dir()]
                if len(members) != 1:
                    _fail(FORMAT_ERROR)
                m = members[0]
                # File paths are never extracted, used as commands, or printed.
                if (m.flag_bits & 1 or m.file_size > MAX_DATABASE_BYTES or
                    not m.filename.lower().endswith((".sql", ".dump", ".backup", ".pgdump"))):
                    _fail(FORMAT_ERROR)
                with archive.open(m) as f:
                    raw = f.read(MAX_DATABASE_BYTES + 1)
                if len(raw) > MAX_DATABASE_BYTES:
                    _fail(FORMAT_ERROR)
                return _unwrap_export(raw)
        except (zipfile.BadZipFile, RuntimeError):
            _fail(FORMAT_ERROR)
    # PostgreSQL text dumps normally begin with a comment or SET statement.
    prefix = data[:4096].lstrip(b"\xef\xbb\xbf\r\n\t ")
    if (prefix.startswith(b"--") or prefix.startswith(b"SET ") or
        prefix.startswith(b"CREATE ") or prefix.startswith(b"BEGIN;") or
        prefix.startswith(b"\\connect")):
        try:
            data.decode("utf-8")
        except UnicodeDecodeError:
            _fail(FORMAT_ERROR)
        return data, "sql"
    _fail(FORMAT_ERROR)


def _docker(args: list[str], *, data: bytes | None = None, timeout: int = 120):
    try:
        return subprocess.run(
            ["docker", *args],
            input=data,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        _fail("DF_DOCKER_UNAVAILABLE_OR_TIMEOUT")


def inspect_required_extensions(encrypted_dir: str | Path, private_key: str | Path):
    """Only read the pg_restore TOC. Never run archive SQL or print other entries.

    The whole PGDMP may contain private metadata. All pg_restore stdout/stderr
    is retained locally in memory; only bounded extension identifiers leave.
    """
    data, export_type = read_database_export(encrypted_dir, private_key)
    if export_type != "pg_custom":
        _fail("DF_EXTENSION_SCAN_REQUIRES_PGDMP")
    if not shutil.which("docker"):
        _fail("DF_DOCKER_DESKTOP_NOT_INSTALLED")
    info = _docker(["info", "--format", "{{.ServerVersion}}"], timeout=15)
    if info.returncode:
        _fail("DF_DOCKER_DESKTOP_NOT_RUNNING")
    # No SQL execution: pg_restore --list parses only the archive's TOC.
    parsed = _docker([
        "run", "--rm", "-i", "--network", "none",
        "--read-only", "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        "--pids-limit", "128", "--memory", "256m",
        "--entrypoint", "pg_restore", POSTGRES_IMAGE, "--list"
    ], data=data, timeout=45)
    if parsed.returncode:
        _fail("DF_EXTENSION_SCAN_TOOL_FAILED")
    found = set()
    for match in re.finditer(
        rb"(?m)^\s*\d+;\s+\d+\s+\d+\s+EXTENSION\s+-\s+([A-Za-z][A-Za-z0-9_-]{0,63})(?=\s|$)",
        parsed.stdout,
    ):
        found.add(match.group(1).decode("ascii").lower())
    # Fail closed if the archive claims an implausible number of extensions.
    if len(found)>64:
        _fail("DF_EXTENSION_SCAN_INVALID_COUNT")
    return {
        "scope": "authenticated-archive-toc-only",
        "required_extensions": sorted(found),
        "extension_count": len(found),
        "sql_executed": False,
        "restore_success_verified": False,
        "beta_release_authorized": False,
    }


def classify_restore_failure(stderr: bytes) -> str:
    """Classify PostgreSQL failures in memory. NEVER expose stderr: it may contain PHI."""
    if not isinstance(stderr, bytes):
        return "DF_RESTORE_SQL_UNCLASSIFIED"
    msg = stderr.lower()
    if any(fragment in msg for fragment in (
        b"extension", b"could not open extension control file",
    )) and any(fragment in msg for fragment in (
        b"is not available", b"could not open extension control file",
        b"permission denied to create extension", b"does not exist",
    )):
        return "DF_RESTORE_REQUIRES_PLATFORM_EXTENSION"
    if b"unsupported version" in msg or b"unsupported archive" in msg:
        return "DF_RESTORE_UNSUPPORTED_ARCHIVE_VERSION"
    if b"unrecognized configuration parameter" in msg:
        return "DF_RESTORE_REQUIRES_SUPABASE_SETTINGS"
    if b"role" in msg and b"does not exist" in msg:
        return "DF_RESTORE_REQUIRES_SUPABASE_ROLES"
    if b"schema" in msg and b"does not exist" in msg:
        return "DF_RESTORE_REQUIRES_PLATFORM_SCHEMAS"
    if b"function" in msg and b"does not exist" in msg:
        return "DF_RESTORE_REQUIRES_PLATFORM_FUNCTION"
    if b"type" in msg and b"does not exist" in msg:
        return "DF_RESTORE_REQUIRES_PLATFORM_TYPE"
    if b"already exists" in msg:
        return "DF_RESTORE_OBJECT_CONFLICT"
    if b"permission denied" in msg or b"must be owner" in msg:
        return "DF_RESTORE_PRIVILEGE_REQUIREMENT"
    if b"out of memory" in msg or b"no space left" in msg:
        return "DF_RESTORE_CONTAINER_RESOURCE_LIMIT"
    if b"connection" in msg and b"closed" in msg:
        return "DF_RESTORE_DATABASE_CONNECTION_CLOSED"
    return "DF_RESTORE_SQL_UNCLASSIFIED"


def restore_database_locally(encrypted_dir: str | Path, private_key: str | Path):
    data, export_type = read_database_export(encrypted_dir, private_key)
    if not shutil.which("docker"):
        _fail("DF_DOCKER_DESKTOP_NOT_INSTALLED")
    info = _docker(["info", "--format", "{{.ServerVersion}}"], timeout=15)
    if info.returncode:
        _fail("DF_DOCKER_DESKTOP_NOT_RUNNING")

    # The image download happens before any sensitive input enters Docker.
    pull = _docker(["pull", POSTGRES_IMAGE], timeout=240)
    if pull.returncode:
        _fail("DF_POSTGRES_IMAGE_UNAVAILABLE")

    # Supabase's Vault bootstrap writes an ephemeral local key. The image's
    # writable container layer is deleted on cleanup; clinical PGDATA stays
    # strictly in tmpfs. Docker has no network, ports or host mounts.
    user_id = _docker(["run", "--rm", "--network", "none", "--entrypoint", "id",
                       POSTGRES_IMAGE, "-u", "postgres"], timeout=20)
    group_id = _docker(["run", "--rm", "--network", "none", "--entrypoint", "id",
                        POSTGRES_IMAGE, "-g", "postgres"], timeout=20)
    if user_id.returncode or group_id.returncode:
        _fail("DF_SUPABASE_IMAGE_USER_LOOKUP_FAILED")
    uid = user_id.stdout.decode("ascii", "strict").strip()
    gid = group_id.stdout.decode("ascii", "strict").strip()
    if not uid.isdecimal() or not gid.isdecimal():
        _fail("DF_SUPABASE_IMAGE_USER_LOOKUP_FAILED")

    name = "dentalflow-qa-" + secrets.token_hex(7)
    try:
        run = _docker([
            "run", "-d", "--rm",
            "--name", name,
            "--network", "none",
            "--user", "postgres",
            "--cap-drop=ALL",
            "--security-opt", "no-new-privileges",
            "--pids-limit", "256",
            "--memory", "1g",
            "--tmpfs", f"/var/lib/postgresql/data:rw,uid={uid},gid={gid},mode=0700,size=512m",
            "--tmpfs", f"/var/run/postgresql:rw,uid={uid},gid={gid},mode=0770,size=16m",
            "--tmpfs", "/tmp:rw,mode=1777,size=64m",
            "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
            POSTGRES_IMAGE, "postgres", "-c", "config_file=/etc/postgresql/postgresql.conf",
        ], timeout=120)
        if run.returncode:
            _fail("DF_ISOLATED_DB_CONTAINER_FAILED")
        for _ in range(45):
            ready = _docker(
                ["exec", name, "pg_isready", "-U", POSTGRES_USERNAME, "-d", "postgres"], timeout=8
            )
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            _fail("DF_ISOLATED_DB_NOT_READY")

        # Restore from STDIN only: no PHI in shell arguments, logs, volumes
        # or GitHub. The isolated container has no network interface.
        if export_type == "pg_custom":
            command = [
                "pg_restore", "--no-owner", "--no-privileges",
                "--exit-on-error", "--single-transaction",
                "-U", POSTGRES_USERNAME, "-d", "postgres",
            ]
        else:
            command = [
                "psql", "-v", "ON_ERROR_STOP=1", "-U", POSTGRES_USERNAME,
                "-d", "postgres", "-q",
            ]
        restored = _docker(["exec", "-i", name, *command], data=data, timeout=240)
        if restored.returncode:
            # Logs can contain user details. Do not emit stderr/stdout here.
            _fail(classify_restore_failure(restored.stderr))

        query = """
          SELECT
            (SELECT count(*) FROM public.patients),
            (SELECT count(*) FROM public.cases),
            (SELECT count(*) FROM public.clinic_appointments),
            (SELECT count(*) FROM public.storage_files)
        """
        tested = _docker(
            ["exec", name, "psql", "-At", "-F", "|", "-U", POSTGRES_USERNAME, "-d", "postgres", "-c", query],
            timeout=20,
        )
        if tested.returncode:
            _fail("DF_RESTORED_SCHEMA_MISSING_CLINICAL_TABLES")
        cells = tested.stdout.decode("ascii", "strict").strip().split("|")
        if len(cells) != 4 or any(not c.isdecimal() for c in cells):
            _fail("DF_RESTORED_TABLE_COUNTS_INVALID")
        counts = list(map(int, cells))
        if counts[0] == 0 or counts[1] == 0:
            _fail("DF_RESTORED_DATA_EMPTY")
        return {
            "scope": "isolated-postgresql-database-only",
            "database_bundle_verified": True,
            "detected_archive_format": export_type,
            "local_docker_network_disabled": True,
            "local_db_has_no_exposed_port": True,
            "local_db_has_no_host_volume": True,
            "supabase_postgres_17_image": True,
            "ephemeral_vault_key_isolated_to_container": True,
            "restored_patients": counts[0],
            "restored_cases": counts[1],
            "restored_appointments": counts[2],
            "restored_storage_metadata_rows": counts[3],
            "real_storage_file_bytes_restored": False,
            "integrated_database_storage_restore_verified": False,
            "billing_or_asaas_replayed": False,
            "beta_release_authorized": False,
        }
    finally:
        # Whether successful or failed, remove every bit of restored live data.
        _docker(["rm", "-f", name], timeout=25)


def main():
    ap = argparse.ArgumentParser(description="DentalFlow local database restore, no network")
    ap.add_argument("encrypted_directory")
    ap.add_argument("new_private_key")
    ap.add_argument("--inspect-only", action="store_true")
    args = ap.parse_args()
    try:
        if args.inspect_only:
            data, export_type = read_database_export(args.encrypted_directory, args.new_private_key)
            result = {
                "archive_authenticated": True,
                "format": export_type,
                "database_payload_bytes": len(data),
                "real_restore_performed": False,
                "paid_beta_authorized": False,
            }
        else:
            result = restore_database_locally(args.encrypted_directory, args.new_private_key)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception:
        print(ERROR, file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
