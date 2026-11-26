"""Synthetic-only tests for encrypted offsite ZIP and file bundles."""
from __future__ import annotations
import os
import tempfile
import unittest
import zipfile
from pathlib import Path

from private_offsite_bundle import create_bundle, verify_bundle, ERROR


class OffsiteBundleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.parent = Path(self.tmp.name)
        self.original = self.parent / "original"
        self.key_dir = self.parent / "private"
        self.original.mkdir()
        self.key_dir.mkdir()
        self.destination = self.parent / "encrypted"
        self.key_path = self.key_dir / "secret.bin"
        self.fake_name = "fictitious-case-0001.zip"
        with zipfile.ZipFile(self.original / self.fake_name, "w") as z:
            z.writestr("not-a-real-patient/secret-note.html", b"FIXTURE-PHI-MARKER")
        (self.original / "database-export-synthetic.sql").write_bytes(b"fake PostgreSQL dump for testing only")

    def test_create_verify_and_separate_key(self):
        result = create_bundle(self.original, self.destination, self.key_path)
        self.assertEqual(result["verified_files"], 2)
        self.assertTrue(result["encrypted_manifest_verified"])
        self.assertFalse(result["external_copy_confirmed"])
        self.assertFalse(result["paid_beta_release_authorized"])
        self.assertEqual(result, verify_bundle(self.destination, self.key_path))
        self.assertEqual(self.key_path.stat().st_size, 32)
        self.assertFalse((self.destination / "secret.bin").exists())
        self.assertEqual(
            sorted(p.name for p in self.destination.iterdir()),
            ["catalog.dfenc", "part-001.dfenc", "part-002.dfenc"]
        )
        self.assertTrue((self.original / self.fake_name).is_file())
        for p in self.destination.iterdir():
            blob = p.read_bytes()
            self.assertNotIn(b"FIXTURE-PHI-MARKER", blob)
            self.assertNotIn(self.fake_name.encode(), blob)
            self.assertNotIn(b"not-a-real-patient", blob)

    def test_decryption_authentication_rejects_ciphertext_tamper(self):
        create_bundle(self.original, self.destination, self.key_path)
        target = self.destination / "part-001.dfenc"
        blob = bytearray(target.read_bytes())
        blob[-20] ^= 1
        target.write_bytes(blob)
        with self.assertRaisesRegex(ValueError, ERROR):
            verify_bundle(self.destination, self.key_path)

    def test_authenticated_manifest_rejects_tamper(self):
        create_bundle(self.original, self.destination, self.key_path)
        target = self.destination / "catalog.dfenc"
        blob = bytearray(target.read_bytes())
        blob[-1] ^= 1
        target.write_bytes(blob)
        with self.assertRaisesRegex(ValueError, ERROR):
            verify_bundle(self.destination, self.key_path)

    def test_wrong_key_fails_closed(self):
        create_bundle(self.original, self.destination, self.key_path)
        wrong = self.key_dir / "wrong.bin"
        wrong.write_bytes(os.urandom(32))
        with self.assertRaisesRegex(ValueError, ERROR):
            verify_bundle(self.destination, wrong)

    def test_refuse_overwriting_private_key_or_destination(self):
        self.key_path.write_bytes(os.urandom(32))
        with self.assertRaisesRegex(ValueError, ERROR):
            create_bundle(self.original, self.destination, self.key_path)
        self.key_path.unlink()
        self.destination.mkdir()
        with self.assertRaisesRegex(ValueError, ERROR):
            create_bundle(self.original, self.destination, self.key_path)

    def test_refuse_nested_destination_and_key_inside_downloads(self):
        with self.assertRaisesRegex(ValueError, ERROR):
            create_bundle(self.original, self.original / "encrypted", self.key_path)
        with self.assertRaisesRegex(ValueError, ERROR):
            create_bundle(self.original, self.destination, self.original / "secret.bin")

    def test_refuse_symlink_and_nested_unenumerated_files(self):
        nested = self.original / "unexamined-folder"
        nested.mkdir()
        with self.assertRaisesRegex(ValueError, ERROR):
            create_bundle(self.original, self.destination, self.key_path)
        nested.rmdir()
        if hasattr(os, "symlink"):
            try:
                os.symlink(self.original / self.fake_name, self.original / "shortcut.zip")
            except (OSError, NotImplementedError):
                self.skipTest("symlinks not available")
            with self.assertRaisesRegex(ValueError, ERROR):
                create_bundle(self.original, self.destination, self.key_path)

    def test_no_unexpected_additional_ciphertext_parts(self):
        create_bundle(self.original, self.destination, self.key_path)
        (self.destination / "unexpected-file").write_bytes(b"extra")
        with self.assertRaisesRegex(ValueError, ERROR):
            verify_bundle(self.destination, self.key_path)


if __name__ == "__main__":
    unittest.main()
