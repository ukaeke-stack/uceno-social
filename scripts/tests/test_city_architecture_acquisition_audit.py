import hashlib
import importlib.util
import json
import pathlib
import struct
import tempfile
import unittest
from unittest.mock import patch
import io

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

    def test_rejects_accessor_data_outside_buffer_view(self):
        documents = (
            {"asset": {"version": "2.0"}, "buffers": [{"byteLength": 12}],
             "bufferViews": [{"buffer": 0, "byteLength": 12}],
             "accessors": [{"bufferView": 0, "componentType": 5126,
                            "count": 2, "type": "VEC3"}]},
            {"asset": {"version": "2.0"}, "buffers": [{"byteLength": 24}],
             "bufferViews": [{"buffer": 0, "byteLength": 24, "byteStride": 16}],
             "accessors": [{"bufferView": 0, "componentType": 5126,
                            "count": 2, "type": "VEC3"}]},
        )
        with tempfile.TemporaryDirectory() as directory:
            for index, document in enumerate(documents):
                with self.subTest(index=index):
                    path = pathlib.Path(directory) / f"accessor-overflow-{index}.glb"
                    path.write_bytes(glb(document, binary=bytes(document["buffers"][0]["byteLength"])))
                    with self.assertRaisesRegex(ValueError, "accessor 0 data exceeds"):
                        audit.inspect_glb(path)

    def test_accepts_accessor_with_valid_interleaved_stride(self):
        document = {
            "asset": {"version": "2.0"}, "buffers": [{"byteLength": 28}],
            "bufferViews": [{"buffer": 0, "byteLength": 28, "byteStride": 16}],
            "accessors": [{"bufferView": 0, "componentType": 5126,
                           "count": 2, "type": "VEC3"}],
        }
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "interleaved.glb"
            path.write_bytes(glb(document, binary=bytes(28)))
            audit.inspect_glb(path)

    def test_rejects_accessor_without_buffer_view_or_sparse_data(self):
        document = {"asset": {"version": "2.0"},
                    "accessors": [{"componentType": 5126, "count": 3, "type": "VEC3"}]}
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "missing-data.glb"
            path.write_bytes(glb(document))
            with self.assertRaisesRegex(ValueError, "neither bufferView nor sparse"):
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

    def test_tevy_audit_records_invalid_model_and_continues(self):
        previous_root = audit.ROOT
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            audit.ROOT = root
            try:
                asset_root = root / "tevy-city-architecture"
                city_root = asset_root / "SolsticeBay"
                city_root.mkdir(parents=True)
                valid_data = glb({
                    "asset": {"version": "2.0"},
                    "buffers": [{"byteLength": 4}],
                    "bufferViews": [{"buffer": 0, "byteLength": 4}],
                }, binary=bytes(4))
                invalid_data = glb({
                    "asset": {"version": "2.0"},
                    "buffers": [{"byteLength": 4}, {"byteLength": 4}],
                    "bufferViews": [{"buffer": 0, "byteLength": 4}],
                }, binary=bytes(4))
                valid_lods = []
                for level in (0, 1, 2):
                    filename = f"valid-lod{level}.glb"
                    (city_root / filename).write_bytes(valid_data)
                    valid_lods.append({
                        "lod": level,
                        "file": f"SolsticeBay/{filename}",
                        "sha256": hashlib.sha256(valid_data).hexdigest(),
                        "bytes": len(valid_data),
                    })
                (city_root / "invalid-lod0.glb").write_bytes(invalid_data)
                invalid_lods = [{
                    "lod": 0,
                    "file": "SolsticeBay/invalid-lod0.glb",
                    "sha256": hashlib.sha256(invalid_data).hexdigest(),
                    "bytes": len(invalid_data),
                }]
                for level in (1, 2):
                    filename = f"invalid-lod{level}.glb"
                    (city_root / filename).write_bytes(valid_data)
                    invalid_lods.append({
                        "lod": level,
                        "file": f"SolsticeBay/{filename}",
                        "sha256": hashlib.sha256(valid_data).hexdigest(),
                        "bytes": len(valid_data),
                    })
                cities = {
                    city: {"selected_and_acquired": []}
                    for city in audit.CITIES
                }
                cities["SolsticeBay"]["selected_and_acquired"] = [
                    {"slug": "valid-building", "lods": valid_lods},
                    {"slug": "invalid-multi-buffer", "lods": invalid_lods},
                ]
                report = {
                    "errors": [],
                    "cities": {
                        city: {
                            "tevy_model_count": 0,
                            "tevy_textured_lod0_count": 0,
                            "tevy_lods": [],
                            "tevy_invalid_models": [],
                        } for city in audit.CITIES
                    },
                }
                audit.audit_tevy({"cities": cities}, report)
                result = report["cities"]["SolsticeBay"]
                self.assertEqual(result["tevy_model_count"], 2)
                self.assertEqual([x["slug"] for x in result["tevy_lods"]], ["valid-building"])
                self.assertEqual(len(result["tevy_invalid_models"]), 1)
                self.assertIn("meshopt", result["tevy_invalid_models"][0]["error"])
                self.assertEqual(len(report["errors"]), 1)
            finally:
                audit.ROOT = previous_root

    def test_3dassets_audit_records_invalid_model_and_continues(self):
        previous_root = audit.ROOT
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            audit.ROOT = root
            try:
                city_root = root / "city-architecture-models" / "SolsticeBay"
                city_root.mkdir(parents=True)
                valid_data = glb({"asset": {"version": "2.0"}})
                invalid_data = b"not-a-glb"
                (city_root / "valid.glb").write_bytes(valid_data)
                (city_root / "invalid.glb").write_bytes(invalid_data)
                cities = {city: [] for city in audit.CITIES}
                cities["SolsticeBay"] = [
                    {
                        "slug": "valid-building",
                        "file": "SolsticeBay/valid.glb",
                        "sha256": hashlib.sha256(valid_data).hexdigest(),
                        "bytes": len(valid_data),
                    },
                    {
                        "slug": "invalid-binary",
                        "file": "SolsticeBay/invalid.glb",
                        "sha256": hashlib.sha256(invalid_data).hexdigest(),
                        "bytes": len(invalid_data),
                    },
                ]
                report = {
                    "errors": [],
                    "cities": {
                        city: {
                            "3dassets_model_count": 0,
                            "3dassets_textured_count": 0,
                            "3dassets_models": [],
                            "3dassets_invalid_models": [],
                        } for city in audit.CITIES
                    },
                }
                audit.audit_3dassets({"cities": cities}, report)
                result = report["cities"]["SolsticeBay"]
                self.assertEqual(result["3dassets_model_count"], 2)
                self.assertEqual([x["slug"] for x in result["3dassets_models"]], ["valid-building"])
                self.assertEqual(len(result["3dassets_invalid_models"]), 1)
                self.assertIn("invalid GLB header", result["3dassets_invalid_models"][0]["error"])
                self.assertEqual(len(report["errors"]), 1)
            finally:
                audit.ROOT = previous_root

    def test_main_writes_complete_rejection_report_before_failing(self):
        previous = (audit.ROOT, audit.TEVY, audit.ASSETS, audit.OUT)
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            audit.ROOT = root
            audit.TEVY = root / "tevy-manifest.json"
            audit.ASSETS = root / "assets-manifest.json"
            audit.OUT = root / "audit.json"
            try:
                city_root = root / "tevy-city-architecture" / "SolsticeBay"
                city_root.mkdir(parents=True)
                invalid_data = glb({
                    "asset": {"version": "2.0"},
                    "buffers": [{"byteLength": 4}, {"byteLength": 4}],
                    "bufferViews": [{"buffer": 0, "byteLength": 4}],
                }, binary=bytes(4))
                asset = city_root / "invalid-multi-buffer.glb"
                asset.write_bytes(invalid_data)
                lods = [{
                    "lod": level,
                    "file": "SolsticeBay/invalid-multi-buffer.glb",
                    "sha256": hashlib.sha256(invalid_data).hexdigest(),
                    "bytes": len(invalid_data),
                } for level in (0, 1, 2)]
                tevy_cities = {
                    city: {"selected_and_acquired": []}
                    for city in audit.CITIES
                }
                tevy_cities["SolsticeBay"]["selected_and_acquired"] = [{
                    "slug": "invalid-building",
                    "lods": lods,
                }]
                asset_cities = {city: [] for city in audit.CITIES}
                audit.TEVY.write_text(json.dumps({"cities": tevy_cities}))
                audit.ASSETS.write_text(json.dumps({"cities": asset_cities}))
                with self.assertRaisesRegex(SystemExit, "rejected 1 model"):
                    audit.main()
                result = json.loads(audit.OUT.read_text())
                self.assertEqual(result["audit_status"], "rejected_assets")
                self.assertEqual(result["totals"]["tevy_invalid_models"], 1)
                self.assertEqual(result["totals"]["tevy_valid_models"], 0)
                self.assertEqual(len(result["errors"]), 1)
                self.assertEqual(result["errors"][0]["slug"], "invalid-building")
            finally:
                audit.ROOT, audit.TEVY, audit.ASSETS, audit.OUT = previous

    def test_accepts_required_meshopt_glb_with_placeholder_fallback_buffer(self):
        document = {
            "asset": {"version": "2.0"},
            "extensionsUsed": ["EXT_meshopt_compression"],
            "extensionsRequired": ["EXT_meshopt_compression"],
            "buffers": [
                {"byteLength": 4},
                {
                    "byteLength": 12,
                    "extensions": {"EXT_meshopt_compression": {"fallback": True}},
                },
            ],
            "bufferViews": [{
                "buffer": 1,
                "byteLength": 12,
                "extensions": {
                    "EXT_meshopt_compression": {
                        "buffer": 0,
                        "byteOffset": 0,
                        "byteLength": 4,
                        "byteStride": 4,
                        "count": 3,
                        "mode": "ATTRIBUTES",
                    }
                },
            }],
        }
        data = glb(document, binary=bytes(4))
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "meshopt.glb"
            path.write_bytes(data)
            result = audit.inspect_glb(path)
        self.assertEqual(result["meshopt_compressed_view_count"], 1)
        self.assertEqual(result["meshopt_fallback_buffer_count"], 1)

    def test_accepts_unmarked_meshopt_placeholder_when_extension_is_required(self):
        document = {
            "asset": {"version": "2.0"},
            "extensionsUsed": ["EXT_meshopt_compression"],
            "extensionsRequired": ["EXT_meshopt_compression"],
            "buffers": [{"byteLength": 4}, {"byteLength": 12}],
            "bufferViews": [{
                "buffer": 1,
                "byteLength": 12,
                "extensions": {
                    "EXT_meshopt_compression": {
                        "buffer": 0, "byteLength": 4, "byteStride": 4,
                        "count": 3, "mode": "ATTRIBUTES",
                    }
                },
            }],
        }
        data = glb(document, binary=bytes(4))
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "meshopt-unmarked.glb"
            path.write_bytes(data)
            result = audit.inspect_glb(path)
        self.assertEqual(result["meshopt_fallback_buffer_count"], 1)

    def test_rejects_meshopt_placeholder_without_required_extension(self):
        document = {
            "asset": {"version": "2.0"},
            "extensionsUsed": ["EXT_meshopt_compression"],
            "buffers": [{"byteLength": 4}, {"byteLength": 12}],
            "bufferViews": [{
                "buffer": 1, "byteLength": 12,
                "extensions": {
                    "EXT_meshopt_compression": {
                        "buffer": 0, "byteLength": 4, "byteStride": 4,
                        "count": 3, "mode": "ATTRIBUTES",
                    }
                },
            }],
        }
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "meshopt-optional.glb"
            path.write_bytes(glb(document, binary=bytes(4)))
            with self.assertRaisesRegex(ValueError, "requires EXT_meshopt_compression"):
                audit.inspect_glb(path)

    def test_rejects_uncompressed_view_reference_to_meshopt_placeholder(self):
        document = {
            "asset": {"version": "2.0"},
            "extensionsUsed": ["EXT_meshopt_compression"],
            "extensionsRequired": ["EXT_meshopt_compression"],
            "buffers": [{"byteLength": 4}, {"byteLength": 12}],
            "bufferViews": [{"buffer": 1, "byteLength": 12}],
        }
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "meshopt-uncompressed-view.glb"
            path.write_bytes(glb(document, binary=bytes(4)))
            with self.assertRaisesRegex(ValueError, "uncompressed bufferView"):
                audit.inspect_glb(path)

    def test_rejects_meshopt_compressed_range_outside_source_buffer(self):
        document = {
            "asset": {"version": "2.0"},
            "extensionsUsed": ["EXT_meshopt_compression"],
            "extensionsRequired": ["EXT_meshopt_compression"],
            "buffers": [{"byteLength": 4}, {"byteLength": 12}],
            "bufferViews": [{
                "buffer": 1, "byteLength": 12,
                "extensions": {
                    "EXT_meshopt_compression": {
                        "buffer": 0, "byteOffset": 2, "byteLength": 4,
                        "byteStride": 4, "count": 3, "mode": "ATTRIBUTES",
                    }
                },
            }],
        }
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "meshopt-range.glb"
            path.write_bytes(glb(document, binary=bytes(4)))
            with self.assertRaisesRegex(ValueError, "compressed range exceeds"):
                audit.inspect_glb(path)



