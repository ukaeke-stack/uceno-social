#!/usr/bin/env python3
"""Acquire only complete, full-scale city-building GLBs.

Every live detail record is rechecked for CC0, exterior/realistic tags,
whole-building dimensions and city-specific tower requirements before download.
Binaries remain CI artifacts until geometry/material inspection and Unity import.
"""
import hashlib
import json
import pathlib
import re
import time
import urllib.request

BASE = "https://3dassets.dev/api/v1"
INPUT = pathlib.Path("artifacts/city-architecture-candidates/nine-city-candidates.json")
OUT = pathlib.Path("artifacts/city-architecture-models")
MAX_BYTES = 25 * 1024 * 1024
PER_CITY = 12
MIN_HEIGHT_M = 8.0
MIN_FOOTPRINT_M = 4.0
MIN_HORIZONTAL_SPAN_M = 4.0
ECLIPSE_MIN_HEIGHT_M = 35.0
UA = "UCENO-city-architecture-acquisition/2.0"
PART_TERMS = (
    "module", "panel", "wall", "slab", "floor tile", "door", "window",
    "column", "beam", "rail", "railing", "stair", "staircase", "roof section",
    "roof slope", "roof cap", "canopy bay", "counter", "bollard", "plinth",
    "trim", "facade panel", "ceiling", "corner block", "gate", "ladder",
    "bulkhead", "paving", "bench", "fence", "barrier", "prop",
)
IRRELEVANT_TERMS = (
    "arctic", "military", "tank", "weapon", "bunker", "missile", "airfield",
    "aircraft", "field camp", "battle royale", "fps kit", "fantasy", "temple",
    "shrine", "medieval", "monastery", "tavern", "guild hall", "kennel",
    "cattery", "cruise ship", "yacht", "ship deck", "jungle temple",
)
TOWER_TERMS = ("skyscraper", "supertall", "high rise", "high-rise", "tower", "office")
WHOLE_BUILDING_TITLE_TERMS = (
    "building", "skyscraper", "tower", "high rise", "high-rise", "office",
    "residential block", "apartment block", "apartment building", "hotel",
    "campus", "terminal", "civic centre", "civic center", "commercial building",
    "mixed use", "mixed-use", "arena", "factory", "house", "school", "hospital",
    "residential building", "apartment", "museum", "library", "city hall",
    "train station", "railway station", "airport terminal", "university", "stadium",
)
NON_BUILDING_TITLE_TERMS = (
    "windmill", "wind turbine", "mill sail", "sculpture", "statue", "fountain",
    "sign", "monument", "bridge", "wall panel", "facade panel", "module", "prop",
)

def request_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))

def unwrap_detail(payload):
    if isinstance(payload, dict) and isinstance(payload.get("data"), dict):
        return payload["data"]
    if isinstance(payload, dict) and payload.get("slug"):
        return payload
    raise RuntimeError("Unexpected asset detail response; refusing to guess response fields")

def get_license(detail):
    info = detail.get("license")
    if isinstance(info, str):
        return info.lower()
    if isinstance(info, dict):
        return str(info.get("id") or info.get("slug") or info.get("name") or "").lower()
    return ""

def tag_slugs(detail):
    tags = detail.get("tags") or []
    return [str(tag.get("slug") or tag.get("title") or "").lower()
            if isinstance(tag, dict) else str(tag).lower() for tag in tags]

def dimensions(detail):
    stats = detail.get("stats") or {}
    dims = stats.get("sizeMeters")
    if isinstance(dims, list) and len(dims) >= 3:
        return tuple(float(dims[i]) for i in range(3))
    box = stats.get("boundingBox") or {}
    low, high = box.get("min"), box.get("max")
    if isinstance(low, list) and isinstance(high, list) and len(low) >= 3 and len(high) >= 3:
        return tuple(float(high[i]) - float(low[i]) for i in range(3))
    return None

