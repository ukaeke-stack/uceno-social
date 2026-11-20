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

    def test_building_category_object_is_normalized(self):
        item = record()
        item["category"] = {"slug": "buildings", "title": "Buildings"}
        self.assertIsNone(tevy.screen(item, "NexusDelta"))

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

    def test_asset_allocator_assigns_models_to_the_best_fit_city(self):
        rare = record(name="Desert Adobe Courtyard Hotel",
                      tags=["desert", "adobe", "courtyard", "hotel"],
                      description="desert adobe courtyard hotel")
        rare["slug"] = "desert-adobe"
        broad = record(name="Coastal Waterfront Apartment Tower",
                       tags=["coastal", "waterfront", "apartment", "tower"],
                       description="coastal waterfront residential apartment tower")
        broad["slug"] = "coastal-tower"
        allocations = tevy.allocate_city_candidates({
            "SolsticeBay": [broad, rare],
            "SaffronDunes": [rare, broad]
        }, 1)
        self.assertEqual([item["slug"] for item in allocations["SolsticeBay"]], ["coastal-tower"])
        self.assertEqual([item["slug"] for item in allocations["SaffronDunes"]], ["desert-adobe"])

    def test_asset_allocator_maximizes_unique_coverage_without_fixed_city_order(self):
        rare = record(name="Desert Adobe Courtyard Hotel",
                      tags=["desert", "adobe", "courtyard", "hotel"],
                      description="desert adobe courtyard hotel")
        rare["slug"] = "desert-adobe"
        broad = record(name="Modern Waterfront Apartment Tower",
                       tags=["waterfront", "apartment", "tower"],
                       description="coastal waterfront residential apartment tower")
        broad["slug"] = "waterfront-tower"
        pools = {
            "SolsticeBay": [broad, rare],
            "SaffronDunes": [rare, broad],
        }
        allocations = tevy.allocate_city_candidates(pools, 1)
        slugs = {city: [item["slug"] for item in items] for city, items in allocations.items()}
        self.assertEqual(sum(len(items) for items in slugs.values()), 2)
        self.assertEqual(len({item for items in slugs.values() for item in items}), 2)

    def test_asset_allocator_balances_coverage_before_extra_assets(self):
        shared = record(name="Modern Office Tower",
                        tags=["office", "tower"],
                        description="modern office tower")
        shared["slug"] = "shared-tower"
        nexus_only = record(name="Nexus Delta Commercial Tower",
                            tags=["skyscraper", "office", "commercial", "tower"],
                            description="Nexus Delta office skyscraper tower")
        nexus_only["slug"] = "nexus-only"
        pools = {
            "EclipseCentral": [shared],
            "NexusDelta": [shared, nexus_only],
        }
        allocations = tevy.allocate_city_candidates(pools, 2)
        self.assertEqual(len(allocations["EclipseCentral"]), 1)
        self.assertEqual(len(allocations["NexusDelta"]), 1)
        self.assertEqual(
            {item["slug"] for city in allocations.values() for item in city},
            {"shared-tower", "nexus-only"}
        )

    def test_allocator_gives_every_city_first_asset_before_filling_broad_city(self):
        shared = record(name="Modern Glass Office Tower",
                        tags=["office", "tower"], description="office tower building")
        shared["slug"] = "shared-office-tower"
        broad_a = record(name="NexusDelta Commercial Skyscraper",
                         tags=["skyscraper", "commercial", "tower"])
        broad_a["slug"] = "nexus-a"
        broad_b = record(name="NexusDelta High Rise Office",
                         tags=["high rise", "office", "tower"])
        broad_b["slug"] = "nexus-b"
        pools = {
            "NexusDelta": [shared, broad_a, broad_b],
            "EclipseCentral": [shared],
        }
        allocations = tevy.allocate_city_candidates(pools, 2)
        self.assertEqual(len(allocations["EclipseCentral"]), 1)
        self.assertEqual(len(allocations["NexusDelta"]), 2)
        all_slugs = [item["slug"] for items in allocations.values() for item in items]
        self.assertEqual(len(all_slugs), len(set(all_slugs)))

    def test_city_asset_allocation_never_reuses_a_model_slug(self):
        shared = record(name="Modern Office Tower", tags=["office", "tower"])
        shared["slug"] = "shared-tower"
        coastal = record(name="Coastal Apartment Hotel", tags=["coastal", "apartment", "hotel"])
        coastal["slug"] = "coastal-hotel"
        industrial = record(name="Industrial Warehouse Factory", tags=["industrial", "warehouse", "factory"])
        industrial["slug"] = "industrial-warehouse"
        pools = {
            "SolsticeBay": [shared, coastal, industrial],
            "SaffronDunes": [shared, coastal, industrial],
            "AtlasFrontier": [shared, coastal, industrial],
        }
        allocations = tevy.allocate_city_candidates(pools, 2)
        slugs = [item["slug"] for items in allocations.values() for item in items]
        self.assertEqual(len(slugs), len(set(slugs)))
        self.assertEqual(sum(len(items) for items in allocations.values()), 3)

    def test_catalogue_requests_retry_transient_http_failures(self):
        import io
        import urllib.error
        from unittest import mock
        failure = urllib.error.HTTPError(
            "https://tevy.dev/models.json", 503, "temporarily unavailable", {}, None
        )
        with mock.patch("urllib.request.urlopen",
                        side_effect=[failure, io.BytesIO(b'{"models": []}')]) as request, \
             mock.patch.object(tevy.time, "sleep") as sleep:
            self.assertEqual(tevy.get_json("https://tevy.dev/models.json"), {"models": []})
            self.assertEqual(request.call_count, 2)
            sleep.assert_called_once()

    def test_catalogue_requests_do_not_retry_permanent_http_errors(self):
        import urllib.error
        from unittest import mock
        failure = urllib.error.HTTPError(
            "https://tevy.dev/models.json", 404, "not found", {}, None
        )
        with mock.patch("urllib.request.urlopen", side_effect=failure) as request, \
             mock.patch.object(tevy.time, "sleep") as sleep:
            with self.assertRaises(urllib.error.HTTPError):
                tevy.get_json("https://tevy.dev/models.json")
            request.assert_called_once()
            sleep.assert_not_called()

    def test_complete_building_description_may_mention_its_facade(self):
        candidate = record(
            name="Harbour Control Office",
            tags=["office", "commercial"],
            description="Complete harbour office building with glass facade and waterfront frontage"
        )
        self.assertIsNone(tevy.screen(candidate, "MonsoonHarbour"))

    def test_frontier_building_is_not_misclassified_as_a_front_facade(self):
        candidate = record(
            name="Frontier Church With Steeple",
            tags=["office", "commercial"],
            description="western frontier town complete church building"
        )
        self.assertEqual(tevy.screen(candidate, "SaffronDunes"), "unwanted-theme")

    def test_izakaya_front_facade_is_not_acquired_as_a_building(self):
        candidate = record(
            name="Izakaya Front",
            tags=["office", "commercial"],
            description="NexusDelta urban commercial building frontage"
        )
        self.assertEqual(tevy.screen(candidate, "NexusDelta"),
                         "non-occupiable-infrastructure")

    def test_acquired_catalogue_infrastructure_is_not_misclassified_as_buildings(self):
        rejected_titles = [
            "Quay Wall Straight with Bollard", "Passenger Boarding Bridge",
            "Chain Swing Ride", "Carousel", "Bumper Car Pavilion", "Escalator Pair",
            "Station Entrance Canopy", "Loading Dock", "Grain Silo Set",
            "Rooftop Water Tower", "Gas Storage Tanks", "Conveyor Transfer Tower",
            "Giant Corner LED Screen", "Metro Platform End with Stairs",
            "Tower Windmill", "Sci-Fi Reactor Room"
        ]
        for title in rejected_titles:
            item = record(name=title, tags=["office", "commercial"],
                          description="urban office building")
            self.assertEqual(tevy.screen(item, "NexusDelta"),
                             "non-occupiable-infrastructure", title)

    def test_complete_occupiable_buildings_remain_eligible(self):
        for title in ["Harbour Control Office", "Fire Station",
                      "Village Grocery Shop", "White Village Church",
                      "Korean Apartment Tower"]:
            item = record(name=title, tags=["office", "commercial"],
                          description="complete realistic exterior building")
            self.assertIsNone(tevy.screen(item, "NexusDelta"), title)

    def test_lod_metadata_rejects_non_hex_checksums_and_path_traversal(self):
        item = record()
        item["files"][0]["sha256"] = "g" * 64
        self.assertEqual(tevy.screen(item, "NexusDelta"), "missing-or-invalid-lod-checksum")
        item = record()
        item["files"][0]["path"] = "/models/sample-building/v1/lod0.glb/../../outside"
        self.assertEqual(tevy.screen(item, "NexusDelta"), "unpinned-or-unsafe-glb-lod-path")

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
