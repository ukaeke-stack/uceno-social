#!/usr/bin/env python3
"""Acquire nine distinct, city-matched CC0 Poly Haven HDR panoramas.

The script downloads real 1K Radiance HDR files, verifies the API-provided MD5,
and writes per-city provenance. It deliberately fails closed if a city has no
suitable distinct candidate or a downloadable 1K HDR variant.
"""
from __future__ import annotations
import hashlib, json, os, pathlib, urllib.request

API = "https://api.polyhaven.com"
ROOT = pathlib.Path("unity/UCENOVirtualWorld/Assets/UCENO/Cities")
UA = "UCENO-VirtualWorld-AssetPipeline/1.0 (CC0 asset acquisition)"
CITIES = {
    "SolsticeBay": ["coast", "beach", "harbour", "harbor", "water", "pier"],
    "VerdantReach": ["garden", "forest", "park", "woodland", "greenhouse"],
    "NexusDelta": ["modern", "urban", "street", "building", "city"],
    "AuroraHeights": ["mountain", "alps", "hill", "snow", "highland"],
    "SaffronDunes": ["desert", "arid", "dune", "sand", "valley"],
    "MonsoonHarbour": ["cloudy", "overcast", "coast", "pier", "harbour", "harbor"],
    "EclipseCentral": ["night", "evening", "street", "city", "urban"],
    "OriginPlains": ["grassland", "field", "countryside", "meadow", "garden"],
    "AtlasFrontier": ["industrial", "factory", "terminal", "rail", "warehouse"],
}
PREFERRED_IDS = {
    "SolsticeBay": ["small_harbour_sunset", "alkantstrand_breakwater_beach"],
    "VerdantReach": ["suburban_garden", "sunny_rose_garden"],
    "NexusDelta": ["modern_buildings", "modern_buildings_2"],
    "AuroraHeights": ["alps_field", "lilienstein"],
    "SaffronDunes": ["valley_of_desolation", "goegap_road"],
    "MonsoonHarbour": ["durban_pier_dawn", "salt_rock_beach_cloudy"],
    "EclipseCentral": ["modern_evening_street", "rogland_clear_night"],
    "OriginPlains": ["grasslands_sunset", "suburban_garden"],
    "AtlasFrontier": ["overcast_industrial_courtyard", "industrial_sunset_pure_sky"],
}

def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

def download(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    h = hashlib.md5()
    with urllib.request.urlopen(req, timeout=180) as r, path.open("wb") as out:
        while True:
            chunk = r.read(1024 * 1024)
            if not chunk: break
            out.write(chunk); h.update(chunk)
    return h.hexdigest()

assets = get_json(API + "/assets?type=hdris")
used = set()
summary = []
for city, terms in CITIES.items():
    candidates = []
    for asset_id, item in assets.items():
        haystack = " ".join([
            asset_id, item.get("name", ""), item.get("description", ""),
            item.get("category", ""), " ".join(item.get("tags", [])),
            " ".join(item.get("categories", []))
        ]).lower()
        if not item.get("category") or item.get("attributes", {}).get("environment") == "indoor":
            continue
        if item.get("attributes", {}).get("sky_view") == "obstructed":
            continue
        score = sum(3 for term in terms if term in haystack)
        if asset_id in PREFERRED_IDS.get(city, []): score += 100
        if score: candidates.append((score, asset_id, item))
    candidates.sort(key=lambda x: (-x[0], x[1]))
    chosen = next((x for x in candidates if x[1] not in used), None)
    if not chosen:
        raise RuntimeError(f"No distinct outdoor HDRI candidate for {city}; refusing to fabricate an assignment")
    _, asset_id, item = chosen
    files = get_json(f"{API}/files/{asset_id}")
    variants = files.get("hdri", {})
    variant = variants.get("1k", {}).get("hdr")
    if not variant or not variant.get("url") or not variant.get("md5"):
        raise RuntimeError(f"{asset_id} has no verifiable 1K Radiance HDR download")
    if variant.get("size", 0) > 20_000_000:
        raise RuntimeError(f"{asset_id} 1K HDR exceeds the 20 MB acquisition cap")
    folder = ROOT / city / "Environment"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"{asset_id}_1k.hdr"
    actual_md5 = download(variant["url"], target)
    if actual_md5.lower() != variant["md5"].lower():
        target.unlink(missing_ok=True)
        raise RuntimeError(f"MD5 mismatch for {asset_id}")
    used.add(asset_id)
    record = {
        "city": city, "asset_id": asset_id, "name": item.get("name"),
        "creator_contributions": item.get("authors", {}),
        "source_page": f"https://polyhaven.com/a/{asset_id}",
        "api_file_url": variant["url"], "license": "CC0 1.0",
        "license_url": "https://polyhaven.com/license",
        "api_terms": "https://polyhaven.com/our-api",
        "format": "Radiance HDR (.hdr)", "resolution_tier": "1k",
        "expected_size_bytes": variant.get("size"),
        "verified_md5": actual_md5, "file": target.as_posix(),
        "catalogue_description": item.get("description"),
        "category": item.get("category"), "tags": item.get("tags", []),
        "acquisition_status": "downloaded-and-md5-verified",
        "unity_import_status": "not-yet-imported",
        "visual_acceptance_status": "pending",
    }
    (folder / "hdri-provenance.json").write_text(json.dumps(record, indent=2) + "\n")
    summary.append(record)
    print(f"ACQUIRED {city}: {asset_id} ({target.stat().st_size} bytes)")
print(f"Acquired and MD5-verified {len(summary)} distinct city HDRIs.")
