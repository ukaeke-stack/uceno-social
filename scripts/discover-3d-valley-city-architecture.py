#!/usr/bin/env python3
"""Discover realistic, full-scale CC0 building candidates from 3D Valley.

This is a discovery stage only: it never generates paid assets or downloads GLBs.
Candidates remain unapproved until binary provenance, Unity import and visual QA.
"""
import json
import os
import pathlib
import re
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://3dvalley.com/api/v1"
OUT = pathlib.Path("artifacts/3d-valley-city-architecture")
UA = "UCENO-city-architecture-discovery/1.0"
PAGES_PER_QUERY = 3
MIN_HEIGHT_M = 5.0
MIN_SPAN_M = 4.0
MAX_RESULTS_PER_CITY = 40
API_PAGE_LIMIT = 50  # 3D Valley rejects values above 50.
CATEGORY_PAGE_LIMIT = 100
MAX_CATEGORY_SCAN_PAGES = 40  # 4,000 models; current Buildings inventory is about 3,500.
MAX_RATE_LIMIT_WAIT_SECONDS = 1800  # Never spend more than 30 minutes waiting in a 45-minute CI job.
# Keep the theme-specific searches first, then add shorter catalogue terms.
# The API's semantic search often returns no rows for long compound phrases;
# broad discovery is safe because reject_reason() still enforces CC0, realistic
# style, complete-building title, measured scale and city-theme relevance.
CITIES = {
    "SolsticeBay": ["coastal apartment building exterior", "waterfront hotel building", "island villa building", "harbour terminal building",
                    "coastal building", "waterfront apartment", "villa", "hotel building", "harbour building"],
    "VerdantReach": ["sustainable green residential tower", "botanical research centre building", "eco campus building exterior", "vertical garden office tower",
                     "green building", "sustainable building", "botanical building", "research campus", "eco office"],
    "NexusDelta": ["modern glass skyscraper building", "urban mixed use office tower", "metropolitan apartment building", "modern shopping mall building",
                   "skyscraper", "office tower", "apartment building", "shopping mall", "commercial building"],
    "AuroraHeights": ["alpine resort hotel building", "mountain village apartment building", "timber chalet lodge building", "mountain civic centre building",
                      "alpine building", "mountain lodge", "chalet", "ski resort building", "mountain hotel"],
    "SaffronDunes": ["desert courtyard house building", "oasis hotel building", "adobe cultural centre building", "solar office tower building",
                     "desert building", "courtyard house", "adobe building", "oasis hotel", "solar office"],
    "MonsoonHarbour": ["tropical waterfront apartment building", "port terminal building", "coastal resort hotel building", "harbour market building",
                       "harbour building", "port terminal", "tropical hotel", "waterfront apartment", "coastal market building"],
    "EclipseCentral": ["supertall glass skyscraper building", "35 metre office tower building", "modern metropolitan landmark tower",
                       "skyscraper", "office tower", "commercial tower", "glass high rise"],
    "OriginPlains": ["university campus building", "modern hospital building", "public library building", "research laboratory building",
                     "university building", "hospital", "public library", "school building", "research building"],
    "AtlasFrontier": ["industrial logistics terminal building", "modern factory building", "industrial research laboratory building", "warehouse building exterior",
                      "industrial building", "factory", "warehouse", "workshop building", "logistics terminal"],
}
RELEVANCE = {
    "SolsticeBay": ("coastal", "waterfront", "harbour", "harbor", "marina", "beach", "island", "villa", "apartment", "hotel"),
    "VerdantReach": ("green", "garden", "sustainable", "biophilic", "eco", "campus", "botanical", "university", "research"),
    "NexusDelta": ("skyscraper", "high rise", "tower", "office", "commercial", "mixed use", "urban", "glass", "apartment", "mall"),
    "AuroraHeights": ("alpine", "mountain", "ski", "snow", "resort", "lodge", "chalet", "village", "timber"),
    "SaffronDunes": ("desert", "adobe", "arid", "solar", "oasis", "courtyard", "mudbrick", "sand"),
    "MonsoonHarbour": ("harbour", "harbor", "port", "waterfront", "coastal", "tropical", "marina", "ferry", "island"),
    "EclipseCentral": ("skyscraper", "supertall", "high rise", "tower", "office", "commercial", "skyline"),
    "OriginPlains": ("university", "campus", "school", "library", "museum", "civic", "hospital", "research", "education"),
    "AtlasFrontier": ("industrial", "factory", "warehouse", "hangar", "logistics", "workshop", "manufacturing", "terminal", "laboratory"),
}
BUILDING_TERMS = ("building", "tower", "skyscraper", "high rise", "office", "apartment", "hotel", "house", "villa", "campus", "terminal", "centre", "center", "factory", "warehouse", "laboratory", "library", "hospital", "school", "mall", "market", "lodge", "chalet", "resort", "church", "mosque", "station", "hangar", "workshop", "civic", "museum", "university")
PART_TERMS = ("panel", "wall", "window", "door", "column", "beam", "roof section", "facade", "module", "stair", "floor tile", "prop", "furniture", "bridge", "sculpture", "sign", "fence", "gate", "canopy")

