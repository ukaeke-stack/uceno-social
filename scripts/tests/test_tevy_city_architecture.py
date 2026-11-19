import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "tevy_city_discovery", ROOT / "scripts" / "discover-tevy-city-architecture.py")
tevy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tevy)


def record(name="Modern Office Tower", category="buildings", license_name="CC0-1.0",
           dimensions=(24, 62, 20), files=None, tags=None, description="urban office building"):
    return {
        "slug": "sample-building", "name": name, "category": category,
        "license": license_name, "dimensions": dict(zip(("x", "y", "z"), dimensions)),
        "files": files or [
            {"lod": i, "path": f"/models/sample-building/v1/lod{i}.glb",
             "bytes": 1000, "sha256": "a" * 64, "triangles": 1000}
            for i in range(3)
        ],
        "tags": tags or ["office", "city"], "description": description, "version": 1,
    }


class TevyCityArchitectureTests(unittest.TestCase):
    def test_cc0_full_scale_building_with_three_lods_passes(self):
        self.assertIsNone(tevy.screen(record(), "NexusDelta"))

    def test_non_occupiable_infrastructure_is_rejected(self):
        for name in ("Power Pylon", "Lattice TV Tower", "Harbour Crane", "Chairlift Bottom Station", "Glass Tower Crown", "High-Voltage Pylon", "Cooling Tower", "Launch Tower and Pad", "Glass Tower Lobby Floor", "Drop Tower", "Wind Turbine", "Lighthouse", "Airport Control Tower"):
            with self.subTest(name=name):
                self.assertEqual(tevy.screen(record(name=name), "NexusDelta"), "non-occupiable-infrastructure")

    def test_non_building_category_is_rejected(self):
        self.assertEqual(tevy.screen(record(category="props"), "NexusDelta"), "not-building-category")

    def test_non_cc0_is_rejected(self):
        self.assertEqual(tevy.screen(record(license_name="CC-BY-4.0"), "NexusDelta"), "not-explicit-cc0")

    def test_thin_facade_is_rejected(self):
        self.assertEqual(tevy.screen(record(dimensions=(20, 18, 1.2)), "NexusDelta"), "undersized-or-thin")

    def test_eclipse_tower_must_reach_35m(self):
        self.assertEqual(tevy.screen(record(dimensions=(20, 34, 20)), "EclipseCentral"), "eclipse-tower-below-35m")

    def test_deprecated_models_are_rejected(self):
        item = record()
        item["deprecated"] = True
        self.assertEqual(tevy.screen(item, "NexusDelta"), "deprecated")

    def test_city_relevance_scores_are_not_identical(self):
        coastal = record(name="Coastal Lighthouse", tags=["coastal", "lighthouse"])
        industrial = record(name="Industrial Factory", tags=["industrial", "factory"])
        self.assertGreater(tevy.score(coastal, "SolsticeBay"), tevy.score(industrial, "SolsticeBay"))

    def test_glb_checksum_and_header_are_verified(self):
        import hashlib
        import struct
        doc = b'{"asset":{"version":"2.0"},"scenes":[{"nodes":[]}]}'
        padding = (4 - len(doc) % 4) % 4
        doc += b" " * padding
        total = 12 + 8 + len(doc)
        data = b"glTF" + struct.pack("<II", 2, total) + struct.pack("<II", len(doc), 0x4E4F534A) + doc
        digest = hashlib.sha256(data).hexdigest()
        self.assertEqual(tevy.verify_glb(data, digest)[0], digest)
        with self.assertRaises(ValueError):
            tevy.verify_glb(data, "0" * 64)


if __name__ == "__main__":
    unittest.main()
