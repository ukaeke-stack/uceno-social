import unittest

from scripts.discover_polyhaven_city_assets_v2 import (
    CITY_THEMES, ROLE_TERMS, building_screen, hits, searchable_text,
    summarize_city_coverage,
)


class CityAssetDiscoveryTests(unittest.TestCase):
    def test_all_nine_cities_are_covered(self):
        self.assertEqual(len(CITY_THEMES), 9)
        self.assertEqual(set(CITY_THEMES), {
            "SolsticeBay", "VerdantReach", "NexusDelta", "AuroraHeights",
            "SaffronDunes", "MonsoonHarbour", "EclipseCentral",
            "OriginPlains", "AtlasFrontier",
        })

    def test_all_ten_functional_roles_are_present(self):
        self.assertEqual(len(ROLE_TERMS), 10)
        for role in (
            "residential", "commercial", "civic_cultural",
            "transport_industrial", "landmark", "street_furniture",
            "vegetation", "terrain", "recreation", "interior",
        ):
            self.assertIn(role, ROLE_TERMS)

    def test_term_matching_uses_word_boundaries(self):
        self.assertEqual(hits("a tower in a city", ("tower", "tow")), ["tower"])
        self.assertEqual(hits("street light and lamp post", ("lamp post",)), ["lamp post"])

    def test_searchable_text_normalizes_separators_and_tags(self):
        text = searchable_text({
            "name": "Modern_Apartment",
            "description": None,
            "category": "Urban-Building",
            "tags": ["high-rise", "residential"],
        })
        self.assertIn("modern apartment", text)
        self.assertIn("urban building", text)
        self.assertIn("high rise", text)
        self.assertIn("residential", text)

    def test_malformed_tags_do_not_break_discovery(self):
        text = searchable_text({"name": "Oak Tree", "tags": "not-a-list"})
        self.assertEqual(hits(text, ROLE_TERMS["vegetation"]), ["tree"])



    def test_modular_facade_is_rejected_as_a_building_candidate(self):
        asset = {
            "name": "Modular Urban Apartments Facade",
            "category": "Architecture/Facades & Modules/Building Facades",
            "categories": ["buildings"],
        }
        self.assertEqual(building_screen(asset), "reject-component-or-modular-title")

    def test_whole_building_title_still_requires_review_and_import(self):
        asset = {
            "name": "Modern Residential Tower",
            "category": "Architecture/Buildings",
            "categories": ["buildings"],
        }
        self.assertEqual(
            building_screen(asset),
            "candidate-needs-dimensions-visual-and-unity-import-review",
        )

    def test_non_architecture_prop_is_not_a_building_candidate(self):
        asset = {
            "name": "City Bench",
            "category": "Furniture/Seating/Benches",
        }
        self.assertEqual(building_screen(asset), "not-building-category")

    def test_city_coverage_keeps_all_nine_cities_and_separates_possible_matches(self):
        coverage = summarize_city_coverage([{
            "possible_city_theme_matches": {"SolsticeBay": ["coastal"]},
            "roles": {"vegetation": ["tree"]},
            "building_screen": "not-whole-building-title",
        }])
        self.assertEqual(set(coverage), set(CITY_THEMES))
        self.assertEqual(coverage["SolsticeBay"]["candidate_count"], 1)
        self.assertEqual(coverage["SolsticeBay"]["roles"]["vegetation"], 1)
        self.assertEqual(coverage["VerdantReach"]["candidate_count"], 0)
        self.assertEqual(
            coverage["SolsticeBay"]["unverified_whole_building_screen_candidates"], 0
        )



if __name__ == "__main__":
    unittest.main()