def rate_limit_wait_seconds(headers, response_body, attempt):
    """Respect provider reset metadata instead of retrying a known exhausted quota."""
    delays = []
    retry_after = headers.get("Retry-After", "")
    try:
        if retry_after:
            delays.append(max(0.0, float(retry_after)))
    except (TypeError, ValueError):
        pass
    reset = re.search(r"resets? in\s+(\d+(?:\.\d+)?)\s*s", response_body, re.IGNORECASE)
    if reset:
        delays.append(max(0.0, float(reset.group(1))) + 1.0)
    return max(delays) if delays else float(2 ** attempt)


def request_json(path, params=None, api_key=None):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    headers = {"User-Agent": UA, "Accept": "application/json"}
    if api_key:
        headers["Authorization"] = "Bearer " + api_key
    req = urllib.request.Request(url, headers=headers)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:2000]
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 3:
                raise RuntimeError(
                    f"3D Valley API returned HTTP {exc.code} for {req.full_url}: {detail}"
                ) from exc
            if exc.code == 429:
                delay = rate_limit_wait_seconds(exc.headers, detail, attempt)
                if delay > MAX_RATE_LIMIT_WAIT_SECONDS:
                    raise RuntimeError(
                        f"3D Valley rate limit remains active for {delay:.0f}s, "
                        f"exceeding the {MAX_RATE_LIMIT_WAIT_SECONDS}s CI wait budget; "
                        f"preserving partial evidence and refusing a paid-tier upgrade: {detail}"
                    ) from exc
                print(f"3D Valley rate limit reached; waiting {delay:.0f}s for provider reset")
                time.sleep(delay)
            else:
                retry = exc.headers.get("Retry-After", "")
                try:
                    delay = float(retry) if retry else 2 ** attempt
                except ValueError:
                    delay = 2 ** attempt
                time.sleep(min(delay, 20))
        except (urllib.error.URLError, TimeoutError):
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError("3D Valley request retries exhausted")

