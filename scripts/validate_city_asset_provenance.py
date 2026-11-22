#!/usr/bin/env python3
"""Verify retained source archives and licence documents for imported city prefabs."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

ALLOWED_LICENSES = {"CC0 1.0", "CC-BY 4.0", "CC-BY 3.0", "CC-BY-SA 4.0", "CC-BY-SA 3.0"}
CITY_IDS = ("solstice", "verdant", "nexus", "aurora", "saffron", "monsoon", "eclipse", "origin", "atlas")


class ProvenanceError(ValueError):
    pass


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def evidence_file(project_root: Path, city_id: str, relative: str, kind: str) -> Path:
    prefix = f"Assets/UCENO/Cities/{city_id}/Source/"
    if not isinstance(relative, str) or not relative.startswith(prefix):
        raise ProvenanceError(f"{city_id}: {kind} must be retained under {prefix}")
    unity_root = (project_root / "unity/UCENOVirtualWorld").resolve()
    candidate = (unity_root / relative).resolve()
    evidence_root = (unity_root / prefix).resolve()
    if not candidate.is_relative_to(evidence_root) or not candidate.is_file():
        raise ProvenanceError(f"{city_id}: missing or unsafe {kind}: {relative}")
    return candidate


def validate_record(project_root: Path, city_id: str, record: dict) -> None:
    prefab = record.get("prefab", "<unknown>")
    license_id = str(record.get("license", "")).strip()
    if license_id not in ALLOWED_LICENSES:
        raise ProvenanceError(f"{city_id}: unapproved licence for {prefab}")
    source = urlparse(str(record.get("sourceUrl", "")))
    if source.scheme != "https" or not source.netloc:
        raise ProvenanceError(f"{city_id}: source URL must be absolute HTTPS for {prefab}")
    for field in ("sourceName", "attribution"):
        if not str(record.get(field, "")).strip():
            raise ProvenanceError(f"{city_id}: missing {field} for {prefab}")
    for path_field, hash_field, label in (
        ("sourceArchive", "sourceArchiveSha256", "original source archive"),
        ("licenseFile", "licenseFileSha256", "licence document"),
    ):
        path = evidence_file(project_root, city_id, record.get(path_field), label)
        expected = str(record.get(hash_field, "")).lower()
        if len(expected) != 64 or any(ch not in "0123456789abcdef" for ch in expected):
            raise ProvenanceError(f"{city_id}: invalid {label} SHA-256 for {prefab}")
        if sha256_file(path) != expected:
            raise ProvenanceError(f"{city_id}: {label} SHA-256 mismatch for {prefab}")
        if label == "licence document":
            text = path.read_text(encoding="utf-8", errors="replace")
            if license_id.casefold() not in text.casefold():
                raise ProvenanceError(f"{city_id}: licence document does not identify {license_id} for {prefab}")


def validate_city(project_root: Path, city_id: str) -> int:
    city_root = project_root / "unity/UCENOVirtualWorld/Assets/UCENO/Cities" / city_id
    manifest_path = city_root / "source-manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ProvenanceError(f"{city_id}: cannot read source manifest: {error}") from error
    records = manifest.get("assets")
    if not isinstance(records, list) or len(records) != 12:
        raise ProvenanceError(f"{city_id}: source manifest must contain exactly 12 records")
    prefab_paths = [record.get("prefab") if isinstance(record, dict) else None for record in records]
    if any(not isinstance(path, str) or not path for path in prefab_paths):
        raise ProvenanceError(f"{city_id}: source manifest contains an invalid prefab path")
    if len(set(prefab_paths)) != 12:
        raise ProvenanceError(f"{city_id}: source manifest contains duplicate prefab paths")
    for record in records:
        validate_record(project_root, city_id, record)
    return len(records)


def validate_all(project_root: Path) -> int:
    return sum(validate_city(project_root, city_id) for city_id in CITY_IDS)


if __name__ == "__main__":
    import argparse
    import sys
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="UCENO repository root")
    args = parser.parse_args()
    try:
        count = validate_all(args.root.resolve())
    except ProvenanceError as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
    print(f"PASS: retained archive and licence evidence verified for {count} city prefab records.")
