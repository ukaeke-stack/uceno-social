import unittest

from scripts.discover_polyhaven_city_assets_v2 import (
    CITY_THEMES, ROLE_TERMS, hits, searchable_text,
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


if __name__ == "__main__":
    unittest.main()
