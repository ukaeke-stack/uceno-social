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
CITIES = {
    "SolsticeBay": ["coastal apartment building exterior", "waterfront hotel building", "island villa building", "harbour terminal building"],
    "VerdantReach": ["sustainable green residential tower", "botanical research centre building", "eco campus building exterior", "vertical garden office tower"],
    "NexusDelta": ["modern glass skyscraper building", "urban mixed use office tower", "metropolitan apartment building", "modern shopping mall building"],
    "AuroraHeights": ["alpine resort hotel building", "mountain village apartment building", "timber chalet lodge building", "mountain civic centre building"],
    "SaffronDunes": ["desert courtyard house building", "oasis hotel building", "adobe cultural centre building", "solar office tower building"],
    "MonsoonHarbour": ["tropical waterfront apartment building", "port terminal building", "coastal resort hotel building", "harbour market building"],
    "EclipseCentral": ["supertall glass skyscraper building", "35 metre office tower building", "modern metropolitan landmark tower"],
    "OriginPlains": ["university campus building", "modern hospital building", "public library building", "research laboratory building"],
    "AtlasFrontier": ["industrial logistics terminal building", "modern factory building", "industrial research laboratory building", "warehouse building exterior"],
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
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 3:
                raise
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

def reject_reason(item, city):
    name = str(item.get("name") or "").lower().replace("_", " ").replace("-", " ")
    tags = " ".join(str(x) for x in item.get("tags", [])).lower()
    searchable = name + " " + tags
    if item.get("license") != "CC0-1.0":
        return "license-not-explicitly-cc0-1.0"
    if item.get("type") != "model":
        return "not-a-model"
    if item.get("style") != "realistic":
        return "not-realistic-style"
    if not any(term in name for term in BUILDING_TERMS):
        return "title-does-not-identify-a-complete-building"
    if any(term in name for term in PART_TERMS):
        return "building-part-or-prop"
    dims = item.get("size_m")
    if not isinstance(dims, list) or len(dims) < 3:
        return "missing-measured-dimensions"
    try:
        x, y, z = (float(dims[0]), float(dims[1]), float(dims[2]))
    except (TypeError, ValueError):
        return "invalid-measured-dimensions"
    if min(x, z) < MIN_SPAN_M or y < MIN_HEIGHT_M:
        return "below-full-building-scale-threshold"
    if city == "EclipseCentral" and y < 35:
        return "eclipse-tower-below-35m"
    if not any(term in searchable for term in RELEVANCE[city]):
        return "insufficient-city-theme-relevance"
    match = str(item.get("match") or "").lower()
    if match not in ("strong", "good"):
        return "semantic-match-not-strong-or-good"
    return None

def main():
    key = os.environ.get("THREE_D_VALLEY_API_KEY", "").strip()
    if not key:
        raise SystemExit("THREE_D_VALLEY_API_KEY is missing; add it as a GitHub Actions repository secret.")
    OUT.mkdir(parents=True, exist_ok=True)
    report = {"source": BASE, "queried_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "policy": "CC0-1.0, realistic style, full-building title, measured scale, city relevance; no paid generation",
              "cities": {}, "unique_asset_ids": []}
    globally_seen = set()
    for city, queries in CITIES.items():
        accepted, rejected, diagnostics = {}, [], []
        for query in queries:
            cursor = None
            for page in range(1, PAGES_PER_QUERY + 1):
                params = {"q": query, "type": "model", "style": "realistic",
                          "min_size_m": MIN_SPAN_M, "format": "glb", "limit": 100, "detail": "full"}
                if cursor:
                    params["cursor"] = cursor
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
        # Keep duplicate source models visible in every relevant city, but report overlap.
        for asset_id in accepted:
            globally_seen.add(asset_id)
        report["cities"][city] = {"candidate_count": len(accepted),
            "candidates": sorted(accepted.values(), key=lambda x: (-(x.get("similarity") or 0), x["id"])),
            "rejected_count": len(rejected), "rejections_sample": rejected[:100],
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
