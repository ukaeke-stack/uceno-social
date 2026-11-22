import hashlib
import importlib.util
import json
import pathlib
import struct
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "uceno_city_architecture_audit",
    ROOT / "scripts" / "audit-city-architecture-acquisition.py",
)
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


def glb(document):
    payload = json.dumps(document, separators=(",", ":")).encode()
    payload += b" " * ((4 - len(payload) % 4) % 4)
    return (
        b"glTF" + struct.pack("<II", 2, 20 + len(payload))
        + struct.pack("<II", len(payload), 0x4E4F534A) + payload
    )


class CityArchitectureAcquisitionAuditTests(unittest.TestCase):
    def test_reports_embedded_images_and_mesh_material_counts(self):
        data = glb({
            "asset": {"version": "2.0"},
            "meshes": [{}, {}],
            "materials": [{}],
            "images": [{"bufferView": 0}, {"uri": "https://example.invalid/a.png"}],
        })
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "model.glb"
            path.write_bytes(data)
            result = audit.inspect_glb(path, hashlib.sha256(data).hexdigest())
        self.assertEqual(result["mesh_count"], 2)
        self.assertEqual(result["material_count"], 1)
        self.assertEqual(result["image_count"], 2)
        self.assertEqual(result["embedded_image_count"], 1)
        self.assertEqual(result["external_image_count"], 1)

    def test_manifest_asset_paths_cannot_escape_acquisition_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "assets"
            root.mkdir()
            outside = pathlib.Path(directory) / "outside.glb"
            outside.write_bytes(b"not an asset")
            with self.assertRaisesRegex(ValueError, "escapes its acquisition root"):
                audit.safe_artifact_path(root, "../outside.glb")
            with self.assertRaisesRegex(ValueError, "Absolute manifest asset path"):
                audit.safe_artifact_path(root, str(outside))
            self.assertEqual(audit.safe_artifact_path(root, "city/model.glb"), root / "city" / "model.glb")

    def test_rejects_checksum_mismatch(self):
        data = glb({"asset": {"version": "2.0"}})
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "model.glb"
            path.write_bytes(data)
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                audit.inspect_glb(path, "0" * 64)

    def test_rejects_truncated_or_wrong_version_glb(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "broken.glb"
            path.write_bytes(b"glTF" + b"\\x00" * 12)
            with self.assertRaises(ValueError):
                audit.inspect_glb(path)

    def test_rejects_missing_json_chunk(self):
        data = b"glTF" + struct.pack("<II", 2, 20) + struct.pack("<II", 0, 0)
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "empty.glb"
            path.write_bytes(data)
            with self.assertRaisesRegex(ValueError, "missing JSON"):
                audit.inspect_glb(path)


if __name__ == "__main__":
    unittest.main()