def reject_reason(item, city, allow_missing_semantic_match=False):
    if not isinstance(item, dict):
        return "invalid-asset-record"
    if not item.get("id"):
        return "missing-asset-id"
    if item.get("license") != "CC0-1.0":
        return "license-not-explicitly-cc0-1.0"
    if item.get("type") != "model":
        return "not-a-model"
    if item.get("style") != "realistic":
        return "not-realistic-style"
    name_value = item.get("name")
    if not isinstance(name_value, str) or not name_value.strip():
        return "incomplete-asset-metadata"
    name = name_value.lower().replace("_", " ").replace("-", " ")
    # Reject components before testing for a building noun: names such as
    # "Concrete Floor Tile" contain no building noun but are still props.
    if any(term in name for term in PART_TERMS):
        return "building-part-or-prop"
    if not any(term in name for term in BUILDING_TERMS):
        return "title-does-not-identify-a-complete-building"
    tags_value = item.get("tags")
    if not isinstance(tags_value, list) or not all(isinstance(tag, str) and tag.strip() for tag in tags_value):
        return "incomplete-asset-metadata"
    searchable = name + " " + " ".join(tags_value).lower()
    for field in ("download", "preview"):
        value = item.get(field)
        if not isinstance(value, str) or not value.startswith("https://"):
            return "incomplete-source-metadata"
    if any(field not in item or item.get(field) is None for field in ("tris", "maps", "max_res")):
        return "incomplete-geometry-metadata"
    try:
        if float(item["tris"]) <= 0 or not isinstance(item["maps"], list) or not str(item["max_res"]).strip():
            return "incomplete-geometry-metadata"
    except (TypeError, ValueError):
        return "incomplete-geometry-metadata"
    dims = item.get("size_m")
    if not isinstance(dims, list) or len(dims) < 3:
        return "missing-measured-dimensions"
    try:
        x, y, z = (float(dims[0]), float(dims[1]), float(dims[2]))
    except (TypeError, ValueError):
        return "invalid-measured-dimensions"
    if not all(map(lambda value: value == value and abs(value) != float("inf"), (x, y, z))):
        return "invalid-measured-dimensions"
    if min(x, z) < MIN_SPAN_M or y < MIN_HEIGHT_M:
        return "below-full-building-scale-threshold"
    if city not in RELEVANCE:
        return "unknown-city-theme"
    if city == "EclipseCentral" and y < 35:
        return "eclipse-tower-below-35m"
    if not any(term in searchable for term in RELEVANCE[city]):
        return "insufficient-city-theme-relevance"
    match = str(item.get("match") or "").lower()
    if match not in ("strong", "good"):
        # Category-wide results have no semantic score; exact city-theme terms
        # are still required by the local relevance check above.
        if match or not allow_missing_semantic_match:
            return "semantic-match-not-strong-or-good"
    return None

def asset_query_params(query, cursor=None):
    params = {"q": query, "type": "model", "style": "realistic",
              "min_size_m": MIN_SPAN_M, "format": "glb",
              "limit": API_PAGE_LIMIT, "detail": "full"}
    if cursor:
        params["cursor"] = cursor
    return params



def building_catalogue_params(cursor=None):
    """Browse the complete Buildings category instead of relying only on semantic search."""
    params = {
        "type": "model", "category": "buildings", "style": "realistic",
        "format": "glb", "limit": CATEGORY_PAGE_LIMIT, "detail": "full",
    }
    if cursor:
        params["cursor"] = cursor
    return params


def fetch_building_catalogue(api_key):
    """Fetch every Buildings page with stable de-duplication."""
    assets, diagnostics = {}, []
    cursor = None
    for page in range(1, MAX_CATEGORY_SCAN_PAGES + 1):
        payload = request_json("/assets", building_catalogue_params(cursor), api_key)
        results = payload.get("results")
        if not isinstance(results, list):
            raise RuntimeError("Unexpected 3D Valley Buildings catalogue response: results array missing")
        diagnostics.append({"page": page, "results": len(results)})
        for item in results:
            if isinstance(item, dict) and item.get("id"):
                assets.setdefault(item["id"], item)
        cursor = payload.get("next_cursor")
        if not cursor:
            return list(assets.values()), diagnostics
    raise RuntimeError(
        f"3D Valley Buildings catalogue exceeded the {MAX_CATEGORY_SCAN_PAGES}-page safety limit; "
        "inventory scan is incomplete and cannot be treated as exhaustive"
    )


