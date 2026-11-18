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


def download_and_hash(url, path):
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    digest = hashlib.md5()
    with urllib.request.urlopen(request, timeout=180) as response, path.open("wb") as output:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            output.write(chunk)
            digest.update(chunk)
    return digest.hexdigest()


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
        if score and any(asset_id == preferred_id for preferred_id in config["preferred"]):
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
    actual_md5 = download_and_hash(variant["url"], target)
    if actual_md5.lower() != variant["md5"].lower():
        target.unlink(missing_ok=True)
        raise RuntimeError(f"MD5 mismatch for {asset_id}")

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
