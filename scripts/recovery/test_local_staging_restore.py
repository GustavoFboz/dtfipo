"""All fixtures artificial. No owner's backup, key, or clinical data in CI."""
from __future__ import annotations
import json
import os
import sys
import tempfile
from types import SimpleNamespace
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from private_offsite_bundle import create_bundle
from local_staging_restore import (
    ERROR, FORMAT_ERROR, _unwrap_export, read_database_export,
    restore_database_locally, classify_restore_failure, inspect_required_extensions,
)

class StageLocalRestoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = self.root / "fake-source"
        self.dest = self.root / "encrypted"
        self.keys = self.root / "separated-private-key"
        self.data.mkdir()
        self.keys.mkdir()
        self.key = self.keys / "new-secret.bin"
        self.fake_dump = b"""-- PostgreSQL fake test data only
CREATE SCHEMA IF NOT EXISTS public;
CREATE TABLE public.patients (id int PRIMARY KEY);
CREATE TABLE public.cases (id int PRIMARY KEY);
CREATE TABLE public.clinic_appointments (id int PRIMARY KEY);
CREATE TABLE public.storage_files (id int PRIMARY KEY);
INSERT INTO public.patients VALUES (1);
INSERT INTO public.cases VALUES (2);
INSERT INTO public.clinic_appointments VALUES (3);
INSERT INTO public.storage_files VALUES (4);
"""

    def _make(self, value=None):
        (self.data / "SYNTHETIC_FAKE_TEST.sql").write_bytes(self.fake_dump if value is None else value)
        create_bundle(self.data, self.dest, self.key)

    def test_authenticated_private_dump_never_claims_integrated_restore(self):
        self._make()
        content, kind = read_database_export(self.dest, self.key)
        self.assertEqual(kind,"sql")
        self.assertEqual(content, self.fake_dump)
        self.assertNotIn(self.fake_dump[:25], (self.dest / "part-001.dfenc").read_bytes())

    def test_zip_with_single_fake_sql_and_custom_archive_magic(self):
        self.assertEqual(_unwrap_export(b"PGDMP"+"not-real-content".encode())[1], "pg_custom")
        z = self.root / "fake.zip"
        with zipfile.ZipFile(z,"w") as archive:
            archive.writestr("arbitrary/synthetic.sql", self.fake_dump)
        data, kind = _unwrap_export(z.read_bytes())
        self.assertEqual(data, self.fake_dump)
        self.assertEqual(kind,"sql")

    def test_multi_member_zip_and_unknown_content_rejected(self):
        z = self.root / "fake.zip"
        with zipfile.ZipFile(z,"w") as archive:
            archive.writestr("one.sql", self.fake_dump)
            archive.writestr("two.sql", self.fake_dump)
        with self.assertRaisesRegex(ValueError,FORMAT_ERROR):
            _unwrap_export(z.read_bytes())
        with self.assertRaisesRegex(ValueError,FORMAT_ERROR):
            _unwrap_export(b"random non PostgreSQL data")

    def test_wrong_key_and_tamper_fail_closed(self):
        self._make()
        wrong = self.keys / "different.bin"
        wrong.write_bytes(os.urandom(32))
        with self.assertRaises(ValueError):
            read_database_export(self.dest,wrong)
        ciphertext=self.dest/"part-001.dfenc"
        b=bytearray(ciphertext.read_bytes()); b[-17]^=0x80
        ciphertext.write_bytes(b)
        with self.assertRaises(ValueError):
            read_database_export(self.dest,self.key)

    def test_disallow_unrelated_extra_files_and_large_payload(self):
        self._make()
        (self.dest/"unexpected.txt").write_text("synthetic")
        with self.assertRaises(ValueError):
            read_database_export(self.dest,self.key)

    def test_no_docker_means_no_restore_or_network(self):
        self._make()
        with patch("local_staging_restore.shutil.which",return_value=None):
            with self.assertRaisesRegex(ValueError,"DF_DOCKER_DESKTOP_NOT_INSTALLED"):
                restore_database_locally(self.dest,self.key)


    def test_sanitized_restore_categories_do_not_leak_private_sql_or_names(self):
        fixtures = [
            (b'pg_restore: ERROR: extension "private_x" is not available', "DF_RESTORE_REQUIRES_PLATFORM_EXTENSION"),
            (b'pg_restore: ERROR: role "some-real-owner" does not exist', "DF_RESTORE_REQUIRES_SUPABASE_ROLES"),
            (b'pg_restore: ERROR: schema "real_private_schema" does not exist', "DF_RESTORE_REQUIRES_PLATFORM_SCHEMAS"),
            (b'pg_restore: ERROR: function "private_fn" does not exist', "DF_RESTORE_REQUIRES_PLATFORM_FUNCTION"),
            (b'pg_restore: ERROR: unrecognized configuration parameter "request.jwt.claims"', "DF_RESTORE_REQUIRES_SUPABASE_SETTINGS"),
            (b'pg_restore: ERROR: relation "private_case" already exists', "DF_RESTORE_OBJECT_CONFLICT"),
            (b'pg_restore: error: unsupported version (1.99) in file header', "DF_RESTORE_UNSUPPORTED_ARCHIVE_VERSION"),
            (b'pg_restore: ERROR: some private patient name and secret data', "DF_RESTORE_SQL_UNCLASSIFIED"),
        ]
        for payload, expected in fixtures:
            with self.subTest(expected=expected):
                category = classify_restore_failure(payload)
                self.assertEqual(category, expected)
                self.assertNotIn("private", category.lower())
                self.assertNotIn("real", category.lower())
                self.assertNotIn("secret", category.lower())


    def test_safe_toc_extension_scan_prints_no_clinical_identifiers(self):
        self._make(b"PGDMP" + b"synthetic only")
        archive_listing = (b'; Archive created with pg_dump\\n'
            b'12; 3079 16380 EXTENSION - pgcrypto \\n'
            b'13; 3079 16381 EXTENSION - uuid-ossp \\n'
            b'14; 1259 16383 TABLE public sensitive_fake_patient_name postgres\\n'
            b'15; 0 0 COMMENT - EXTENSION pgcrypto \\n')
        calls = []
        def fake_docker(args, *, data=None, timeout=120):
            calls.append((args, data))
            if args[0] == "info":
                return SimpleNamespace(returncode=0, stdout=b"29", stderr=b"")
            return SimpleNamespace(returncode=0, stdout=archive_listing, stderr=b"")
        with patch("local_staging_restore.shutil.which",return_value="docker.exe"), \\
             patch("local_staging_restore._docker",side_effect=fake_docker):
            result = inspect_required_extensions(self.dest,self.key)
        self.assertEqual(result["required_extensions"],["pgcrypto","uuid-ossp"])
        self.assertFalse(result["sql_executed"])
        self.assertFalse(result["restore_success_verified"])
        self.assertFalse(result["beta_release_authorized"])
        self.assertNotIn("sensitive_fake_patient_name",str(result))
        self.assertIn("--network", calls[1][0])
        self.assertIn("none", calls[1][0])
        self.assertIn("--list", calls[1][0])
        self.assertEqual(calls[1][1],b"PGDMPsynthetic only")

    def test_toc_scan_fails_closed_on_docker_failure(self):
        self._make(b"PGDMP" + b"synthetic only")
        with patch("local_staging_restore.shutil.which",return_value="docker.exe"), \\
             patch("local_staging_restore._docker",return_value=SimpleNamespace(returncode=2,stdout=b"",stderr=b"private info")):
            with self.assertRaisesRegex(ValueError,"DF_DOCKER_DESKTOP_NOT_RUNNING"):
                inspect_required_extensions(self.dest,self.key)

    def test_never_copies_credentials_to_a_public_artifact(self):
        self._make()
        self.assertFalse((self.dest/"new-secret.bin").exists())
        self.assertEqual((self.dest/"catalog.dfenc").read_bytes()[:8],b"DFZIP002")
        self.assertEqual(set(p.name for p in self.dest.iterdir()),
                         {"catalog.dfenc","part-001.dfenc"})

if __name__=="__main__":
    unittest.main()
