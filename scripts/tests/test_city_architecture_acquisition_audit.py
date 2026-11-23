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


def glb(document, binary=None):
    payload = json.dumps(document, separators=(",", ":")).encode()
    payload += b" " * ((4 - len(payload) % 4) % 4)
    chunks = struct.pack("<II", len(payload), 0x4E4F534A) + payload
    if binary is not None:
        binary += b"\x00" * ((4 - len(binary) % 4) % 4)
        chunks += struct.pack("<II", len(binary), 0x004E4942) + binary
    return b"glTF" + struct.pack("<II", 2, 12 + len(chunks)) + chunks


class CityArchitectureAcquisitionAuditTests(unittest.TestCase):
    def test_reports_embedded_images_and_mesh_material_counts(self):
        data = glb({
            "asset": {"version": "2.0"},
            "buffers": [{"byteLength": 36}],
            "bufferViews": [{"buffer": 0, "byteLength": 36}],
            "accessors": [{"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3"}],
            "meshes": [
                {"primitives": [{"attributes": {"POSITION": 0}, "material": 0}]},
                {"primitives": [{"attributes": {"POSITION": 0}}]},
            ],
            "materials": [{}],
            "images": [{"bufferView": 0, "mimeType": "image/png"}, {"uri": "https://example.invalid/a.png"}],
        }, binary=bytes(36))
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "model.glb"
            path.write_bytes(data)
            result = audit.inspect_glb(path, hashlib.sha256(data).hexdigest())
        self.assertEqual(result["mesh_count"], 2)
        self.assertEqual(result["material_count"], 1)
        self.assertEqual(result["image_count"], 2)
        self.assertEqual(result["embedded_image_count"], 1)
        self.assertEqual(result["external_image_count"], 1)


    def test_reports_primitive_and_referenced_material_counts(self):
        data = glb({
            "asset": {"version": "2.0"},
            "buffers": [{"byteLength": 36}],
            "bufferViews": [{"buffer": 0, "byteLength": 36}],
            "accessors": [{"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3"}],
            "meshes": [{"primitives": [
                {"attributes": {"POSITION": 0}, "material": 0},
                {"attributes": {"POSITION": 0}},
            ]}],
            "materials": [{}],
        }, binary=bytes(36))
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "building.glb"
            path.write_bytes(data)
            result = audit.inspect_glb(path)
        self.assertEqual(result["primitive_count"], 2)
        self.assertEqual(result["referenced_material_count"], 1)

    def test_rejects_meshes_without_renderable_primitives(self):
        documents = (
            {"asset": {"version": "2.0"}, "meshes": [{"primitives": []}]},
            {"asset": {"version": "2.0"}, "meshes": [{"primitives": [{"attributes": {}}]}]},
            {"asset": {"version": "2.0"}, "meshes": [{"primitives": [{"attributes": {"POSITION": 2}}]}]},
            {"asset": {"version": "2.0"}, "accessors": [{}],
             "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "material": 3}]}]},
        )
        with tempfile.TemporaryDirectory() as directory:
            for index, document in enumerate(documents):
                with self.subTest(document=document):
                    path = pathlib.Path(directory) / f"invalid-mesh-{index}.glb"
                    path.write_bytes(glb(document))
                    with self.assertRaises(ValueError):
                        audit.inspect_glb(path)

    def test_rejects_buffer_view_out_of_bounds_and_missing_bin_chunk(self):
        valid_shape = {
            "asset": {"version": "2.0"},
            "buffers": [{"byteLength": 8}],
            "bufferViews": [{"buffer": 0, "byteLength": 8}],
        }
        invalid_bounds = {
            **valid_shape,
            "bufferViews": [{"buffer": 0, "byteOffset": 4, "byteLength": 8}],
        }
        with tempfile.TemporaryDirectory() as directory:
            for name, document, binary in (
                ("bounds", invalid_bounds, bytes(12)),
                ("missing-bin", valid_shape, None),
            ):
                with self.subTest(name=name):
                    path = pathlib.Path(directory) / f"{name}.glb"
                    path.write_bytes(glb(document, binary=binary))
                    with self.assertRaises(ValueError):
                        audit.inspect_glb(path)

    def test_rejects_invalid_scene_graph_and_buffer_references(self):
        documents = (
            {"asset": {"version": "2.0"}, "nodes": [{"mesh": 0}]},
            {"asset": {"version": "2.0"}, "nodes": [{"children": [2]}]},
            {"asset": {"version": "2.0"}, "scenes": [{"nodes": [1]}]},
            {"asset": {"version": "2.0"}, "buffers": [{}],
             "bufferViews": [{"buffer": 1, "byteLength": 4}]},
            {"asset": {"version": "2.0"}, "images": [{}],
             "textures": [{"source": 1}]},
        )
        with tempfile.TemporaryDirectory() as directory:
            for index, document in enumerate(documents):
                with self.subTest(document=document):
                    path = pathlib.Path(directory) / f"invalid-scene-{index}.glb"
                    path.write_bytes(glb(document))
                    with self.assertRaises(ValueError):
                        audit.inspect_glb(path)

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


    def test_rejects_symlink_escape_and_blank_manifest_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "assets"
            root.mkdir()
            outside = pathlib.Path(directory) / "outside.glb"
            outside.write_bytes(b"not an asset")
            link = root / "linked-model.glb"
            link.symlink_to(outside)
            with self.assertRaisesRegex(ValueError, "escapes its acquisition root"):
                audit.safe_artifact_path(root, "linked-model.glb")
            for invalid in ("", "   ", None, 42):
                with self.subTest(invalid=invalid):
                    with self.assertRaisesRegex(ValueError, "non-empty relative string"):
                        audit.safe_artifact_path(root, invalid)


    def test_rejects_malformed_asset_metadata_and_collection_shapes(self):
        malformed_documents = (
            {"asset": None},
            {"asset": []},
            {"asset": {"version": "1.0"}},
            {"asset": {"version": "2.0"}, "images": {}},
            {"asset": {"version": "2.0"}, "meshes": {}},
            {"asset": {"version": "2.0"}, "materials": "not-an-array"},
        )
        with tempfile.TemporaryDirectory() as directory:
            for index, document in enumerate(malformed_documents):
                with self.subTest(document=document):
                    path = pathlib.Path(directory) / f"malformed-{index}.glb"
                    path.write_bytes(glb(document))
                    with self.assertRaises(ValueError):
                        audit.inspect_glb(path)

    def test_rejects_malformed_image_entries_and_buffer_views(self):
        malformed_images = (
            [None],
            [{"bufferView": -1}],
            [{"bufferView": True}],
            [{"uri": 17}],
        )
        with tempfile.TemporaryDirectory() as directory:
            for index, images in enumerate(malformed_images):
                with self.subTest(images=images):
                    path = pathlib.Path(directory) / f"image-{index}.glb"
                    path.write_bytes(glb({"asset": {"version": "2.0"}, "images": images}))
                    with self.assertRaises(ValueError):
                        audit.inspect_glb(path)

    def test_rejects_invalid_image_buffer_view_and_texture_sampler(self):
        documents = (
            {"asset": {"version": "2.0"}, "images": [{"bufferView": 0, "mimeType": "image/png"}]},
            {"asset": {"version": "2.0"}, "buffers": [{"byteLength": 4}],
             "bufferViews": [{"buffer": 0, "byteLength": 4}],
             "images": [{"bufferView": 0}]},
            {"asset": {"version": "2.0"}, "textures": [{"sampler": 0}]},
        )
        with tempfile.TemporaryDirectory() as directory:
            for index, document in enumerate(documents):
                with self.subTest(document=document):
                    path = pathlib.Path(directory) / f"invalid-image-reference-{index}.glb"
                    path.write_bytes(glb(document, binary=bytes(4)))
                    with self.assertRaises(ValueError):
                        audit.inspect_glb(path)

    def test_rejects_invalid_buffer_view_stride_target_and_accessor_alignment(self):
        documents = (
            {"asset": {"version": "2.0"}, "buffers": [{"byteLength": 8}],
             "bufferViews": [{"buffer": 0, "byteLength": 8, "byteStride": 2}]},
            {"asset": {"version": "2.0"}, "buffers": [{"byteLength": 8}],
             "bufferViews": [{"buffer": 0, "byteLength": 8, "target": 1}]},
            {"asset": {"version": "2.0"}, "buffers": [{"byteLength": 8}],
             "bufferViews": [{"buffer": 0, "byteLength": 8}],
             "accessors": [{"bufferView": 0, "byteOffset": 1, "componentType": 5123,
                            "count": 1, "type": "SCALAR"}]},
        )
        with tempfile.TemporaryDirectory() as directory:
            for index, document in enumerate(documents):
                with self.subTest(document=document):
                    path = pathlib.Path(directory) / f"invalid-layout-{index}.glb"
                    path.write_bytes(glb(document, binary=bytes(8)))
                    with self.assertRaises(ValueError):
                        audit.inspect_glb(path)

    def test_rejects_invalid_primitive_topology_and_index_accessor(self):
        base = {
            "asset": {"version": "2.0"},
            "accessors": [
                {"componentType": 5126, "count": 3, "type": "VEC3"},
                {"componentType": 5126, "count": 3, "type": "VEC3"},
            ],
            "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
        }
        invalid_mode = {
            **base,
            "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "mode": 9}]}],
        }
        invalid_indices = {
            **base,
            "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}],
        }
        with tempfile.TemporaryDirectory() as directory:
            for name, document in (("mode", invalid_mode), ("indices", invalid_indices)):
                with self.subTest(name=name):
                    path = pathlib.Path(directory) / f"invalid-primitive-{name}.glb"
                    path.write_bytes(glb(document))
                    with self.assertRaises(ValueError):
                        audit.inspect_glb(path)

    def test_rejects_invalid_sampler_definitions(self):
        invalid = (
            {"minFilter": 1},
            {"magFilter": 9987},
            {"wrapS": 0},
            None,
        )
        with tempfile.TemporaryDirectory() as directory:
            for index, sampler in enumerate(invalid):
                with self.subTest(sampler=sampler):
                    path = pathlib.Path(directory) / f"invalid-sampler-{index}.glb"
                    path.write_bytes(glb({
                        "asset": {"version": "2.0"},
                        "samplers": [sampler],
                    }))
                    with self.assertRaises(ValueError):
                        audit.inspect_glb(path)

    def test_rejects_non_json_first_chunk(self):
        data = b"glTF" + struct.pack("<II", 2, 24) + struct.pack("<II", 4, 0) + bytes(4)
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "wrong-first-chunk.glb"
            path.write_bytes(data)
            with self.assertRaisesRegex(ValueError, "first GLB chunk must be JSON"):
                audit.inspect_glb(path)

    def test_rejects_unaligned_chunk_length(self):
        payload = b'{"asset":{"version":"2.0"}}'
        data = b"glTF" + struct.pack("<II", 2, 20 + len(payload))
        data += struct.pack("<II", len(payload), 0x4E4F534A) + payload
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "unaligned.glb"
            path.write_bytes(data)
            with self.assertRaisesRegex(ValueError, "4-byte aligned"):
                audit.inspect_glb(path)

    def test_rejects_more_than_two_chunks(self):
        data = glb({"asset": {"version": "2.0"}})
        extra = struct.pack("<II", 4, 0x004E4942) + bytes(4)
        third = struct.pack("<II", 4, 0x004E4942) + bytes(4)
        data = data + extra + third
        data = data[:8] + struct.pack("<I", len(data)) + data[12:]
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "extra-chunks.glb"
            path.write_bytes(data)
            with self.assertRaisesRegex(ValueError, "more than two chunks"):
                audit.inspect_glb(path)

    def test_rejects_oversized_file_before_reading_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "oversized.glb"
            with path.open("wb") as stream:
                stream.truncate(audit.MAX_BYTES + 1)
            with self.assertRaisesRegex(ValueError, "invalid GLB header or size"):
                audit.inspect_glb(path)

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
            with self.assertRaisesRegex(ValueError, "positive and 4-byte aligned"):
                audit.inspect_glb(path)


if __name__ == "__main__":
    unittest.main()
