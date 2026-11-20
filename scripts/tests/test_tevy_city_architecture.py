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

    def test_model_slug_cannot_escape_asset_output_directory(self):
        item = record()
        item["slug"] = "../outside"
        self.assertEqual(tevy.screen(item, "NexusDelta"), "invalid-model-slug")

    def test_model_slug_must_be_present_and_safe(self):
        item = record()
        item["slug"] = ""
        self.assertEqual(tevy.screen(item, "NexusDelta"), "invalid-model-slug")

    def test_non_occupiable_infrastructure_is_rejected(self):
        for name in ("Power Pylon", "Lattice TV Tower", "Harbour Crane", "Chairlift Bottom Station", "Glass Tower Crown", "High-Voltage Pylon", "Cooling Tower", "Launch Tower and Pad", "Glass Tower Lobby Floor", "Drop Tower", "Wind Turbine", "Lighthouse", "Airport Control Tower", "Ferris Wheel", "Observation Wheel", "Roller Coaster", "Amusement Ride", "Theme Park Ride", "Refinery Column Unit", "Distillation Column", "Industrial Process Column"):
            with self.subTest(name=name):
                self.assertEqual(tevy.screen(record(name=name), "NexusDelta"), "non-occupiable-infrastructure")

    def test_refinery_process_columns_are_not_occupiable_buildings(self):
        for name in ("Refinery Column Unit", "Distillation Column", "Industrial Process Column"):
            with self.subTest(name=name):
                self.assertEqual(tevy.screen(record(name=name), "EclipseCentral"), "non-occupiable-infrastructure")

    def test_lighthouse_is_rejected_even_if_catalogue_calls_it_a_building(self):
        self.assertEqual(tevy.screen(record(name="Coastal Lighthouse"), "SolsticeBay"), "non-occupiable-infrastructure")

    def test_infrastructure_hidden_in_description_or_tags_is_rejected(self):
        item = record(name="Office Tower", description="A modern tower beside an observation wheel")
        self.assertEqual(tevy.screen(item, "NexusDelta"), "non-occupiable-infrastructure")
        item = record(name="Office Tower", tags=["office", "theme park ride"])
        self.assertEqual(tevy.screen(item, "NexusDelta"), "non-occupiable-infrastructure")

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

    def test_generic_building_is_not_assigned_to_an_unrelated_city(self):
        generic = record(name="Modern Office Building", tags=["building", "office"])
        self.assertEqual(tevy.screen(generic, "AuroraHeights"), "insufficient-city-relevance")

    def test_city_specific_building_candidate_passes_relevance_gate(self):
        alpine = record(name="Alpine Ski Lodge", tags=["alpine", "mountain", "ski", "lodge"])
        self.assertIsNone(tevy.screen(alpine, "AuroraHeights"))

    def test_airport_does_not_count_as_the_city_theme_word_port(self):
        airport = record(name="Airport Hangar", tags=["aviation", "hangar"], description="regional airport hangar")
        self.assertEqual(tevy.screen(airport, "MonsoonHarbour"), "insufficient-city-relevance")

    def test_city_relevance_uses_word_boundaries(self):
        airport = record(name="Airport Hangar", tags=["aviation", "hangar"], description="regional airport hangar")
        self.assertEqual(tevy.score(airport, "MonsoonHarbour"), tevy.score(airport, "SolsticeBay"))

    def test_city_relevance_scores_are_not_identical(self):
        coastal = record(name="Coastal Apartment Hotel", tags=["coastal", "apartment", "hotel"])
        industrial = record(name="Industrial Factory", tags=["industrial", "factory"])
        self.assertGreater(tevy.score(coastal, "SolsticeBay"), tevy.score(industrial, "SolsticeBay"))

    def test_rare_city_candidate_pool_is_allocated_before_broad_pools(self):
        rare = [{"slug": "shared"}]
        broad = [{"slug": "shared"}, {"slug": "broad-1"}, {"slug": "broad-2"}]
        allocations = tevy.allocate_city_candidates({"BroadCity": broad, "RareCity": rare}, 2)
        self.assertEqual([item["slug"] for item in allocations["RareCity"]], ["shared"])
        self.assertEqual([item["slug"] for item in allocations["BroadCity"]], ["broad-1", "broad-2"])

    def test_asset_allocator_maximizes_unique_coverage_without_fixed_city_order(self):
        rare = record(name="Desert Adobe Courtyard Hotel",
                      tags=["desert", "adobe", "courtyard", "hotel"],
                      description="desert adobe courtyard hotel")
        broad = record(name="Modern Waterfront Apartment Tower",
                       tags=["waterfront", "apartment", "tower"],
                       description="coastal waterfront residential apartment tower")
        pools = {
            "SolsticeBay": [broad, rare],
            "SaffronDunes": [rare, broad],
        }
        allocations = tevy.allocate_city_candidates(pools, 1)
        slugs = {city: [item["slug"] for item in items] for city, items in allocations.items()}
        self.assertEqual(sum(len(items) for items in slugs.values()), 2)
        self.assertEqual(len({item for items in slugs.values() for item in items}), 2)

    def test_city_asset_allocation_never_reuses_a_model_slug(self):
        pools = {
            "CityA": [{"slug": "shared"}, {"slug": "a-only"}],
            "CityB": [{"slug": "shared"}, {"slug": "b-only"}],
            "CityC": [{"slug": "shared"}, {"slug": "c-only"}],
        }
        allocations = tevy.allocate_city_candidates(pools, 2)
        slugs = [item["slug"] for items in allocations.values() for item in items]
        self.assertEqual(len(slugs), len(set(slugs)))
        self.assertEqual(sum(len(items) for items in allocations.values()), 4)

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
