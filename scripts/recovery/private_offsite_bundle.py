"""Private, offline, resumable-by-restarting encrypted ZIP backup.

Does NOT upload, delete, extract archives, print sensitive filenames or use any
network service. Encrypts each downloaded Storage ZIP/file with AES-256-GCM and
then independently reads back every ciphertext before declaring a local bundle.
Only the owner may upload the encrypted bundle to an independent destination.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import secrets
import sys
from pathlib import Path
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

MAGIC = b"DFZIP002"
AAD = b"dentalflow-private-offsite-bundle-v2:"
CHUNK = 1024 * 1024
ERROR = "DENTALFLOW_BUNDLE_CHECK_FAILED"
MAX_FILES = 100
MAX_MANIFEST_BYTES = 4 * 1024 * 1024


def _fail():
    raise ValueError(ERROR)


def _private_dir(path: Path):
    if not path.is_dir() or path.is_symlink():
        _fail()


def _key(path: Path) -> bytes:
    if path.is_symlink() or not path.is_file() or path.stat().st_size != 32:
        _fail()
    return path.read_bytes()


def _file_names(directory: Path):
    _private_dir(directory)
    files = sorted(directory.iterdir(), key=lambda p: p.name)
    if not files or len(files) > MAX_FILES:
        _fail()
    if any((not p.is_file()) or p.is_symlink() for p in files):
        _fail()
    if any(p.name.startswith(".") or p.suffix.lower() == ".dfenc" for p in files):
        _fail()
    # Windows Explorer downloads use ordinary file names. Never include a
    # private key or the index in an offsite bundle by accident.
    if any(p.name.startswith("DentalFlow_Chave_") or p.name.startswith("DentalFlow_Anexos_2026-10-29_Indice") for p in files):
        _fail()
    return files


def _validate_locations(src: Path, dst: Path, key_path: Path):
    src, dst, key_path = src.resolve(), dst.resolve(), key_path.resolve()
    if src == dst or src in dst.parents or dst in src.parents:
        _fail()
    if key_path == src or key_path == dst or src in key_path.parents or dst in key_path.parents:
        _fail()
    return src, dst, key_path


def _encrypted_write(src: Path, dest: Path, key: bytes, unit: str):
    iv = secrets.token_bytes(12)
    cipher = Cipher(algorithms.AES(key), modes.GCM(iv)).encryptor()
    cipher.authenticate_additional_data(AAD + unit.encode("ascii"))
    before = src.stat()
    content_hash, ciphertext_hash = hashlib.sha256(), hashlib.sha256()
    length = 0
    with src.open("rb") as reader, dest.open("xb") as writer:
        header = MAGIC + iv
        writer.write(header)
        ciphertext_hash.update(header)
        while True:
            part = reader.read(CHUNK)
            if not part:
                break
            length += len(part)
            content_hash.update(part)
            sealed = cipher.update(part)
            writer.write(sealed)
            ciphertext_hash.update(sealed)
        final = cipher.finalize()
        writer.write(final)
        ciphertext_hash.update(final)
        writer.write(cipher.tag)
        ciphertext_hash.update(cipher.tag)
        writer.flush()
        os.fsync(writer.fileno())
    after = src.stat()
    if before.st_size != length or (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        _fail()
    return {
        "name": src.name,
        "encrypted": dest.name,
        "size": length,
        "sha256": content_hash.hexdigest(),
        "ciphertext_sha256": ciphertext_hash.hexdigest(),
    }


def _readback(dest: Path, key: bytes, unit: str, expected: dict) -> bool:
    if dest.is_symlink() or not dest.is_file():
        return False
    size = dest.stat().st_size
    if size < 36:
        return False
    encrypted_sha, plain_sha = hashlib.sha256(), hashlib.sha256()
    plain_bytes = 0
    try:
        with dest.open("rb") as f:
            header = f.read(20)
            if len(header) != 20 or header[:8] != MAGIC:
                return False
            f.seek(size - 16)
            tag = f.read(16)
            if len(tag) != 16:
                return False
            f.seek(0)
            remaining_hash = size
            while remaining_hash:
                buf = f.read(min(CHUNK, remaining_hash))
                if not buf:
                    return False
                encrypted_sha.update(buf)
                remaining_hash -= len(buf)
            decipher = Cipher(algorithms.AES(key), modes.GCM(header[8:20], tag)).decryptor()
            decipher.authenticate_additional_data(AAD + unit.encode("ascii"))
            f.seek(20)
            left = size - 36
            while left:
                chunk = f.read(min(CHUNK, left))
                if not chunk:
                    return False
                left -= len(chunk)
                plaintext = decipher.update(chunk)
                plain_sha.update(plaintext)
                plain_bytes += len(plaintext)
            last = decipher.finalize()
            plain_sha.update(last)
            plain_bytes += len(last)
    except (OSError, ValueError, InvalidTag):
        return False
    return (
        plain_bytes == expected.get("size")
        and plain_sha.hexdigest() == expected.get("sha256")
        and encrypted_sha.hexdigest() == expected.get("ciphertext_sha256")
    )


def _manifest_write(manifest_path: Path, key: bytes, payload: dict):
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(raw) > MAX_MANIFEST_BYTES:
        _fail()
    nonce = secrets.token_bytes(12)
    cipher = AESGCM(key).encrypt(nonce, raw, AAD + b"manifest")
    with manifest_path.open("xb") as f:
        f.write(MAGIC + nonce + cipher)
        f.flush()
        os.fsync(f.fileno())


def _manifest_read(manifest_path: Path, key: bytes) -> dict:
    if manifest_path.is_symlink() or not manifest_path.is_file() or not (36 <= manifest_path.stat().st_size <= MAX_MANIFEST_BYTES + 36):
        _fail()
    blob = manifest_path.read_bytes()
    if blob[:8] != MAGIC:
        _fail()
    try:
        payload = json.loads(AESGCM(key).decrypt(blob[8:20], blob[20:], AAD + b"manifest"))
    except (InvalidTag, ValueError, KeyError, UnicodeDecodeError, json.JSONDecodeError):
        _fail()
    if payload.get("schema") != "dentalflow-offsite-private-bundle-v2" or not isinstance(payload.get("files"), list):
        _fail()
    files = payload["files"]
    if not (1 <= len(files) <= MAX_FILES):
        _fail()
    if not all(
        isinstance(item, dict) and
        item.get("encrypted") == f"part-{idx:03d}.dfenc" and
        isinstance(item.get("name"), str) and
        item["name"] == Path(item["name"]).name and
        not any(c in item["name"] for c in ("\\", "/", ":", "\x00")) and
        isinstance(item.get("size"), int) and item["size"] >= 0 and
        all(isinstance(item.get(k), str) and re.fullmatch(r"[0-9a-f]{64}", item[k])
            for k in ("sha256", "ciphertext_sha256"))
        for idx, item in enumerate(files, 1)
    ):
        _fail()
    if len({x["name"] for x in files}) != len(files):
        _fail()
    return payload


def create_bundle(source: str | Path, destination: str | Path, private_key_output: str | Path):
    src, dst, kp = _validate_locations(Path(source), Path(destination), Path(private_key_output))
    sources = _file_names(src)
    if kp.exists() or dst.exists():
        _fail()
    if not kp.parent.is_dir() or kp.parent.is_symlink():
        _fail()
    # The owner must save this key OUTSIDE both source and destination.
    with kp.open("xb") as f:
        key = secrets.token_bytes(32)
        f.write(key)
        f.flush()
        os.fsync(f.fileno())
    try:
        kp.chmod(0o600)
        dst.mkdir(mode=0o700)
        inventory = []
        for i, item in enumerate(sources, 1):
            unit = f"part-{i:03d}"
            receipt = _encrypted_write(item, dst / (unit + ".dfenc"), key, unit)
            if not _readback(dst / receipt["encrypted"], key, unit, receipt):
                _fail()
            inventory.append(receipt)
        _manifest_write(dst / "catalog.dfenc", key, {
            "schema": "dentalflow-offsite-private-bundle-v2",
            "files": inventory,
        })
        summary = verify_bundle(dst, kp)
        if summary["verified_files"] != len(sources):
            _fail()
        return summary
    except Exception:
        # Preserve incomplete ciphertext and key for incident analysis, but
        # refuse to declare success. Never delete user's source or key.
        _fail()


def verify_bundle(destination: str | Path, private_key_file: str | Path):
    dest = Path(destination).resolve()
    kp = Path(private_key_file).resolve()
    _private_dir(dest)
    if dest in kp.parents or kp == dest:
        _fail()
    key = _key(kp)
    meta = _manifest_read(dest / "catalog.dfenc", key)
    expected_files = len(meta["files"]) + 1
    if len(list(dest.iterdir())) != expected_files:
        _fail()
    total = 0
    for i, item in enumerate(meta["files"], 1):
        if not _readback(dest / item["encrypted"], key, f"part-{i:03d}", item):
            _fail()
        total += item["size"]
    return {
        "schema": "dentalflow-offsite-bundle-verification-v2",
        "verified_files": len(meta["files"]),
        "verified_plaintext_bytes": total,
        "encrypted_manifest_verified": True,
        "encrypted_parts_verified": True,
        "external_copy_confirmed": False,
        "integrated_restore_confirmed": False,
        "paid_beta_release_authorized": False,
    }


def main():
    parser = argparse.ArgumentParser(description="DentalFlow — backup AES-256-GCM offline")
    parser.add_argument("operation", choices=("create", "verify"))
    parser.add_argument("folder", help="Origem em create, diretório cifrado em verify")
    parser.add_argument("output", help="Diretório cifrado novo em create, chave original em verify")
    parser.add_argument("key", nargs="?", help="Novo arquivo de chave PRIVADO em create")
    args = parser.parse_args()
    try:
        if args.operation == "create":
            if not args.key:
                _fail()
            result = create_bundle(args.folder, args.output, args.key)
        else:
            if args.key:
                _fail()
            result = verify_bundle(args.folder, args.output)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception:
        print(ERROR, file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
