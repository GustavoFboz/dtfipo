"""Artificial-only ZIP/GCM fixtures. No real archive or clinical material."""
import hashlib
import json
import os
import stat
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Filename with '-' is intentionally maintained for compatibility.
import importlib.util
spec=importlib.util.spec_from_file_location("verify_zip_payloads",Path(__file__).parent/"verify-zip-payloads.py")
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

AAD=b"dentalflow-recovery-v1:"
def seal(data,key,name):
    nonce=os.urandom(12)
    return b"DFREC001"+nonce+AESGCM(key).encrypt(nonce,data,AAD+name.encode())

class HistoricVolumesTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base=Path(self.tmp.name)
        self.folder=self.base/"zips"
        self.folder.mkdir()
        self.key=self.base/"historic-key.bin"
        self.secret=os.urandom(32)
        self.key.write_bytes(self.secret)
        if os.name!="nt":
            self.key.chmod(stat.S_IRUSR|stat.S_IWUSR)
        self.index=self.base/"index.dfenc"
        self.payloads=[b"fake-odontology-file-one"*11,b"artificial-file-two"*13]
        source=[]
        receipts=[]
        parts=[]
        for n,body in enumerate(self.payloads,1):
            name=f"fake_folder/attachment_{n}.dat"
            record={"bucket_id":"case-files","name":name,"source_version":"fake-version"}
            digest=hashlib.sha256(body).hexdigest()
            receipt={**record,"bytes":len(body),"sha256":digest}
            receipts.append(receipt)
            source.append({"bucket_id":"case-files","name":name,"version":"fake-version","metadata":{"size":len(body)}})
            file_id=hashlib.sha256(f"fake-opaque-{n}".encode()).hexdigest()+".dfenc"
            payload=seal(body,self.secret,"storage:case-files/"+name)
            part_meta={"part_number":n,"backup_id":"fake-backup","authenticated_name":f"synthetic-part-{n}"}
            manifest={"backup_id":"fake-backup","part_number":n,"files":[{**receipt,"encrypted_file":file_id}]}
            archive=self.folder/f"DentalFlow_Anexos_2026-10-29_Parte_{n:02d}.zip"
            with zipfile.ZipFile(archive,"w",allowZip64=True,compression=zipfile.ZIP_DEFLATED) as z:
                z.writestr("part.json",json.dumps(part_meta))
                z.writestr("manifest.dfenc",seal(json.dumps(manifest).encode(),self.secret,part_meta["authenticated_name"]))
                z.writestr("files/"+file_id,payload)
            stream=archive.read_bytes()
            parts.append({"part":n,"bytes":len(stream),"sha256":hashlib.sha256(stream).hexdigest(),"files":1})
        source.append({"bucket_id":"case-files","name":"fake_folder/unrecovered.dat","version":"fake-version","metadata":{"size":9}})
        index={"version":1,"source_objects":3,"files_verified":2,"source_catalog":source,
            "files":receipts,"parts":parts,"bytes_verified":sum(map(len,self.payloads))}
        self.index.write_bytes(seal(json.dumps(index).encode(),self.secret,mod.INDEX_NAME))

    def test_two_encrypted_zip_volumes_restore_bytes_without_plaintext_files(self):
        updates=[]
        out=mod.verify_archived_subset(self.index,self.key,self.folder,lambda a,b:updates.append((a,b)))
        self.assertEqual(out["archived_objects_verified"],2)
        self.assertEqual(out["zip_manifests_verified"],2)
        self.assertEqual(out["historical_objects_missing"],1)
        self.assertEqual(out["verified_decrypted_bytes_without_plaintext_files"],sum(map(len,self.payloads)))
        self.assertFalse(out["operational_acceptance"])
        self.assertFalse(out["historical_copy_complete"])
        self.assertEqual(updates,[(1,2),(2,2)])
        self.assertEqual(len(list(self.folder.iterdir())),2)

    def test_different_key_and_tampered_zip_are_rejected(self):
        wrong=self.base/"wrong.bin"
        wrong.write_bytes(os.urandom(32))
        if os.name!="nt":
            wrong.chmod(stat.S_IRUSR|stat.S_IWUSR)
        with self.assertRaises(Exception):
            mod.verify_archived_subset(self.index,wrong,self.folder)
        zipfile_path=self.folder/"DentalFlow_Anexos_2026-10-29_Parte_02.zip"
        content=bytearray(zipfile_path.read_bytes())
        content[40]^=0x08
        zipfile_path.write_bytes(content)
        with self.assertRaises(Exception):
            mod.verify_archived_subset(self.index,self.key,self.folder)

    def test_missing_volume_is_not_conflated_with_116_other_objects(self):
        (self.folder/"DentalFlow_Anexos_2026-10-29_Parte_01.zip").unlink()
        with self.assertRaises(Exception):
            mod.verify_archived_subset(self.index,self.key,self.folder)

if __name__=="__main__":
    unittest.main()