def validate_complete_building(detail, city):
    category = detail.get("category")
    if isinstance(category, dict):
        category = category.get("slug") or category.get("title") or category.get("name")
    category_key = re.sub(r"[^a-z]", "", str(category or "").lower())
    if category_key not in {"building", "buildings", "buildingsarchitecture", "architecture"}:
        raise ValueError("Asset category is not a complete building")
    title = detail.get("title") or detail.get("name") or ""
    summary = detail.get("summary") or detail.get("description") or ""
    searchable = re.sub(r"[_-]+", " ", f"{title} {summary}".lower())
    title_searchable = re.sub(r"[_-]+", " ", str(title).lower())
    tags = tag_slugs(detail)
    style = str(detail.get("style") or "").lower()
    if "realistic" not in tags and style != "realistic":
        raise ValueError("Missing realistic style")
    if "exterior" not in tags and "exterior" not in searchable:
        raise ValueError("Not identified as an exterior asset")
    if "modular" in tags:
        raise ValueError("Modular kit part rejected")
    if any(term in title_searchable for term in NON_BUILDING_TITLE_TERMS):
        raise ValueError("Title identifies a prop or non-building object")
    if not any(term in title_searchable for term in WHOLE_BUILDING_TITLE_TERMS):
        raise ValueError("Title does not identify a complete building")
    # Component terms in a descriptive paragraph (e.g. "stone walls and
    # large windows") do not make a complete building a modular part.
    if any(term in title_searchable for term in PART_TERMS):
        raise ValueError("Individual building component or prop rejected")
    if any(term in searchable for term in IRRELEVANT_TERMS):
        raise ValueError("Unrelated theme or setting rejected")
    dims = dimensions(detail)
    if dims is None:
        raise ValueError("Missing real-world dimensions")
    width, height, depth = dims
    if (height < MIN_HEIGHT_M or max(width, depth) < MIN_FOOTPRINT_M or
            min(width, depth) < MIN_HORIZONTAL_SPAN_M):
        raise ValueError(f"Too small or too narrow to be a complete building: dimensions={dims}")
    if city == "EclipseCentral":
        if height < ECLIPSE_MIN_HEIGHT_M:
            raise ValueError(f"Lumen Tower candidate below 35 m: height={height}")
        if not any(term in searchable for term in TOWER_TERMS):
            raise ValueError("Eclipse Central candidate is not a skyscraper/office tower")
    return dims

def main():
    if not INPUT.is_file():
        raise SystemExit(f"Missing discovery report: {INPUT}")
    report = json.loads(INPUT.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "source": "https://3dassets.dev",
        "acquired_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "policy": "live detail revalidation: CC0, realistic exterior, complete-building scale, city-specific tower threshold, <=25MiB and GLB 2.0 header",
        "cities": {},
    }
    seen = set()
    failures = []
    for city, city_data in report.get("cities", {}).items():
        city_dir = OUT / city
        city_dir.mkdir(parents=True, exist_ok=True)
        acquired = []
        for candidate in city_data.get("candidates", []):
            slug = candidate.get("slug")
            if not slug or slug in seen or len(acquired) >= PER_CITY:
                continue
            try:
                detail = unwrap_detail(request_json(f"{BASE}/assets/{slug}"))
                licence = get_license(detail)
                if "cc0" not in licence and "cc0" not in json.dumps(detail.get("license", {})).lower():
                    raise ValueError(f"Licence metadata is not explicitly CC0: {licence or 'missing'}")
                dims = validate_complete_building(detail, city)
                url = detail.get("cdnUrl") or detail.get("cdn_url")
                if not isinstance(url, str) or not url.startswith("https://"):
                    raise ValueError("Asset detail has no HTTPS cdnUrl")
                req = urllib.request.Request(url, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=120) as response:
                    data = response.read(MAX_BYTES + 1)
                if len(data) > MAX_BYTES:
                    raise ValueError(f"GLB exceeds 25 MiB ({len(data)} bytes)")
                if len(data) < 12 or data[:4] != b"glTF":
                    raise ValueError("Downloaded file does not have a GLB 2.0 header")
                digest = hashlib.sha256(data).hexdigest()
                filename = f"{slug}.glb"
                (city_dir / filename).write_bytes(data)
                acquired.append({
                    "slug": slug,
                    "name": detail.get("name") or detail.get("title") or candidate.get("name"),
                    "dimensions_m": list(dims),
                    "file": f"{city}/{filename}",
                    "bytes": len(data),
                    "sha256": digest,
                    "license": detail.get("license"),
                    "source_url": detail.get("url") or f"https://3dassets.dev/assets/{slug}",
                    "cdn_url": url,
                    "stats": detail.get("stats"),
                    "status": detail.get("status"),
                    "geometry_visual_review": "pending",
                    "unity_import_status": "not-imported",
                })
                seen.add(slug)
                print(f"ACQUIRED COMPLETE BUILDING {city}/{filename} ({len(data)} bytes; dimensions={dims})")
            except Exception as exc:
                failures.append({"city": city, "slug": slug, "error": str(exc)})
                print(f"REJECTED {city}/{slug}: {exc}")
        manifest["cities"][city] = acquired
        if not acquired:
            print(f"NO QUALIFYING COMPLETE BUILDING ACQUIRED for {city}")
    manifest["failures"] = failures
    manifest["total_models"] = sum(len(v) for v in manifest["cities"].values())
    (OUT / "acquisition-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Acquired {manifest['total_models']} full-building GLB files across {len(manifest['cities'])} cities")
    if manifest["total_models"] == 0:
        raise SystemExit("No qualifying full-building models acquired; failing rather than reporting success")
    shortfalls = {
        city: len(models) for city, models in manifest["cities"].items()
        if len(models) < PER_CITY
    }
    if shortfalls:
        raise SystemExit(
            f"Incomplete full-building acquisition: each city requires {PER_CITY} "
            f"unique candidates; acquired counts: {shortfalls}. "
            "Partial binaries and rejection evidence remain available for review."
        )

if __name__ == "__main__":
    main()
