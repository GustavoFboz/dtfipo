"""Synthetic-only tests. Never load real clinical data in CI."""
import hashlib
import json
import os
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from verify_panel_downloads import check_panel_downloads


def row(name, value, etag=None):
    return {
        "bucket_id": "case-files",
        "name": name,
        "version": "fake-v1",
        "metadata": {"size": len(value), "eTag": etag},
    }


class OfflinePanelZipAuditTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.downloads = self.base / "downloads"
        self.downloads.mkdir()
        self.key = self.base / "key.bin"
        self.index = self.base / "index.dfenc"
        self.key.write_bytes(os.urandom(32))
        a, b, c, saved = b"alpha clinical fixture", b"beta fixture", b"gamma", b"saved"
        self.contents = [a, b, c]
        catalog = [
            row("folder-a/first.txt", a, hashlib.md5(a).hexdigest()),
            row("folder-b/second.html", b, "opaque-etag"),
            row("archive.zip", c, hashlib.md5(c).hexdigest()),
            row("folder-a/already-saved.bin", saved, "already-copied"),
        ]
        index = {
            "version": 1,
            "source_objects": 4,
            "files_verified": 1,
            "source_catalog": catalog,
            "files": [{
                "bucket_id": "case-files",
                "name": "folder-a/already-saved.bin",
                "source_version": "fake-v1",
            }],
        }
        nonce = os.urandom(12)
        blob = AESGCM(self.key.read_bytes()).encrypt(
            nonce, json.dumps(index).encode(),
            b"dentalflow-recovery-v1:dentalflow-storage-index-20261029"
        )
        self.index.write_bytes(b"DFREC001" + nonce + blob)
        self.scope = patch.multiple(
            "verify_panel_downloads",
            EXPECTED_SOURCE=4,
            EXPECTED_SAVED=1,
            EXPECTED_MISSING=3,
            EXPECTED_MISSING_BYTES=sum(map(len, self.contents))
        )
        self.scope.start()
        self.addCleanup(self.scope.stop)

    def _run(self):
        return check_panel_downloads(self.index, self.key, self.downloads)

    def test_empty_downloads_is_not_verified(self):
        output = self._run()
        self.assertEqual(output["matching_downloaded_objects"], 0)
        self.assertEqual(output["missing_after_local_check"], 3)
        self.assertFalse(output["operational_acceptance"])

    def test_zip_and_direct_object_are_scanned_without_extracting(self):
        with zipfile.ZipFile(self.downloads / "lovable-multiple.zip", "w") as z:
            z.writestr("some-prefix/folder-a/first.txt", self.contents[0])
            z.writestr("second.html", self.contents[1])
            z.writestr("../unrelated-secret.txt", b"fake private data")
        # A source object with a .zip extension is NOT assumed to be a ZIP
        (self.downloads / "archive.zip").write_bytes(self.contents[2])
        report = self._run()
        self.assertEqual(report["matching_downloaded_objects"], 3)
        self.assertEqual(report["etag_md5_matches"], 2)
        self.assertEqual(report["name_size_no_source_digest"], 1)
        self.assertEqual(report["missing_after_local_check"], 0)
        self.assertTrue(report["requires_integrated_database_restore"])
        self.assertFalse(report["operational_acceptance"])
        self.assertNotIn("first.txt", json.dumps(report))
        self.assertNotIn("second.html", json.dumps(report))
        self.assertFalse((self.base / "unrelated-secret.txt").exists())

    def test_wrong_md5_does_not_match_even_when_size_is_same(self):
        wrong = b"x" * len(self.contents[0])
        with zipfile.ZipFile(self.downloads / "test.zip", "w") as z:
            z.writestr("folder-a/first.txt", wrong)
        report = self._run()
        self.assertEqual(report["matching_downloaded_objects"], 0)
        self.assertGreater(report["mismatched_or_corrupt_entries"], 0)

    def test_tampered_checkpoint_fails_closed(self):
        index = bytearray(self.index.read_bytes())
        index[-2] ^= 0x1
        self.index.write_bytes(index)
        with self.assertRaisesRegex(ValueError, "DENTALFLOW_LOCAL_CHECK_FAILED"):
            self._run()

    def test_truncated_archive_is_detected_without_patient_paths(self):
        (self.downloads / "broken.zip").write_bytes(b"not a zip at all")
        report = self._run()
        self.assertEqual(report["invalid_archives"], 1)
        self.assertFalse(report["operational_acceptance"])

    def test_repeated_valid_file_does_not_inflate_count(self):
        for name in ["part-1.zip", "part-2.zip"]:
            with zipfile.ZipFile(self.downloads / name, "w") as z:
                z.writestr("first.txt", self.contents[0])
        report = self._run()
        self.assertEqual(report["matching_downloaded_objects"], 1)
        self.assertEqual(report["repeated_matching_entries"], 1)


if __name__ == "__main__":
    unittest.main()
