#!/usr/bin/env python3
"""Acquire nine distinct CC0 Poly Haven HDRIs into the exact Unity profile paths.

Downloads are accepted only after the live catalogue/file API supplies a
verifiable 1K Radiance HDR URL and MD5. The profile IDs and output paths are
checked before network access; no city is silently renamed or mapped elsewhere.
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import re
import os
import tempfile
import urllib.request

API = "https://api.polyhaven.com"
ROOT = pathlib.Path("unity/UCENOVirtualWorld/Assets/UCENO/Cities")
PROFILES = pathlib.Path(
    "unity/UCENOVirtualWorld/Assets/UCENO/Editor/city-scene-asset-profiles.json"
)
UA = "UCENO-VirtualWorld-AssetPipeline/1.1 (CC0 asset acquisition)"

CITIES = {
    "solstice": {
        "label": "Solstice Bay",
        "terms": ["waterfront", "harbour", "harbor", "river", "skyline", "city", "urban"],
        "preferred": ["docklands_02"],
    },
    "verdant": {
        "label": "Verdant Reach",
        "terms": ["sunset", "skyline", "city", "urban", "building", "architecture"],
        "preferred": ["sunset_jhbcentral"],
    },
    "nexus": {
        "label": "Nexus Delta",
        "terms": ["skyscraper", "skyline", "modern", "urban", "city", "glass"],
        "preferred": ["modern_buildings_night"],
    },
    "aurora": {
        "label": "Aurora Heights",
        "terms": ["city", "urban", "street", "building", "plaza", "skyline"],
        "preferred": ["potsdamer_platz"],
    },
    "saffron": {
        "label": "Saffron Dunes",
        "terms": ["city", "urban", "street", "architecture", "building", "dusk"],
        "preferred": ["modern_evening_street"],
    },
    "monsoon": {
        "label": "Monsoon Harbour",
        "terms": ["harbour", "harbor", "docklands", "river", "waterfront", "city", "urban"],
        "preferred": ["shanghai_bund"],
    },
    "eclipse": {
        "label": "Eclipse Central",
        "terms": ["night", "evening", "city", "urban", "street", "skyline", "neon"],
        "preferred": ["hansaplatz"],
    },
    "origin": {
        "label": "Origin Plains",
        "terms": ["sunset", "skyline", "city", "street", "urban", "building"],
        "preferred": ["wide_street_01"],
    },
    "atlas": {
        "label": "Atlas Frontier",
        "terms": ["industrial", "city", "urban", "street", "architecture", "building"],
        "preferred": ["wide_street_02"],
    },
}


def as_words(value):
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [str(item) for item in value]
    return []


def get_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read())


def download_and_verify(url, path, expected_md5, expected_size):
    """Download beside the destination, validate completely, then atomically publish."""
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    md5 = hashlib.md5()
    sha256 = hashlib.sha256()
    fd, temporary_name = tempfile.mkstemp(
        prefix=path.name + ".", suffix=".partial", dir=path.parent
    )
    temporary = pathlib.Path(temporary_name)
    actual_size = 0
    try:
        with os.fdopen(fd, "wb") as output, urllib.request.urlopen(request, timeout=180) as response:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                output.write(chunk)
                md5.update(chunk)
                sha256.update(chunk)
                actual_size += len(chunk)
            output.flush()
            os.fsync(output.fileno())

        if md5.hexdigest().lower() != expected_md5.lower():
            raise RuntimeError(f"MD5 mismatch for {path.name}")
        if actual_size != int(expected_size):
            raise RuntimeError(
                f"Size mismatch for {path.name}: expected {expected_size}, received {actual_size}"
            )
        with temporary.open("rb") as stream:
            header = stream.read(512)
        if not header.startswith(b"#?RADIANCE") and not header.startswith(b"#?RGBE"):
            raise RuntimeError(f"Downloaded file is not a Radiance HDR panorama: {path.name}")
        resolution = re.search(rb"(?m)^-Y\s+(\d+)\\s+\\+X\\s+(\\d+)\\s*$", header)
        if not resolution:
            raise RuntimeError(f"Unsupported or missing Radiance HDR resolution header: {path.name}")
        height, width = map(int, resolution.groups())
        if width < 1024 or height < 512 or not 1.8 <= width / height <= 2.2:
            raise RuntimeError(f"Unexpected HDRI dimensions for {path.name}: {width}x{height}")

        os.replace(temporary, path)
        return {
            "md5": md5.hexdigest(),
            "sha256": sha256.hexdigest(),
            "size": actual_size,
            "width": width,
            "height": height,
        }
    finally:
        temporary.unlink(missing_ok=True)


profiles = json.loads(PROFILES.read_text(encoding="utf-8"))
profile_ids = {entry.get("cityId") for entry in profiles.get("cities", [])}
if len(CITIES) != 9 or set(CITIES) != profile_ids:
    raise RuntimeError(
        f"City/profile mismatch: acquisition={sorted(CITIES)}, profiles={sorted(profile_ids)}"
    )

assets = get_json(API + "/assets?type=hdris")
used_asset_ids = set()
summary = []

for city_id, config in CITIES.items():
    candidates = []
    for asset_id, item in assets.items():
        attributes = item.get("attributes") or {}
        tags = as_words(item.get("tags")) + as_words(item.get("categories"))
        searchable = " ".join([
            asset_id,
            str(item.get("name") or ""),
            str(item.get("description") or ""),
            str(item.get("category") or ""),
            *tags,
        ]).lower()

        if not item.get("category"):
            continue
        if attributes.get("environment") == "indoor":
            continue
        # Urban street panoramas often have an intentionally obstructed sky.
        # That is valid for city backdrops and must not exclude real streets.

        score = sum(3 for term in config["terms"] if term in searchable)
        if asset_id in config["preferred"]:
            score += 100
        if score:
            candidates.append((score, asset_id, item))

    candidates.sort(key=lambda candidate: (-candidate[0], candidate[1]))
    chosen = next(
        (candidate for candidate in candidates if candidate[1] not in used_asset_ids),
        None,
    )
    if chosen is None:
        raise RuntimeError(
            f"No distinct preferred urban-city HDRI candidate for {config['label']}; refusing non-city substitution"
        )

    _, asset_id, item = chosen
    files = get_json(f"{API}/files/{asset_id}")
    variant = (files.get("hdri") or {}).get("1k", {}).get("hdr")
    if not variant or not variant.get("url") or not variant.get("md5"):
        raise RuntimeError(f"{asset_id} has no verifiable 1K Radiance HDR download")
    if variant.get("size", 0) > 20_000_000:
        raise RuntimeError(f"{asset_id} 1K HDR exceeds the 20 MB acquisition cap")

    skybox_dir = ROOT / city_id / "Textures" / "Skybox"
    skybox_dir.mkdir(parents=True, exist_ok=True)
    target = skybox_dir / f"{city_id}_environment.hdr"
    verification = download_and_verify(
        variant["url"], target, variant["md5"], variant["size"]
    )
    actual_md5 = verification["md5"]
    actual_sha256 = verification["sha256"]
    actual_size = verification["size"]
    width = verification["width"]
    height = verification["height"]

    used_asset_ids.add(asset_id)
    record = {
        "city_id": city_id,
        "city_label": config["label"],
        "asset_id": asset_id,
        "name": item.get("name"),
        "creator_contributions": item.get("authors", {}),
        "source_page": f"https://polyhaven.com/a/{asset_id}",
        "api_file_url": variant["url"],
        "license": "CC0 1.0",
        "license_url": "https://polyhaven.com/license",
        "api_terms": "https://polyhaven.com/our-api",
        "format": "Radiance HDR (.hdr)",
        "resolution_tier": "1k",
        "expected_size_bytes": variant.get("size"),
        "verified_md5": actual_md5,
        "verified_sha256": actual_sha256,
        "actual_size_bytes": actual_size,
        "width": width,
        "height": height,
        "file": target.as_posix(),
        "catalogue_description": item.get("description"),
        "category": item.get("category"),
        "tags": as_words(item.get("tags")),
        "acquisition_status": "downloaded-and-md5-verified",
        "unity_import_status": "not-yet-imported",
        "visual_acceptance_status": "pending",
    }
    (skybox_dir / "hdri-provenance.json").write_text(
        json.dumps(record, indent=2) + "\n", encoding="utf-8"
    )
    summary.append(record)
    print(f"ACQUIRED {city_id}: {asset_id} ({target.stat().st_size} bytes)")

if len(summary) != 9 or len(used_asset_ids) != 9:
    raise RuntimeError("Nine distinct city panoramas were not acquired")

print("Acquired and MD5-verified nine distinct city HDRIs at the Unity profile paths.")
print("STATUS: downloaded and checksum-verified; Unity import and visual acceptance remain pending.")
