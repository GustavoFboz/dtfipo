import importlib.util
import json
import os
import tempfile
import unittest
import zipfile
from hashlib import sha256
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

SCRIPT=Path(__file__).resolve().parents[2]/"scripts/recovery/verify-zip-payloads.py"
spec=importlib.util.spec_from_file_location("verify_zip_payloads",SCRIPT)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def seal(key,name,raw):
    iv=os.urandom(12)
    return b"DFREC001"+iv+AESGCM(key).encrypt(iv,raw,("dentalflow-recovery-v1:"+name).encode())

class OfflineObjectVerification(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix="df-recovery-fake-")
        self.root=Path(self.tmp.name)
        self.vault=self.root/"volumes";self.vault.mkdir()
        self.key=os.urandom(32)
        self.keyfile=self.root/"key.bin";self.keyfile.write_bytes(self.key)
        self.keyfile.chmod(0o600)
        self.indexfile=self.root/"index.dfenc"
        payload=b"fictitious case attachment bytes"
        name="synthetic/control-01.bin"
        self.saved={"bucket_id":"fake-files","name":name,
          "source_version":"v-1","bytes":len(payload),"sha256":sha256(payload).hexdigest(),
          "encrypted_file":sha256(name.encode()).hexdigest()+".dfenc"}
        partrows=[
          [self.saved],
          [],
        ]
        parts=[]
        for number,rows in enumerate(partrows,start=1):
            path=self.vault/("DentalFlow_Anexos_2026-10-29_Parte_"+str(number).zfill(2)+".zip")
            meta={"version":1,"backup_id":"offline-fake","part_number":number,
              "authenticated_name":"fixture-part-"+str(number)}
            if number==1:meta["files"]=1
            manifest={"version":1,"backup_id":"offline-fake","part_number":number,
              "files":rows}
            with zipfile.ZipFile(path,"w",compression=zipfile.ZIP_DEFLATED) as z:
                z.writestr("part.json",json.dumps(meta))
                z.writestr("manifest.dfenc",seal(self.key,meta["authenticated_name"],
                    json.dumps(manifest).encode()))
                for row in rows:
                    z.writestr("files/"+row["encrypted_file"],seal(self.key,
                      "storage:"+row["bucket_id"]+"/"+row["name"],payload))
            archive=path.read_bytes()
            parts.append({"part":number,"files":len(rows),"bytes":len(archive),
              "sha256":sha256(archive).hexdigest()})
        self.index={"version":1,"source_objects":2,"files_verified":1,
          "bytes_verified":len(payload),"parts":parts,"files":[self.saved],
          "source_catalog":[
            {"bucket_id":"fake-files","name":name,"version":"v-1","metadata":{"size":len(payload)}},
            {"bucket_id":"fake-files","name":"synthetic/missing-02.bin","version":"v-1",
             "metadata":{"size":42}},
          ]}
        self.save_index()

    def save_index(self):
        self.indexfile.write_bytes(seal(self.key,"dentalflow-storage-index-20261029",
            json.dumps(self.index).encode()))

    def tearDown(self):
        self.tmp.cleanup()

    def test_only_archived_objects_verified_without_plaintext_files(self):
        summary=mod.verify_archived_subset(self.indexfile,self.keyfile,self.vault)
        self.assertEqual(summary["zip_manifests_verified"],2)
        self.assertEqual(summary["archived_objects_verified"],1)
        self.assertEqual(summary["historical_objects_missing"],1)
        self.assertEqual(summary["verified_decrypted_bytes_without_plaintext_files"],
                         len(b"fictitious case attachment bytes"))
        self.assertFalse(summary["historical_copy_complete"])
        self.assertFalse(summary["operational_acceptance"])
        self.assertEqual(len(list(self.vault.glob("*.bin"))),0)

    def test_rejects_checksum_mismatch_in_decrypted_object(self):
        self.index["files"][0]["sha256"]="0"*64
        self.save_index()
        with self.assertRaisesRegex(mod.VerificationError,"RECOVERY_DECRYPTED_OBJECT_MISMATCH"):
            mod.verify_archived_subset(self.indexfile,self.keyfile,self.vault)

    def test_rejects_changed_zip_even_when_metadata_claims_success(self):
        path=self.vault/"DentalFlow_Anexos_2026-10-29_Parte_02.zip"
        with path.open("ab") as f:f.write(b"malformed-suffix")
        with self.assertRaisesRegex(mod.VerificationError,"RECOVERY_ZIP_SIZE_INVALID"):
            mod.verify_archived_subset(self.indexfile,self.keyfile,self.vault)

    def test_rejects_unsafe_key_permissions(self):
        self.keyfile.chmod(0o644)
        with self.assertRaisesRegex(mod.VerificationError,"RECOVERY_KEY_PERMISSIONS"):
            mod.verify_archived_subset(self.indexfile,self.keyfile,self.vault)

if __name__=="__main__":
    unittest.main()