def main():
    key = os.environ.get("THREE_D_VALLEY_API_KEY", "").strip()
    if not key:
        raise SystemExit("THREE_D_VALLEY_API_KEY is missing; add it as a GitHub Actions repository secret.")
    OUT.mkdir(parents=True, exist_ok=True)
    report = {"source": BASE, "queried_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "policy": "CC0-1.0, realistic style, full-building title, measured scale, city relevance; no paid generation",
              "cities": {}, "unique_asset_ids": []}
    globally_seen = set()
    # Semantic queries miss much of the catalogue. Add a single paginated
    # Buildings-category scan, then apply the same strict local quality gates.
    catalogue_items, catalogue_diagnostics = fetch_building_catalogue(key)
    report["building_catalogue_scan"] = {
        "category": "buildings", "pages": catalogue_diagnostics,
        "unique_assets": len(catalogue_items), "complete": True,
    }
    for city, queries in CITIES.items():
        accepted, rejected, diagnostics = {}, [], []
        for query in queries:
            cursor = None
            for page in range(1, PAGES_PER_QUERY + 1):
                params = asset_query_params(query, cursor)
                payload = request_json("/assets", params, key)
                results = payload.get("results")
                if not isinstance(results, list):
                    raise RuntimeError("Unexpected 3D Valley response: results array missing")
                diagnostics.append({"query": query, "page": page, "results": len(results)})
                for item in results:
                    asset_id = item.get("id")
                    if not asset_id:
                        continue
                    reason = reject_reason(item, city)
                    if reason:
                        rejected.append({"id": asset_id, "name": item.get("name"), "reason": reason,
                                         "size_m": item.get("size_m"), "license": item.get("license"),
                                         "style": item.get("style"), "match": item.get("match")})
                        continue
                    candidate = {
                        "id": asset_id, "name": item.get("name"), "license": item.get("license"),
                        "style": item.get("style"), "tags": item.get("tags", []),
                        "size_m": item.get("size_m"), "triangles": item.get("tris"),
                        "maps": item.get("maps", []), "max_res": item.get("max_res"),
                        "download": item.get("download"), "preview": item.get("preview"),
                        "source_url": "https://3dvalley.com",
                        "match": item.get("match"), "similarity": item.get("similarity"),
                    }
                    accepted.setdefault(asset_id, candidate)
                cursor = payload.get("next_cursor")
                if not cursor or len(accepted) >= MAX_RESULTS_PER_CITY:
                    break
            if len(accepted) >= MAX_RESULTS_PER_CITY:
                break
        catalogue_rejections = {}
        for item in catalogue_items:
            reason = reject_reason(item, city, allow_missing_semantic_match=True)
            if reason:
                catalogue_rejections[reason] = catalogue_rejections.get(reason, 0) + 1
                continue
            asset_id = item["id"]
            candidate = {
                "id": asset_id, "name": item.get("name"), "license": item.get("license"),
                "style": item.get("style"), "tags": item.get("tags", []),
                "size_m": item.get("size_m"), "triangles": item.get("tris"),
                "maps": item.get("maps", []), "max_res": item.get("max_res"),
                "download": item.get("download"), "preview": item.get("preview"),
                "source_url": "https://3dvalley.com",
                "match": item.get("match") or "category-scan",
                "similarity": item.get("similarity"),
                "discovery_method": "buildings-category-scan",
            }
            accepted.setdefault(asset_id, candidate)
        # Keep duplicate source models visible in every relevant city, but report overlap.
        for asset_id in accepted:
            globally_seen.add(asset_id)
        report["cities"][city] = {"candidate_count": len(accepted),
            "candidates": sorted(accepted.values(), key=lambda x: (-(x.get("similarity") or 0), x["id"])),
            "rejected_count": len(rejected), "rejections_sample": rejected[:100],
            "catalogue_scan_rejection_counts": catalogue_rejections,
            "query_diagnostics": diagnostics}
        print(f"{city}: {len(accepted)} qualifying candidates; {len(rejected)} rejected")
    report["unique_asset_ids"] = sorted(globally_seen)
    (OUT / "nine-city-candidates.json").write_text(json.dumps(report, indent=2) + "\n")
    lines = ["# 3D Valley nine-city building discovery", "",
             "Discovery only. No asset is approved or imported by this report.", ""]
    for city, data in report["cities"].items():
        lines += [f"## {city}", f"Qualifying candidates: {data['candidate_count']}", ""]
        for item in data["candidates"][:12]:
            lines.append(f"- **{item['name']}** ({item['id']}) — {item['size_m']} m; {item['triangles']} tris; {item['maps']} maps; [preview]({item['preview']})")
        if not data["candidates"]:
            lines.append("- No qualifying candidates found; do not weaken the quality gate.")
        lines.append("")
    (OUT / "nine-city-candidates.md").write_text("\n".join(lines))
    if any(not data["candidate_count"] for data in report["cities"].values()):
        raise SystemExit("At least one city has no qualifying 3D Valley candidates; partial evidence retained.")

if __name__ == "__main__":
    main()
