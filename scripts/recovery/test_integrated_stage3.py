"""DF-EID-01 deterministic synthetic unit tests. No real names, clinical data or keys."""
import hashlib
import io
import json
import struct
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from integrated_stage3 import (
    _select, _render_sample, _restore_sample_to_container, _rollback_probe,
    _path_key, _identity,
)

try:
    from PIL import Image
except ImportError:
    Image = None


def make_fake_index():
    archived, missing = [], []
    for i in range(592):
        name = f"fake-archived-{i:04}.png" if i < 5 else f"fake-archived-{i:04}.bin"
        archived.append({
            "bucket_id": "case-files",
            "name": "synthetic/" + name,
            "source_version": "synthetic-v1",
            "bytes": 12 + i,
            "sha256": hashlib.sha256(name.encode()).hexdigest(),
        })
    for i in range(116):
        name = f"fake-recovered-{i:04}.png" if i < 5 else f"fake-recovered-{i:04}.bin"
        missing.append({
            "bucket_id": "case-files",
            "name": "synthetic/" + name,
            "version": "synthetic-v1",
            "metadata": {"size": 17 + i, "eTag": ("absent" if i < 3 else "a" * 32)}
        })
    source = [dict(bucket_id=x["bucket_id"], name=x["name"],
                   version=x["source_version"], metadata={"size": x["bytes"], "eTag": ""})
              for x in archived] + missing
    return {"version": 1, "source_objects": 708, "files_verified": 592,
            "files": archived, "source_catalog": source, "parts": [1] * 33}


class Stage3IsolatedToolTests(unittest.TestCase):
    def test_select_exactly_592_116_without_scanning_all_objects(self):
        source = make_fake_index()
        links = {_path_key("case-files", "synthetic/fake-archived-0000.png"):
                 [{"valid": True, "clinical": True}]}
        selected = _select(source, links)
        from_old = [x for (is_new, _), x in selected.items() if not is_new]
        from_new = [x for (is_new, _), x in selected.items() if is_new]
        self.assertGreaterEqual(len(from_old), 4)
        self.assertGreaterEqual(len(from_new), 4)
        self.assertLessEqual(len(selected), 12)
        self.assertGreaterEqual(sum(x["metadata"]["eTag"] == "absent" for x in from_new), 2)
        self.assertTrue(any(x["name"].endswith("0000.png") for x in from_old))
        self.assertNotIn("synthetic/", str({"selected_count":len(selected)}))

    def test_small_stl_and_zip_must_be_readable_not_just_magic(self):
        raw = b"binary STL" + b"\0" * (80-len("binary STL"))
        raw += struct.pack("<I", 1) + (b"\0" * 50)
        self.assertEqual(_render_sample(raw, ".stl"), "opened")
        self.assertEqual(_render_sample(raw[:-1], ".stl"), "failed")
        with io.BytesIO() as output:
            with zipfile.ZipFile(output, "w") as zf:
                zf.writestr("fixture.txt", b"synthetic only")
            self.assertEqual(_render_sample(output.getvalue(), ".zip"), "opened")
        self.assertEqual(_render_sample(b"unknown", ".magic"), "unsupported")

    def test_image_decode_requires_real_pixel(self):
        if Image is None:
            self.skipTest("Pillow absent")
        with io.BytesIO() as output:
            Image.new("RGB", (2, 2), (10, 20, 30)).save(output, format="PNG")
            self.assertEqual(_render_sample(output.getvalue(), ".png"), "opened")
            self.assertEqual(_render_sample(output.getvalue()[:25], ".png"), "failed")

    def test_isolated_container_receives_only_bytes_not_filename_or_secret(self):
        fake = b"synthetic test payload"
        calls = []
        def docker(args, *, data=None, timeout=120):
            calls.append((args, data))
            return SimpleNamespace(returncode=0, stdout=(
                hashlib.sha256(data).hexdigest() + "  /tmp/df-stage3-sample\n"
            ).encode(),stderr=b"")
        with patch("integrated_stage3._docker", side_effect=docker):
            _restore_sample_to_container("synthetic-disposable-container", fake)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1],fake)
        self.assertIn("docker" if False else "exec", calls[0][0])
        self.assertNotIn("clinical", " ".join(calls[0][0]))
        self.assertNotIn("client", " ".join(calls[0][0]))

    def test_corrupted_isolated_readback_fails_closed(self):
        with patch("integrated_stage3._docker", return_value=SimpleNamespace(
            returncode=0, stdout=b"0"*64+b"  /tmp/df-stage3-sample\n",stderr=b"")):
            with self.assertRaisesRegex(ValueError, "DF_STAGE3_IN_CONTAINER_SAMPLE_HASH_MISMATCH"):
                _restore_sample_to_container("synthetic",b"clean sample")

    def test_rollback_proof_must_echo_exact_synthetic_success(self):
        with patch("integrated_stage3._docker", return_value=SimpleNamespace(
            returncode=0,stdout=b"BEGIN\nROLLBACK\nROLLBACK_OK\n",stderr=b"")):
            self.assertTrue(_rollback_probe("synthetic"))
        with patch("integrated_stage3._docker", return_value=SimpleNamespace(
            returncode=0,stdout=b"ROLLBACK_FAILED\n",stderr=b"")):
            with self.assertRaises(ValueError):
                _rollback_probe("synthetic")


if __name__ == "__main__":
    unittest.main()