CATALOG_SPEC = importlib.util.spec_from_file_location(
    "uceno_polyhaven_catalog_audit",
    ROOT / "scripts" / "audit_polyhaven_city_asset_catalog.py",
)
catalog_audit = importlib.util.module_from_spec(CATALOG_SPEC)
CATALOG_SPEC.loader.exec_module(catalog_audit)


class PolyHavenCatalogueMatchingTests(unittest.TestCase):
    def test_matches_whole_words_in_names_and_normalizes_separators(self):
        terms = ("building", "office", "tower")
        self.assertEqual(
            catalog_audit.matching_terms("Modern_building-office block", terms),
            ["building", "office"],
        )

    def test_rejects_partial_word_matches(self):
        self.assertEqual(
            catalog_audit.matching_terms("towering offices and buildings", ("tower", "office", "building")),
            [],
        )

    def test_matching_is_case_insensitive(self):
        self.assertEqual(
            catalog_audit.matching_terms("HIGH-RISE BUILDING", ("building", "high-rise")),
            ["building", "high-rise"],
        )


DOWNLOAD_SPEC = importlib.util.spec_from_file_location(
    "uceno_polyhaven_downloader",
    ROOT / "scripts" / "download_polyhaven_assets.py",
)
downloader = importlib.util.module_from_spec(DOWNLOAD_SPEC)
DOWNLOAD_SPEC.loader.exec_module(downloader)


