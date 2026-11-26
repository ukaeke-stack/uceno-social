import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "uceno_city_architecture_audit",
    ROOT / "scripts" / "audit-city-architecture-acquisition.py",
)
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


class CityArchitectureSourceQualityTests(unittest.TestCase):
    def test_textureless_valid_binary_is_reported_as_source_quality_blocker(self):
        report = {
            "cities": {
                "SolsticeBay": {
                    "tevy_textured_lod0_count": 2,
                    "tevy_lods": [{"slug": "coastal-house"}, {"slug": "harbour-hotel"}],
                    "3dassets_textured_count": 0,
                    "3dassets_models": [
                        {"slug": "untextured-office", "embedded_image_count": 0},
                        {"slug": "textured-terminal", "embedded_image_count": 2},
                    ],
                }
            }
        }

        result = audit.source_quality_summary(report)

        self.assertEqual(result["verified_source_models"], 4)
        self.assertEqual(result["models_with_embedded_textures"], 2)
        self.assertEqual(result["status"], "blocked_texture_evidence")
        self.assertEqual(
            result["textureless_3dassets_models"],
            [{"city": "SolsticeBay", "slug": "untextured-office"}],
        )

    def test_all_models_with_texture_evidence_are_not_misreported_as_blocked(self):
        report = {
            "cities": {
                "AuroraHeights": {
                    "tevy_textured_lod0_count": 1,
                    "tevy_lods": [{"slug": "alpine-hotel"}],
                    "3dassets_textured_count": 1,
                    "3dassets_models": [
                        {"slug": "mountain-village", "embedded_image_count": 3}
                    ],
                }
            }
        }

        result = audit.source_quality_summary(report)

        self.assertEqual(result["verified_source_models"], 2)
        self.assertEqual(result["models_with_embedded_textures"], 2)
        self.assertEqual(result["textureless_3dassets_models"], [])
        self.assertEqual(result["status"], "textures_present")


if __name__ == "__main__":
    unittest.main()
