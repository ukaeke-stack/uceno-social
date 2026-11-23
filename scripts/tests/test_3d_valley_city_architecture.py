import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "uceno_3d_valley_discovery",
    ROOT / "scripts" / "discover-3d-valley-city-architecture.py",
)
valley = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(valley)


def candidate(**overrides):
    item = {
        "id": "asset-001",
        "name": "Coastal Apartment Building",
        "license": "CC0-1.0",
        "type": "model",
        "style": "realistic",
        "tags": ["coastal", "waterfront", "apartment"],
        "size_m": [18.0, 12.0, 14.0],
        "tris": 85000,
        "maps": ["baseColor", "normal", "roughness"],
        "max_res": "2K",
        "download": "https://3dvalley.com/download/asset-001.glb",
        "preview": "https://3dvalley.com/assets/asset-001",
        "match": "strong",
        "similarity": 0.94,
    }
    item.update(overrides)
    return item


class ThreeDValleyCityArchitectureTests(unittest.TestCase):
    def test_explicit_cc0_realistic_full_building_for_matching_city_passes(self):
        self.assertIsNone(valley.reject_reason(candidate(), "SolsticeBay"))

    def test_non_cc0_or_missing_licence_is_rejected(self):
        for licence in ("CC-BY-4.0", "Royalty-Free", "", None):
            with self.subTest(licence=licence):
                self.assertEqual(
                    valley.reject_reason(candidate(license=licence), "SolsticeBay"),
                    "license-not-explicitly-cc0-1.0",
                )

    def test_missing_or_invalid_measured_dimensions_are_rejected(self):
        cases = [
            None, [], [18, 12], ["wide", 12, 14], [18, 4.9, 14],
            [3.9, 12, 14], [18, 12, 3.9],
        ]
        for dimensions in cases:
            with self.subTest(dimensions=dimensions):
                self.assertIsNotNone(
                    valley.reject_reason(candidate(size_m=dimensions), "SolsticeBay")
                )

    def test_eclipse_central_requires_at_least_35_metres_height(self):
        item = candidate(
            name="Supertall Glass Skyscraper",
            tags=["skyscraper", "tower", "commercial"],
            size_m=[40, 34.99, 40],
        )
        self.assertEqual(
            valley.reject_reason(item, "EclipseCentral"),
            "eclipse-tower-below-35m",
        )
        item["size_m"][1] = 35
        self.assertIsNone(valley.reject_reason(item, "EclipseCentral"))

    def test_city_theme_relevance_is_enforced(self):
        unrelated = candidate(
            name="Desert Adobe Courtyard House",
            tags=["desert", "adobe", "oasis", "courtyard"],
        )
        self.assertEqual(
            valley.reject_reason(unrelated, "SolsticeBay"),
            "insufficient-city-theme-relevance",
        )

    def test_relevant_candidates_are_checked_against_each_city_theme(self):
        examples = {
            "SolsticeBay": ("Coastal Apartment Building", ["coastal", "waterfront"]),
            "VerdantReach": ("Sustainable Green Research Campus", ["green", "research"]),
            "NexusDelta": ("Modern Glass Office Skyscraper", ["glass", "office"]),
            "AuroraHeights": ("Alpine Mountain Resort Lodge", ["alpine", "mountain"]),
            "SaffronDunes": ("Desert Adobe Courtyard House", ["desert", "adobe"]),
            "MonsoonHarbour": ("Tropical Harbour Market Building", ["tropical", "harbour"]),
            "EclipseCentral": ("Supertall Commercial Tower", ["supertall", "tower"]),
            "OriginPlains": ("University Research Library", ["university", "research"]),
            "AtlasFrontier": ("Industrial Logistics Warehouse", ["industrial", "logistics"]),
        }
        for city, (name, tags) in examples.items():
            with self.subTest(city=city):
                item = candidate(name=name, tags=tags, size_m=[40, 40, 40])
                self.assertIsNone(valley.reject_reason(item, city))

    def test_incomplete_required_metadata_is_rejected(self):
        missing_values = ("name", "type", "style", "tags", "match")
        for field in missing_values:
            item = candidate()
            item.pop(field)
            with self.subTest(field=field):
                self.assertIsNotNone(valley.reject_reason(item, "SolsticeBay"))

    def test_missing_asset_identity_is_not_accepted(self):
        item = candidate()
        item.pop("id")
        self.assertEqual(valley.reject_reason(item, "SolsticeBay"), "missing-asset-id")

    def test_missing_download_or_preview_provenance_is_rejected(self):
        for field in ("download", "preview"):
            with self.subTest(field=field):
                self.assertEqual(
                    valley.reject_reason(candidate(**{field: ""}), "SolsticeBay"),
                    "incomplete-source-metadata",
                )

    def test_missing_geometry_metadata_is_rejected(self):
        for field in ("tris", "maps", "max_res"):
            item = candidate()
            item.pop(field)
            with self.subTest(field=field):
                self.assertEqual(
                    valley.reject_reason(item, "SolsticeBay"),
                    "incomplete-geometry-metadata",
                )

    def test_building_components_and_props_are_rejected(self):
        component_titles = (
            "Office Tower Wall",
            "Glass Office Window",
            "Residential Building Door",
            "Steel Column for Office Tower",
            "Roof Section of Harbour Hotel",
            "Apartment Facade Module",
            "Office Tower Furniture",
            "Concrete Floor Tile",
            "Harbour Hotel Gate",
            "Harbour Hotel Bridge Canopy",
        )
        for name in component_titles:
            with self.subTest(name=name):
                self.assertEqual(
                    valley.reject_reason(candidate(name=name), "SolsticeBay"),
                    "building-part-or-prop",
                )

    def test_component_tags_cannot_rescue_a_component_title(self):
        item = candidate(
            name="Office Tower Window",
            tags=["coastal", "waterfront", "apartment", "complete building"],
        )
        self.assertEqual(
            valley.reject_reason(item, "SolsticeBay"),
            "building-part-or-prop",
        )

    def test_complete_building_may_describe_its_windows_walls_and_columns(self):
        item = candidate(
            name="Coastal Apartment Building",
            tags=["coastal", "waterfront", "apartment"],
        )
        self.assertIsNone(valley.reject_reason(item, "SolsticeBay"))

    def test_non_model_and_non_realistic_assets_are_rejected(self):
        self.assertEqual(
            valley.reject_reason(candidate(type="texture"), "SolsticeBay"),
            "not-a-model",
        )
        self.assertEqual(
            valley.reject_reason(candidate(style="stylized"), "SolsticeBay"),
            "not-realistic-style",
        )

    def test_weak_or_missing_semantic_match_is_rejected(self):
        for match in ("weak", "poor", "", None):
            with self.subTest(match=match):
                self.assertEqual(
                    valley.reject_reason(candidate(match=match), "SolsticeBay"),
                    "semantic-match-not-strong-or-good",
                )


if __name__ == "__main__":
    unittest.main()
