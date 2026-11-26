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

    def test_provider_building_category_object_is_normalized(self):
        candidate = asset("Glass Office Tower", [24, 62, 20])
        candidate["category"] = {"slug": "buildings", "title": "Buildings & Architecture"}
        self.assertIsNone(discovery.rejection_reason(candidate, "NexusDelta"))
        detail = {
            "title": "Glass Office Tower",
            "category": {"slug": "buildings", "title": "Buildings & Architecture"},
            "description": "realistic exterior office building",
            "tags": [{"slug": "realistic"}, {"slug": "exterior"}],
            "stats": {"sizeMeters": [24, 62, 20]},
        }
        self.assertEqual(acquisition.validate_complete_building(detail, "NexusDelta"),
                         (24.0, 62.0, 20.0))

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

    def test_modular_tag_does_not_reject_a_complete_full_scale_building(self):
        candidate = asset("Modular Residential Building", [18, 24, 16],
                          tags=[{"slug": "realistic"}, {"slug": "exterior"}, {"slug": "modular"}])
        self.assertIsNone(discovery.rejection_reason(candidate, "NexusDelta"))
        detail = {
            "title": "Modular Residential Building",
            "category": "buildings",
            "description": "realistic exterior complete apartment building",
            "tags": [{"slug": "realistic"}, {"slug": "exterior"}, {"slug": "modular"}],
            "stats": {"sizeMeters": [18, 24, 16]},
        }
        self.assertEqual(acquisition.validate_complete_building(detail, "NexusDelta"),
                         (18.0, 24.0, 16.0))

    def test_asset_screening_uses_word_boundaries_for_terms(self):
        self.assertEqual(discovery.words_present("airport terminal", ("port",)), [])
        self.assertEqual(discovery.words_present("wallpaper texture", ("wall",)), [])
        self.assertEqual(discovery.words_present("high-rise office tower", ("high rise",)), ["high rise"])
        self.assertEqual(acquisition.words_present("airport terminal", ("port",)), [])
        self.assertEqual(acquisition.words_present("wallpaper texture", ("wall",)), [])

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

    def test_complete_low_rise_building_can_qualify_at_realistic_scale(self):
        hanok = asset(
            "Hanok Main House (Korean Hanok Village and Street)",
            [11.2, 5.718, 7.963],
            summary="A three bay timber framed hanok house in a Korean village.",
            tags=[{"slug": "realistic"}, {"slug": "exterior"}]
        )
        self.assertIsNone(discovery.rejection_reason(hanok, "SolsticeBay"))

    def test_industrial_laboratory_is_eligible_for_atlas_frontier(self):
        laboratory = asset(
            "Assay laboratory (Ore Processing and Haulage Plant)",
            [14.6, 9.351, 17.87],
            summary="A clad gable assay laboratory in an ore processing and haulage plant.",
            tags=[{"slug": "realistic"}, {"slug": "exterior"}]
        )
        self.assertIsNone(discovery.rejection_reason(laboratory, "AtlasFrontier"))

    def test_city_relevance_rejects_an_unrelated_complete_building(self):
        coastal = asset(
            "Coastal Hotel Building", [18, 12, 14],
            summary="A modern waterfront hotel building with exterior balconies."
        )
        self.assertEqual(discovery.rejection_reason(coastal, "AtlasFrontier"),
                         "insufficient-city-relevance")

    def test_facade_front_asset_is_rejected_even_when_parent_pack_mentions_buildings(self):
        facade = asset(
            "Chandlery Front (Marina and Yacht Club)", [6.004, 4.201, 1.6],
            summary="Marina chandlery shop front: a rendered wall with a full height glazed display."
        )
        self.assertEqual(discovery.rejection_reason(facade, "MonsoonHarbour"),
                         "non-building-object-title")

    def test_acquisition_rechecks_low_rise_hanok_for_solsticebay(self):
        detail = {
            "title": "Hanok Main House (Korean Hanok Village and Street)",
            "category": "buildings",
            "description": "A three bay timber framed hanok house in a Korean village.",
            "tags": [{"slug": "realistic"}, {"slug": "exterior"}],
            "stats": {"sizeMeters": [11.2, 5.718, 7.963]},
        }
        self.assertEqual(
            acquisition.validate_complete_building(detail, "SolsticeBay"),
            (11.2, 5.718, 7.963),
        )

    def test_acquisition_rechecks_industrial_laboratory_for_atlasfrontier(self):
        detail = {
            "title": "Assay laboratory (Ore Processing and Haulage Plant)",
            "category": "buildings",
            "description": "A clad gable assay laboratory in an ore processing and haulage plant.",
            "tags": [{"slug": "realistic"}, {"slug": "exterior"}],
            "stats": {"sizeMeters": [14.6, 9.351, 17.87]},
        }
        self.assertEqual(
            acquisition.validate_complete_building(detail, "AtlasFrontier"),
            (14.6, 9.351, 17.87),
        )

    def test_acquisition_rejects_buildings_unrelated_to_the_target_city(self):
        detail = {
            "title": "Coastal Hotel Building",
            "category": "buildings",
            "description": "A modern waterfront hotel building with exterior balconies.",
            "tags": [{"slug": "realistic"}, {"slug": "exterior"}],
            "stats": {"sizeMeters": [18, 12, 14]},
        }
        with self.assertRaisesRegex(ValueError, "not relevant to the target city"):
            acquisition.validate_complete_building(detail, "AtlasFrontier")

    def test_discovery_rejects_forecourt_canopy_and_shed_bay_components(self):
        for title in [
            "Forecourt canopy section, amber livery (Petrol Station and Forecourt Shop)",
            "Fabrication shed bay, 4 m (Shipyard and Dry Dock)",
        ]:
            candidate = asset(title, [8.78, 7.45, 4.002],
                              summary="realistic exterior building")
            self.assertEqual(discovery.rejection_reason(candidate, "MonsoonHarbour"),
                             "non-building-object-title", title)

    def test_acquisition_rejects_forecourt_canopy_and_shed_bay_components(self):
        for title in [
            "Forecourt canopy section, amber livery (Petrol Station and Forecourt Shop)",
            "Fabrication shed bay, 4 m (Shipyard and Dry Dock)",
        ]:
            detail = {
                "title": title, "category": "buildings",
                "description": "realistic exterior building",
                "tags": [{"slug": "realistic"}, {"slug": "exterior"}],
                "stats": {"sizeMeters": [8.78, 7.45, 4.002]},
            }
            with self.assertRaisesRegex(ValueError, "non-building object"):
                acquisition.validate_complete_building(detail, "MonsoonHarbour")

    def test_acquisition_rejects_facade_only_front_assets(self):
        detail = {
            "title": "Chandlery Front (Marina and Yacht Club)",
            "category": "buildings",
            "description": "Marina chandlery shop front: a rendered wall with a full height glazed display.",
            "tags": [{"slug": "realistic"}, {"slug": "exterior"}],
            "stats": {"sizeMeters": [6.004, 4.201, 1.6]},
        }
        with self.assertRaisesRegex(ValueError, "non-building object"):
            acquisition.validate_complete_building(detail, "MonsoonHarbour")

    def test_acquisition_validates_complete_glb_2_binary_and_checksum(self):
        import hashlib
        import struct
        document = b'{"asset":{"version":"2.0"},"scenes":[{"nodes":[]}]}'
        document += b" " * ((4 - len(document) % 4) % 4)
        total = 12 + 8 + len(document)
        binary = (b"glTF" + struct.pack("<II", 2, total) +
                  struct.pack("<II", len(document), 0x4E4F534A) + document)
        digest = hashlib.sha256(binary).hexdigest()
        self.assertEqual(acquisition.verify_glb(binary, digest), digest)
        with self.assertRaisesRegex(ValueError, "version-2"):
            acquisition.verify_glb(binary[:8] + struct.pack("<I", total - 1) + binary[12:])
        with self.assertRaisesRegex(ValueError, "SHA-256"):
            acquisition.verify_glb(binary, "0" * 64)
        with self.assertRaises(ValueError):
            acquisition.verify_glb(b"glTF" + b"\x00" * 8)

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