class PolyHavenDownloadSafetyTests(unittest.TestCase):
    def test_dependency_paths_reject_posix_and_windows_traversal(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "asset"
            root.mkdir()
            for candidate in ("../outside.bin", r"..\outside.bin", r"C:\outside.bin", r"\\server\share\file.bin"):
                with self.subTest(candidate=candidate):
                    with self.assertRaisesRegex(RuntimeError, "Unsafe dependency path"):
                        downloader.safe_dependency_path(root, candidate)
            self.assertEqual(
                downloader.safe_dependency_path(root, "textures/albedo.png"),
                root / "textures" / "albedo.png",
            )

    def test_dependency_paths_reject_existing_symlink_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "asset"
            root.mkdir()
            outside = pathlib.Path(directory) / "outside.bin"
            outside.write_bytes(b"outside")
            (root / "linked.bin").symlink_to(outside)
            with self.assertRaisesRegex(RuntimeError, "escapes its asset directory"):
                downloader.safe_dependency_path(root, "linked.bin")

    def test_download_records_byte_count_and_sha256_atomically(self):
        payload = b"verified model payload"

        class Response:
            def __enter__(self):
                return io.BytesIO(payload)

            def __exit__(self, *_args):
                return False

        with tempfile.TemporaryDirectory() as directory:
            destination = pathlib.Path(directory) / "model.glb"
            with patch.object(downloader.urllib.request, "urlopen", return_value=Response()):
                result = downloader.download("https://assets.example/model.glb", destination)
            self.assertEqual(destination.read_bytes(), payload)
            self.assertFalse(destination.with_name("model.glb.part").exists())
            self.assertEqual(result["bytes"], len(payload))
            self.assertEqual(result["sha256"], hashlib.sha256(payload).hexdigest())

    def test_download_rejects_empty_response(self):
        class Response:
            def __enter__(self):
                return io.BytesIO(b"")

            def __exit__(self, *_args):
                return False

        with tempfile.TemporaryDirectory() as directory:
            destination = pathlib.Path(directory) / "empty.glb"
            with patch.object(downloader.urllib.request, "urlopen", return_value=Response()):
                with self.assertRaisesRegex(RuntimeError, "Downloaded file is empty"):
                    downloader.download("https://assets.example/empty.glb", destination)
            self.assertFalse(destination.exists())
            self.assertFalse(destination.with_name("empty.glb.part").exists())


    def test_manifest_verification_accepts_matching_payload(self):
        payload = b"manifest verified"
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / "model.glb").write_bytes(payload)
            manifest = {
                "files": ["model.glb"],
                "file_integrity": {
                    "model.glb": {
                        "bytes": len(payload),
                        "sha256": hashlib.sha256(payload).hexdigest(),
                    }
                },
            }
            self.assertEqual(downloader.verify_manifest(root, manifest), [])

    def test_manifest_verification_detects_modified_payload(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / "model.glb").write_bytes(b"modified")
            manifest = {
                "files": ["model.glb"],
                "file_integrity": {
                    "model.glb": {"bytes": 8, "sha256": hashlib.sha256(b"original").hexdigest()}
                },
            }
            errors = downloader.verify_manifest(root, manifest)
            self.assertTrue(any("SHA-256 mismatch" in error for error in errors))

    def test_manifest_verification_rejects_traversal_and_missing_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            manifest = {
                "files": ["../outside.glb", "missing.glb"],
                "file_integrity": {
                    "../outside.glb": {"bytes": 1, "sha256": "0" * 64},
                    "missing.glb": {"bytes": 1, "sha256": "0" * 64},
                },
            }
            errors = downloader.verify_manifest(root, manifest)
            self.assertTrue(any("Unsafe dependency path" in error for error in errors))
            self.assertTrue(any("payload file is missing" in error for error in errors))



if __name__ == "__main__":
    unittest.main()
