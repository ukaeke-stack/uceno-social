import hashlib
import tempfile
import unittest
from pathlib import Path

from scripts.validate_city_asset_provenance import (
    CATEGORY_COUNTS, ProvenanceError, validate_manifest_records, validate_record,
)


class CityAssetProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / "unity/UCENOVirtualWorld/Assets/UCENO/Cities/atlas/Source/Editor"
        self.source.mkdir(parents=True)
        self.archive = self.source / "tower-source.zip"
        self.archive.write_bytes(b"authentic source archive fixture")
        self.license = self.source / "LICENSE.txt"
        self.license.write_text("Creative Commons Attribution 4.0 International (CC-BY 4.0)", encoding="utf-8")
        self.record = {
            "prefab": "Assets/UCENO/Cities/atlas/Prefabs/Architecture/tower.prefab",
            "sourceName": "Test Tower Asset",
            "sourceUrl": "https://example.org/assets/tower",
            "license": "CC-BY 4.0",
            "attribution": "Example artist",
            "sourceArchive": "Assets/UCENO/Cities/atlas/Source/Editor/tower-source.zip",
            "sourceArchiveSha256": hashlib.sha256(self.archive.read_bytes()).hexdigest(),
            "licenseFile": "Assets/UCENO/Cities/atlas/Source/Editor/LICENSE.txt",
            "licenseFileSha256": hashlib.sha256(self.license.read_bytes()).hexdigest(),
        }

    def tearDown(self):
        self.temp.cleanup()

    def test_accepts_retained_archive_and_matching_license_document(self):
        validate_record(self.root, "atlas", self.record)

    def test_rejects_archive_hash_mismatch(self):
        self.record["sourceArchiveSha256"] = "0" * 64
        with self.assertRaisesRegex(ProvenanceError, "SHA-256 mismatch"):
            validate_record(self.root, "atlas", self.record)

    def test_rejects_license_document_that_does_not_prove_declared_license(self):
        self.license.write_text("All rights reserved", encoding="utf-8")
        self.record["licenseFileSha256"] = hashlib.sha256(self.license.read_bytes()).hexdigest()
        with self.assertRaisesRegex(ProvenanceError, "does not identify"):
            validate_record(self.root, "atlas", self.record)

    def test_rejects_path_traversal_outside_city_source_folder(self):
        self.record["sourceArchive"] = "Assets/UCENO/Cities/atlas/Source/Editor/../../../../../../outside.zip"
        with self.assertRaisesRegex(ProvenanceError, "missing or unsafe"):
            validate_record(self.root, "atlas", self.record)


    def test_rejects_traversal_out_of_editor_evidence_folder(self):
        retained_elsewhere = self.source.parent / "outside-editor.zip"
        retained_elsewhere.write_bytes(b"not editor evidence")
        self.record["sourceArchive"] = "Assets/UCENO/Cities/atlas/Source/Editor/../outside-editor.zip"
        self.record["sourceArchiveSha256"] = hashlib.sha256(retained_elsewhere.read_bytes()).hexdigest()
        with self.assertRaisesRegex(ProvenanceError, "missing or unsafe"):
            validate_record(self.root, "atlas", self.record)

    def test_rejects_noncommercial_or_unknown_license(self):
        self.record["license"] = "CC-BY-NC 4.0"
        with self.assertRaisesRegex(ProvenanceError, "unapproved licence"):
            validate_record(self.root, "atlas", self.record)

    def test_rejects_non_https_source(self):
        self.record["sourceUrl"] = "http://example.org/assets/tower"
        with self.assertRaisesRegex(ProvenanceError, "absolute HTTPS"):
            validate_record(self.root, "atlas", self.record)

    def test_rejects_prefab_outside_city_owned_folder(self):
        self.record["prefab"] = "Assets/UCENO/Cities/verdant/Prefabs/Architecture/tree.prefab"
        with self.assertRaisesRegex(ProvenanceError, "city-owned"):
            validate_record(self.root, "atlas", self.record)

    def test_rejects_unsupported_prefab_category(self):
        self.record["prefab"] = "Assets/UCENO/Cities/atlas/Prefabs/Misc/tower.prefab"
        with self.assertRaisesRegex(ProvenanceError, "unsupported prefab category"):
            validate_record(self.root, "atlas", self.record)

    def test_requires_exact_5_4_3_category_distribution(self):
        records = []
        for category, count in CATEGORY_COUNTS.items():
            for index in range(count):
                record = dict(self.record)
                record["prefab"] = f"Assets/UCENO/Cities/atlas/Prefabs/{category}/asset-{category}-{index}.prefab"
                records.append(record)
        self.assertEqual(validate_manifest_records(self.root, "atlas", records), 12)
        records[-1] = dict(records[-1], prefab="Assets/UCENO/Cities/atlas/Prefabs/Environment/extra-tree.prefab")
        with self.assertRaisesRegex(ProvenanceError, "expected 5 architecture"):
            validate_manifest_records(self.root, "atlas", records)


if __name__ == "__main__":
    unittest.main()
