import hashlib
import importlib.util
import json
import pathlib
import struct
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "innerscene_pilot", ROOT / "scripts" / "acquire-innerscene-architecture-pilot.py"
)
pilot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pilot)


class InnersceneSourceVerificationTests(unittest.TestCase):
    def setUp(self):
        self.asset = {
            "name": "Twenty-storey glass office tower",
            "source_page": "https://www.innerscene.com/tools/library/3d-parts/twenty-storey-glass-office-tower-0f2e9425",
            "listed_dimensions_m": [32.189, 27.736, 72.795],
        }
        self.page = """
        <html><body>
          <h1>Twenty-storey glass office tower</h1>
          <p>3D model · GLB</p>
          <p>Public domain (CC0). Free to use, modify and redistribute.</p>
          <p>Overall size 32.189 x 27.736 x 72.795 m.</p>
          <p>glTF binary (GLB) mesh with materials, modeled in meters at real-world scale.</p>
        </body></html>
        """

    def test_explicit_cc0_glb_title_scale_and_dimensions_pass(self):
        result = pilot.verify_source_page(self.asset, self.page)
        self.assertEqual(result["license_verified"], "CC0")
        self.assertTrue(result["format_verified"])
        self.assertTrue(result["dimensions_verified"])

    def test_non_cc0_page_is_rejected(self):
        page = self.page.replace("Public domain (CC0)", "Creative Commons Attribution")
        with self.assertRaisesRegex(ValueError, "does not explicitly confirm CC0"):
            pilot.verify_source_page(self.asset, page)

    def test_non_glb_page_is_rejected(self):
        page = self.page.replace("GLB", "FBX").replace("glTF binary", "FBX binary")
        with self.assertRaisesRegex(ValueError, "binary glTF"):
            pilot.verify_source_page(self.asset, page)

    def test_wrong_title_is_rejected(self):
        page = self.page.replace("Twenty-storey glass office tower", "Unrelated model")
        with self.assertRaisesRegex(ValueError, "title does not match"):
            pilot.verify_source_page(self.asset, page)

    def test_unsubstantiated_dimensions_are_rejected(self):
        page = self.page.replace("72.795", "2.795")
        with self.assertRaisesRegex(ValueError, "does not substantiate dimension"):
            pilot.verify_source_page(self.asset, page)

    def test_millimetre_dimensions_are_accepted(self):
        asset = {
            "name": "Steel portal-frame factory",
            "source_page": "https://www.innerscene.com/tools/library/3d-parts/steel-portal-frame-factory",
            "listed_dimensions_m": [40.8, 44.48, 10.741],
        }
        page = """
        <h1>Steel portal-frame factory</h1>
        <p>3D model · GLB. Public domain (CC0).</p>
        <p>Overall 40800 x 44480 x 10741 mm.</p>
        <p>glTF binary (GLB) mesh, modeled in meters at real-world scale.</p>
        """
        result = pilot.verify_source_page(asset, page)
        self.assertTrue(result["dimensions_verified"])

    def test_untrusted_source_host_is_rejected(self):
        asset = dict(self.asset, source_page="https://example.com/model")
        with self.assertRaisesRegex(ValueError, "HTTPS Innerscene"):
            pilot.verify_source_page(asset, self.page)


class InnersceneGlbValidationTests(unittest.TestCase):
    @staticmethod
    def make_glb(document):
        payload = json.dumps(document, separators=(",", ":")).encode("utf-8")
        payload += b" " * ((4 - len(payload) % 4) % 4)
        total = 12 + 8 + len(payload)
        return (b"glTF" + struct.pack("<II", 2, total) +
                struct.pack("<II", len(payload), 0x4E4F534A) + payload)

    def valid_document(self):
        return {
            "asset": {"version": "2.0"},
            "scenes": [{"nodes": [0]}],
            "nodes": [{"mesh": 0}],
            "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
            "materials": [{}],
            "accessors": [{"count": 3, "min": [0, 0, 0], "max": [1, 2, 3]}],
        }

    def test_valid_glb_reports_hash_geometry_and_materials(self):
        import tempfile
        payload = self.make_glb(self.valid_document())
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "candidate.glb"
            path.write_bytes(payload)
            result = pilot.parse_glb(path)
        self.assertEqual(result["gltf_version"], "2.0")
        self.assertEqual(result["material_count"], 1)
        self.assertEqual(result["position_span_xyz_m"], [1, 2, 3])
        self.assertEqual(result["sha256"], hashlib.sha256(payload).hexdigest())

    def test_external_texture_uri_is_rejected(self):
        import tempfile
        document = self.valid_document()
        document["images"] = [{"uri": "texture.png"}]
        payload = self.make_glb(document)
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "external.glb"
            path.write_bytes(payload)
            with self.assertRaisesRegex(ValueError, "external image files"):
                pilot.parse_glb(path)

    def test_missing_materials_are_rejected(self):
        import tempfile
        document = self.valid_document()
        document["materials"] = []
        payload = self.make_glb(document)
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "no-materials.glb"
            path.write_bytes(payload)
            with self.assertRaisesRegex(ValueError, "no materials"):
                pilot.parse_glb(path)


class InnersceneCandidateInventoryTests(unittest.TestCase):
    def test_candidate_ids_are_unique_and_city_ids_are_valid(self):
        valid_cities = {"solstice", "verdant", "nexus", "aurora", "saffron",
                        "monsoon", "eclipse", "origin", "atlas"}
        ids = [asset["id"] for asset in pilot.ASSETS]
        self.assertEqual(len(ids), len(set(ids)))
        for asset in pilot.ASSETS:
            self.assertEqual(asset["license"], "CC0")
            self.assertTrue(asset["source_page"].startswith(
                "https://www.innerscene.com/tools/library/3d-parts/"
            ))
            self.assertEqual(asset["asset_class"], "architecture")
            self.assertTrue(set(asset["candidate_city_ids"]).issubset(valid_cities))
            self.assertEqual(len(asset["listed_dimensions_m"]), 3)

    def test_candidate_count_expands_without_approving_any_asset(self):
        self.assertEqual(len(pilot.ASSETS), 12)
        self.assertTrue(all("pending art review" in asset["city_role"]
                            for asset in pilot.ASSETS))


if __name__ == "__main__":
    unittest.main()