class CityArchitectureDiscoveryExpansionTests(unittest.TestCase):
    def test_every_city_has_targeted_fallback_queries_without_relaxing_acceptance(self):
        self.assertEqual(set(discovery.FALLBACK_QUERIES), set(discovery.CITY_RELEVANCE))
        self.assertTrue(all(len(queries) >= 4 for queries in discovery.FALLBACK_QUERIES.values()))
        self.assertEqual(discovery.MIN_HEIGHT_M, 5.0)
        self.assertEqual(discovery.ECLIPSE_MIN_HEIGHT_M, 35.0)

    def test_underfilled_city_search_checks_two_broad_pages_per_query(self):
        self.assertEqual(discovery.BROADEN_MAX_PAGES, 2)

    def test_catalogue_get_retries_rate_limit_and_honours_retry_after(self):
        from email.message import Message
        from unittest.mock import patch
        import urllib.error
        import io

        headers = Message()
        headers["Retry-After"] = "3"
        throttled = urllib.error.HTTPError(
            "https://3dassets.dev/api/v1/assets", 429, "rate limited", headers, io.BytesIO()
        )
        class Response:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self):
                return b'{"data": []}'

        with patch.object(discovery.urllib.request, "urlopen",
                          side_effect=[throttled, Response()]) as request, \
             patch.object(discovery.time, "sleep") as sleep:
            self.assertEqual(discovery.get("https://3dassets.dev/api/v1/assets"), {"data": []})
        self.assertEqual(request.call_count, 2)
        sleep.assert_called_once_with(3.0)

    def test_catalogue_get_retries_incomplete_chunked_response(self):
        from unittest.mock import patch
        import http.client

        class BrokenResponse:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self):
                raise http.client.IncompleteRead(b'{"data":')

        class GoodResponse:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                return False
            def read(self):
                return b'{"data": []}'

        with patch.object(discovery.urllib.request, "urlopen",
                          side_effect=[BrokenResponse(), GoodResponse()]) as request, \
             patch.object(discovery.time, "sleep") as sleep:
            self.assertEqual(discovery.get("https://3dassets.dev/api/v1/assets"), {"data": []})
        self.assertEqual(request.call_count, 2)
        sleep.assert_called_once_with(1.5)

    def test_catalogue_get_does_not_retry_permanent_client_errors(self):
        from unittest.mock import patch
        import urllib.error
        import io

        failure = urllib.error.HTTPError(
            "https://3dassets.dev/api/v1/assets", 404, "not found", {}, io.BytesIO()
        )
        with patch.object(discovery.urllib.request, "urlopen", side_effect=failure) as request, \
             patch.object(discovery.time, "sleep") as sleep:
            with self.assertRaises(urllib.error.HTTPError):
                discovery.get("https://3dassets.dev/api/v1/assets")
        request.assert_called_once()
        sleep.assert_not_called()

    def test_broad_search_visits_multiple_queries_and_stops_at_candidate_target(self):
        from unittest.mock import patch
        from urllib.parse import parse_qs, urlparse

        def building(slug):
            return {
                "slug": slug,
                "title": "Glass Office Tower",
                "summary": "Modern urban glass commercial building exterior",
                "category": "buildings",
                "tags": [{"slug": "realistic"}, {"slug": "exterior"}],
                "stats": {"sizeMeters": [24, 62, 20], "fileSize": 250000},
            }

        requested = []
        def fake_get(url):
            params = parse_qs(urlparse(url).query)
            query = params["q"][0]
            requested.append(query)
            offset = 0 if query == "first" else 15
            return {"data": [building(f"{query}-{i}") for i in range(offset, offset + 15)]}

        candidates, diagnostics = {}, []
        with patch.object(discovery, "get", side_effect=fake_get):
            added = discovery.broaden_city_candidates(
                "NexusDelta", ["first", "second", "third"], candidates, set(),
                diagnostics, target_candidates=30, max_pages_per_query=3
            )

        self.assertEqual(added, 30)
        self.assertEqual(requested, ["first", "second"])
        self.assertEqual(len(candidates), 30)
        self.assertEqual(len(diagnostics), 2)
        self.assertTrue(all(item["search_mode"] == "broad-underfill-retry"
                            for item in diagnostics))

    def test_broad_search_checks_next_page_when_provider_returns_full_page(self):
        from unittest.mock import patch
        from urllib.parse import parse_qs, urlparse

        requested_pages = []
        def fake_get(url):
            page = int(parse_qs(urlparse(url).query)["page"][0])
            requested_pages.append(page)
            # Nonqualifying records force the helper to inspect subsequent pages.
            return {"data": [
                {"slug": f"prop-{page}-{i}", "title": "Garden Bench",
                 "category": "props", "tags": [], "stats": {}}
                for i in range(100 if page < 3 else 5)
            ]}

        candidates, diagnostics = {}, []
        with patch.object(discovery, "get", side_effect=fake_get):
            discovery.broaden_city_candidates(
                "NexusDelta", ["one"], candidates, set(), diagnostics,
                target_candidates=30, max_pages_per_query=3
            )

        self.assertEqual(requested_pages, [1, 2, 3])
        self.assertEqual(len(candidates), 205)
        self.assertEqual(diagnostics[0]["pages_checked"], [
            {"page": 1, "result_count": 100},
            {"page": 2, "result_count": 100},
            {"page": 3, "result_count": 5},
        ])


    def test_global_allocator_preserves_coverage_when_cities_share_candidates(self):
        shared = {
            "slug": "shared-waterfront-office",
            "relevance_score": 20,
            "mobile_cost_score": 5,
        }
        solstice_only = {
            "slug": "solstice-coastal-hotel",
            "relevance_score": 15,
            "mobile_cost_score": 8,
        }
        allocations = discovery.allocate_unique_city_candidates({
            "SolsticeBay": [shared, solstice_only],
            "MonsoonHarbour": [shared],
        }, per_city=1)
        self.assertEqual(
            {city: [item["slug"] for item in items]
             for city, items in allocations.items()},
            {
                "MonsoonHarbour": ["shared-waterfront-office"],
                "SolsticeBay": ["solstice-coastal-hotel"],
            }
        )

    def test_global_allocator_enforces_unique_assets_and_city_capacity(self):
        pools = {}
        for index, city in enumerate(discovery.CITY_RELEVANCE):
            pools[city] = [{
                "slug": f"building-{index}",
                "relevance_score": 10 + index,
                "mobile_cost_score": index,
            }]
        pools["SolsticeBay"].append(pools["NexusDelta"][0])
        pools["VerdantReach"].append(pools["NexusDelta"][0])
        allocations = discovery.allocate_unique_city_candidates(pools, per_city=1)
        assigned = [
            item["slug"] for items in allocations.values() for item in items
        ]
        self.assertEqual(len(assigned), len(set(assigned)))
        self.assertTrue(all(len(items) <= 1 for items in allocations.values()))
        self.assertEqual(len(assigned), len(discovery.CITY_RELEVANCE))

    def test_global_allocator_is_deterministic_for_identical_inputs(self):
        pools = {
            "SolsticeBay": [
                {"slug": "coastal-hotel", "relevance_score": 12, "mobile_cost_score": 2},
                {"slug": "shared-tower", "relevance_score": 8, "mobile_cost_score": 4},
            ],
            "MonsoonHarbour": [
                {"slug": "shared-tower", "relevance_score": 11, "mobile_cost_score": 3},
                {"slug": "port-terminal", "relevance_score": 10, "mobile_cost_score": 4},
            ],
        }
        def signature(result):
            return {city: [item["slug"] for item in items]
                    for city, items in result.items()}
        self.assertEqual(
            signature(discovery.allocate_unique_city_candidates(pools, 2)),
            signature(discovery.allocate_unique_city_candidates(pools, 2))
        )



if __name__ == "__main__":
    unittest.main()
