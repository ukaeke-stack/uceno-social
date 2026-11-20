import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]

def load_script(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

discovery = load_script("uceno_city_discovery", "discover-city-architecture.py")
acquisition = load_script("uceno_city_acquisition", "acquire-city-architecture.py")


def asset(title, dimensions, summary="realistic exterior building", tags=None, style=None):
    value = {
        "title": title,
        "summary": summary,
        "category": "buildings",
        "tags": tags or [{"slug": "realistic"}, {"slug": "exterior"}],
        "stats": {"sizeMeters": dimensions, "fileSize": 250000, "triangles": 80000},
    }
    if style is not None:
        value["style"] = style
    return value


class CityArchitectureScreeningTests(unittest.TestCase):
    def test_non_building_categories_are_rejected_even_when_search_returns_a_building_title(self):
        candidate = asset("Glass Office Tower", [24, 62, 20])
        candidate["category"] = "props"
        self.assertEqual(discovery.rejection_reason(candidate, "NexusDelta"),
                         "not-building-category")
        detail = {
            "title": "Glass Office Tower",
            "description": "realistic exterior office building",
            "category": "props",
            "style": "realistic",
            "tags": [{"slug": "exterior"}],
            "stats": {"sizeMeters": [24, 62, 20]},
        }
        with self.assertRaisesRegex(ValueError, "category"):
            acquisition.validate_complete_building(detail, "NexusDelta")

    def test_complete_office_tower_is_a_candidate(self):
        self.assertIsNone(discovery.rejection_reason(
            asset("Glass Office Tower", [24, 62, 20]), "NexusDelta"))

    def test_realistic_style_field_is_accepted_without_requiring_duplicate_tag(self):
        candidate = asset("Glass Office Tower", [24, 62, 20],
                          tags=[{"slug": "exterior"}], style="Realistic")
        self.assertIsNone(discovery.rejection_reason(candidate, "NexusDelta"))
        detail = {
            "title": "Glass Office Tower",
            "category": "buildings",
            "description": "modern exterior office building",
            "style": "realistic",
            "tags": [{"slug": "exterior"}],
            "stats": {"sizeMeters": [24, 62, 20]},
        }
        self.assertEqual(acquisition.validate_complete_building(detail, "NexusDelta"),
                         (24.0, 62.0, 20.0))

    def test_building_description_may_mention_walls_windows_and_columns(self):
        building = asset(
            "Modern Residential Tower", [24, 62, 20],
            summary="Glass windows, concrete walls, steel columns, floor slabs and balconies."
        )
        self.assertIsNone(discovery.rejection_reason(building, "NexusDelta"))

    def test_component_title_is_rejected_even_if_description_says_building(self):
        component = asset(
            "Office Tower Wall", [8, 12, 0.2],
            summary="Realistic exterior building component"
        )
        self.assertEqual(
            discovery.rejection_reason(component, "NexusDelta"),
            "individual-building-part-or-prop",
        )

    def test_windmill_cross_is_not_a_complete_city_building(self):
        reason = discovery.rejection_reason(
            asset("Mill Sail Cross", [10.4, 10.4, 0.83]), "SolsticeBay")
        self.assertIn(reason, {
            "non-building-object-title",
            "title-does-not-identify-a-complete-building",
            "too-small-or-too-narrow-to-be-a-complete-building",
        })

    def test_thin_facade_like_object_is_rejected(self):
        reason = discovery.rejection_reason(
            asset("Modern Office Tower", [18, 42, 0.9]), "NexusDelta")
        self.assertEqual(reason, "too-small-or-too-narrow-to-be-a-complete-building")

    def test_eclipse_central_requires_35_metre_tower(self):
        reason = discovery.rejection_reason(
            asset("Glass Office Tower", [18, 34, 18]), "EclipseCentral")
        self.assertEqual(reason, "lumen-tower-candidate-below-35m")

    def test_acquisition_rechecks_complete_building_title_and_footprint(self):
        detail = {
            "title": "Mill Sail Cross",
            "category": "buildings",
            "description": "realistic exterior building",
            "tags": [{"slug": "realistic"}, {"slug": "exterior"}],
            "stats": {"sizeMeters": [10.4, 10.4, 0.83]},
        }
        with self.assertRaises(ValueError):
            acquisition.validate_complete_building(detail, "SolsticeBay")

    def test_acquisition_allows_component_words_in_building_description(self):
        detail = {
            "title": "Modern Residential Tower",
            "category": "buildings",
            "description": "Glass windows, concrete walls, steel columns and floor slabs.",
            "tags": [{"slug": "realistic"}, {"slug": "exterior"}],
            "stats": {"sizeMeters": [24, 62, 20]},
        }
        self.assertEqual(
            acquisition.validate_complete_building(detail, "NexusDelta"),
            (24.0, 62.0, 20.0),
        )

    def test_acquisition_accepts_full_scale_office_tower(self):
        detail = {
            "title": "Glass Office Tower",
            "category": "buildings",
            "description": "realistic exterior office building",
            "tags": [{"slug": "realistic"}, {"slug": "exterior"}],
            "stats": {"sizeMeters": [24, 62, 20]},
        }
        self.assertEqual(
            acquisition.validate_complete_building(detail, "NexusDelta"),
            (24.0, 62.0, 20.0),
        )


if __name__ == "__main__":
    unittest.main()
