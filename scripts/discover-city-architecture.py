#!/usr/bin/env python3
"""Discover realistic CC0 architecture candidates from 3DAssets.dev.

This performs live source discovery and preserves exact source records. It does
not claim acquisition, import, LOD completion or visual acceptance.
"""
import json
import pathlib
import time
import urllib.parse
import urllib.request

BASE = "https://3dassets.dev/api/v1"
OUT = pathlib.Path("artifacts/city-architecture-candidates")
QUERIES = {
    "SolsticeBay": ["coastal modern house", "waterfront building", "marina building"],
    "VerdantReach": ["greenhouse modern building", "vertical garden tower", "biophilic architecture"],
    "NexusDelta": ["modern research campus building", "glass office tower", "modern laboratory"],
    "AuroraHeights": ["alpine mountain station", "mountain lodge modern", "mountain observatory"],
    "SaffronDunes": ["desert modern building", "oasis architecture", "solar canopy building"],
    "MonsoonHarbour": ["harbour port building", "canal waterfront building", "maritime terminal"],
    "EclipseCentral": ["modern entertainment venue", "concert arena building", "nightlife tower"],
    "OriginPlains": ["university campus building", "agricultural research greenhouse", "modern education building"],
    "AtlasFrontier": ["industrial logistics terminal", "rail freight warehouse", "modern factory building"],
}
UA = "UCENO-city-architecture-discovery/1.0"

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))

def unwrap(payload):
    if isinstance(payload, dict) and isinstance(payload.get("data"), list):
        return payload["data"]
    if isinstance(payload, list):
        return payload
    raise RuntimeError("Unexpected 3DAssets.dev search response; refusing to guess response fields")

def as_number(value):
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {
        "source": BASE,
        "query_date_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "selection_policy": "focused realistic architecture search with unfiltered query fallback; shortlist ranked for Android geometry and file-size budgets; candidates still require separate binary and Unity validation",
        "cities": {},
    }
    globally_seen = set()
    for city, queries in QUERIES.items():
        raw_by_slug = {}
        for query in queries:
            # Taxonomy slugs can change. Try focused filters first, then retry
            # without taxonomy filters so a slug mismatch cannot hide matches.
            focused = urllib.parse.urlencode({
                "q": query, "category": "buildings", "style": "realistic",
                "sort": "relevance", "limit": 100
            })
            results = unwrap(get(f"{BASE}/assets?{focused}"))
            if not results:
                fallback = urllib.parse.urlencode({
                    "q": query, "sort": "relevance", "limit": 100
                })
                results = unwrap(get(f"{BASE}/assets?{fallback}"))
            for item in results:
                slug = item.get("slug") or item.get("id")
                if slug:
                    raw_by_slug[slug] = item
        candidates = []
        for slug, item in raw_by_slug.items():
            if slug in globally_seen:
                continue
            stats = item.get("stats") or {}
            license_info = item.get("license")
            triangles = stats.get("triangles") or stats.get("triangleCount") or item.get("triangles")
            size = stats.get("fileSizeBytes") or item.get("fileSizeBytes")
            candidates.append({
                "slug": slug,
                "name": item.get("name") or item.get("title"),
                "description": item.get("description"),
                "category": item.get("category"),
                "style": item.get("style"),
                "theme": item.get("theme"),
                "tags": item.get("tags"),
                "triangles": triangles,
                "file_size_bytes": size,
                "cdn_url": item.get("cdnUrl") or item.get("cdn_url"),
                "license": license_info,
                "attribution": license_info.get("attributionText") if isinstance(license_info, dict) else None,
                "source_url": f"https://3dassets.dev/assets/{slug}",
                "raw_record": item,
            })
        # Rank for Android viability, not raw polygon density. Prefer assets
        # with known metrics, modest geometry and compact files. Large/high-poly
        # assets remain in the report but are not first-batch download targets.
        def mobile_cost(candidate):
            triangles = as_number(candidate["triangles"])
            size = as_number(candidate["file_size_bytes"])
            if triangles is None:
                triangle_penalty = 100
            elif triangles <= 100_000:
                triangle_penalty = 0
            elif triangles <= 250_000:
                triangle_penalty = 20
            elif triangles <= 500_000:
                triangle_penalty = 55
            else:
                triangle_penalty = 120
            if size is None:
                size_penalty = 40
            elif size <= 8 * 1024 * 1024:
                size_penalty = 0
            elif size <= 16 * 1024 * 1024:
                size_penalty = 15
            elif size <= 25 * 1024 * 1024:
                size_penalty = 35
            else:
                size_penalty = 100
            return (triangle_penalty + size_penalty, candidate["slug"])

        candidates.sort(key=mobile_cost)
        chosen = candidates[:30]
        globally_seen.update(item["slug"] for item in chosen)
        report["cities"][city] = {
            "queries": queries, "candidate_count": len(candidates), "candidates": chosen
        }
        print(f"{city}: {len(candidates)} unique source records; shortlisted {len(chosen)}")
    (OUT / "nine-city-candidates.json").write_text(json.dumps(report, indent=2) + "\n")
    lines = [
        "# Nine-city realistic architecture candidate results", "",
        f"Query time: {report['query_date_utc']}", "",
        "Live catalogue records only. This job does not download or import model binaries.", "",
    ]
    for city, data in report["cities"].items():
        lines += [f"## {city}", f"Queries: {', '.join(data['queries'])}", ""]
        for item in data["candidates"][:12]:
            tris = item["triangles"] if item["triangles"] is not None else "unknown"
            size = item["file_size_bytes"] if item["file_size_bytes"] is not None else "unknown"
            lines.append(
                f"- **{item['name'] or item['slug']}** — {tris} triangles; {size} bytes; "
                f"[source]({item['source_url']})"
            )
        if not data["candidates"]:
            lines.append("- No matching source records returned; source or commission this city's architecture.")
        lines.append("")
    (OUT / "nine-city-candidates.md").write_text("\n".join(lines))
    print(f"Saved live source records to {OUT}")

if __name__ == "__main__":
    main()
