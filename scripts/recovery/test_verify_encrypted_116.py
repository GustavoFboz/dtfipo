"""Fake data only. No real backup, clinical names or private keys enter CI."""
from __future__ import annotations

import hashlib
import json
import os
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from private_offsite_bundle import create_bundle
from verify_encrypted_116 import AuthenticatedZipView, verify_encrypted_116


class EncryptedRecoveredStorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.old_key = self.root / "old.bin"
        self.old_key.write_bytes(os.urandom(32))
        self.index = self.root / "index.dfenc"
        self.downloads = self.root / "downloads"
        self.downloads.mkdir()
        self.new_key = self.root / "separate" / "offsite.bin"
        self.new_key.parent.mkdir()
        self.bundle = self.root / "encrypted"
        self.payloads = {
            "first.txt": b"synthetic first bytes" * 20,
            "second.html": b"synthetic second data" * 13,
            "direct.bin": b"synthetic direct file" * 8,
            "stored.pdf": b"synthetic file already saved",
        }
        def source(name, tag):
            val = self.payloads[name]
            return {"bucket_id":"case-files","name":f"fake-group/{name}",
                "version":"fixture-v1", "metadata":{"size":len(val),"eTag":tag}}
        objects = [
            source("first.txt", hashlib.md5(self.payloads["first.txt"]).hexdigest()),
            source("second.html", "not-a-digest"),
            source("direct.bin", hashlib.md5(self.payloads["direct.bin"]).hexdigest()),
            source("stored.pdf", "not-a-digest"),
        ]
        record = {"version":1,"source_objects":4,"files_verified":1,
                  "source_catalog":objects,"files":[
                  {"bucket_id":"case-files","name":"fake-group/stored.pdf",
                   "source_version":"fixture-v1"}]}
        nonce=os.urandom(12)
        encrypted=AESGCM(self.old_key.read_bytes()).encrypt(
            nonce,json.dumps(record).encode(),
            b"dentalflow-recovery-v1:dentalflow-storage-index-20261029"
        )
        self.index.write_bytes(b"DFREC001"+nonce+encrypted)
        # 13 batches + one direct (exactly 14 input files to match owner workflow).
        for i in range(13):
            with zipfile.ZipFile(self.downloads/f"batch-{i:02d}.zip","w",
                                 zipfile.ZIP_DEFLATED,allowZip64=True) as archive:
                if i==0:
                    archive.writestr("fake-group/first.txt",self.payloads["first.txt"])
                    archive.writestr("fake-group/second.html",self.payloads["second.html"])
                    archive.writestr("../../unrelated.txt",b"synthetic ignored content")
                elif i==1:
                    archive.writestr("first.txt",self.payloads["first.txt"])
                else:
                    archive.writestr(f"unrelated-{i}.txt",b"synthetic ignored content")
        (self.downloads/"direct.bin").write_bytes(self.payloads["direct.bin"])
        create_bundle(self.downloads,self.bundle,self.new_key)
        self.patch_old=patch.multiple("verify_panel_downloads",
            EXPECTED_SOURCE=4,EXPECTED_SAVED=1,EXPECTED_MISSING=3,
            EXPECTED_MISSING_BYTES=sum(len(self.payloads[x]) for x in ("first.txt","second.html","direct.bin")))
        self.patch_new=patch.multiple("verify_encrypted_116",
            EXPECTED_SOURCE=4,EXPECTED_SAVED=1,EXPECTED_MISSING=3)
        self.patch_old.start();self.patch_new.start()
        self.addCleanup(self.patch_old.stop);self.addCleanup(self.patch_new.stop)

    def call(self):
        return verify_encrypted_116(self.index,self.old_key,self.bundle,self.new_key)

    def test_verified_zip_bytes_never_extracted_and_no_clinical_paths(self):
        r=self.call()
        self.assertEqual(r["offsite_encrypted_parts_authenticated"],14)
        self.assertEqual(r["recovered_objects_readable_and_verified"],3)
        self.assertEqual(r["matching_historical_md5_etags"],2)
        self.assertEqual(r["without_historical_digest_for_comparison"],1)
        self.assertEqual(r["identical_duplicate_entries"],1)
        self.assertEqual(r["recovered_objects_missing"],0)
        self.assertFalse(r["real_postgresql_and_storage_joint_restore"])
        self.assertFalse(r["beta_release_authorized"])
        self.assertFalse(r["plaintext_documents_written"])
        self.assertNotIn("fake-group",json.dumps(r))
        self.assertFalse((self.root/"unrelated.txt").exists())

    def test_random_access_crypted_zip_without_writing_to_disk(self):
        from private_offsite_bundle import _manifest_read
        from private_offsite_bundle import _key
        k=_key(self.new_key)
        item=_manifest_read(self.bundle/"catalog.dfenc",k)["files"][0]
        with AuthenticatedZipView(self.bundle/item["encrypted"],k,"part-001",item) as view:
            for n in (0,1,4,13,16,31,64,101,200):
                view.seek(n)
                segment=view.read(17)
                self.assertEqual(len(segment),17)
                view.seek(n)
                self.assertEqual(view.read(17),segment)
            view.seek(-14,2)
            self.assertEqual(len(view.read()),14)

    def test_wrong_key_and_adulterated_part_fail_closed(self):
        wrong=self.root/"wrong.bin"
        wrong.write_bytes(os.urandom(32))
        with self.assertRaises(ValueError):
            verify_encrypted_116(self.index,self.old_key,self.bundle,wrong)
        part=self.bundle/"part-002.dfenc"
        altered=bytearray(part.read_bytes())
        altered[-18]^=0x40
        part.write_bytes(altered)
        with self.assertRaises(ValueError):
            self.call()

    def test_invalid_downloaded_zip_detected_even_when_offsite_authentic(self):
        # Build a wholly new authenticated offsite package around a bad ZIP:
        # GCM authenticity cannot prove the ZIP's logical contents are sound.
        bad=self.root/"bad-input"
        bad.mkdir()
        for f in self.downloads.iterdir():
            (bad/f.name).write_bytes(f.read_bytes())
        (bad/"batch-00.zip").write_bytes(b"not zip")
        dest=self.root/"bad-encrypted"
        keyfile=self.root/"separate"/"bad.bin"
        create_bundle(bad,dest,keyfile)
        with self.assertRaises(ValueError):
            verify_encrypted_116(self.index,self.old_key,dest,keyfile)


if __name__=="__main__":
    unittest.main()
