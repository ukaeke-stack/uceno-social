#!/usr/bin/env python3
"""Discover full-scale realistic city buildings from 3DAssets.dev.

Search results are only candidates. Modular parts, props, fantasy/military
structures and undersized objects are rejected before acquisition. No model is
called a city landmark until its source record and binary are independently
validated.
"""
import json
import pathlib
import re
import time
import urllib.parse
import urllib.request

BASE = "https://3dassets.dev/api/v1"
OUT = pathlib.Path("artifacts/city-architecture-candidates")
QUERIES = {
    "SolsticeBay": [
        "modern waterfront residential tower exterior",
        "coastal hotel building exterior",
        "modern marina terminal building",
        "glass waterfront office building",
    ],
    "VerdantReach": [
        "biophilic vertical garden tower exterior",
        "modern sustainable residential high rise",
        "green mixed use office tower exterior",
        "contemporary urban campus building",
    ],
    "NexusDelta": [
        "modern glass skyscraper exterior",
        "futuristic office tower building",
        "high rise commercial building exterior",
        "mixed use city skyscraper",
    ],
    "AuroraHeights": [
        "modern alpine city residential building exterior",
        "mountain resort hotel building exterior",
        "contemporary glass high rise tower",
        "modern civic building exterior",
    ],
    "SaffronDunes": [
        "desert city high rise building exterior",
        "contemporary desert hotel building",
        "solar integrated office tower exterior",
        "modern urban residential tower",
    ],
    "MonsoonHarbour": [
        "modern waterfront skyscraper exterior",
        "tropical port terminal building exterior",
        "coastal mixed use high rise building",
        "contemporary harbour office tower",
    ],
    "EclipseCentral": [
        "futuristic illuminated skyscraper tower exterior",
        "supertall glass office tower exterior",
        "mixed use landmark skyscraper exterior",
        "neon commercial high rise tower",
        "modern concert arena exterior",
    ],
    "OriginPlains": [
        "modern university campus building exterior",
        "contemporary civic centre building exterior",
        "sustainable urban office building",
        "modern glass office tower exterior",
    ],
    "AtlasFrontier": [
        "modern industrial logistics terminal building exterior",
        "contemporary factory building exterior",
        "urban technology campus building",
        "industrial office tower exterior",
    ],
}
UA = "UCENO-city-architecture-discovery/2.0"
MAX_BYTES = 25 * 1024 * 1024
MIN_HEIGHT_M = 8.0
MIN_FOOTPRINT_M = 4.0
MIN_HORIZONTAL_SPAN_M = 4.0
ECLIPSE_MIN_HEIGHT_M = 35.0

# A modular kit component is not a complete building, regardless of its name.
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
POSITIVE_TERMS = (
    "building", "skyscraper", "tower", "high rise", "high-rise", "office",
    "residential", "hotel", "campus", "terminal", "civic", "commercial",
    "mixed use", "mixed-use", "arena", "factory", "waterfront",
)

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

def tag_slugs(item):
    tags = item.get("tags") or []
    return [str(tag.get("slug") or tag.get("title") or "").lower()
            if isinstance(tag, dict) else str(tag).lower() for tag in tags]

def words_present(text, terms):
    value = re.sub(r"[_-]+", " ", str(text or "").lower())
    return [term for term in terms if term in value]

def dimensions(item):
    stats = item.get("stats") or {}
    dims = stats.get("sizeMeters")
    if isinstance(dims, list) and len(dims) >= 3:
        return as_number(dims[0]), as_number(dims[1]), as_number(dims[2])
    box = stats.get("boundingBox") or {}
    low, high = box.get("min"), box.get("max")
    if isinstance(low, list) and isinstance(high, list) and len(low) >= 3 and len(high) >= 3:
        return tuple(as_number(high[i]) - as_number(low[i]) for i in range(3))
    return None, None, None

def rejection_reason(item, city):
    title = item.get("title") or item.get("name") or ""
    summary = item.get("summary") or item.get("description") or ""
    searchable = f"{title} {summary}"
    title_searchable = re.sub(r"[_-]+", " ", str(title).lower())
    tags = tag_slugs(item)
    if "realistic" not in tags:
        return "missing-realistic-tag"
    if "exterior" not in tags and "exterior" not in searchable.lower():
        return "not-marked-exterior"
    if "modular" in tags:
        return "modular-kit-component"
    if words_present(title_searchable, NON_BUILDING_TITLE_TERMS):
        return "non-building-object-title"
    if not words_present(title_searchable, WHOLE_BUILDING_TITLE_TERMS):
        return "title-does-not-identify-a-complete-building"
    # Descriptions of whole buildings routinely mention walls, windows, floors,
    # doors and columns. Apply component rejection to the asset title only;
    # applying it to prose silently rejects nearly every real building.
    if words_present(title_searchable, PART_TERMS):
        return "individual-building-part-or-prop"
    if words_present(searchable, IRRELEVANT_TERMS):
        return "unrelated-theme-or-setting"
    width, height, depth = dimensions(item)
    if width is None or height is None or depth is None:
        return "missing-real-world-dimensions"
    footprint = max(width, depth)
    if (height < MIN_HEIGHT_M or footprint < MIN_FOOTPRINT_M or
            min(width, depth) < MIN_HORIZONTAL_SPAN_M):
        return "too-small-or-too-narrow-to-be-a-complete-building"
    if city == "EclipseCentral":
        if height < ECLIPSE_MIN_HEIGHT_M:
            return "lumen-tower-candidate-below-35m"
        if not words_present(searchable, TOWER_TERMS):
            return "not-a-skyscraper-or-office-tower"
    if city != "EclipseCentral" and not words_present(searchable, POSITIVE_TERMS):
        return "not-recognized-as-a-whole-building"
    size = as_number((item.get("stats") or {}).get("fileSize"))
    if size is not None and size > MAX_BYTES:
        return "over-25-mib-android-acquisition-cap"
    return None

def mobile_cost(candidate):
    triangles = as_number(candidate["triangles"])
    size = as_number(candidate["file_size_bytes"])
    triangle_penalty = (100 if triangles is None else 0 if triangles <= 100_000
                        else 20 if triangles <= 250_000 else 55 if triangles <= 500_000 else 120)
    size_penalty = (40 if size is None else 0 if size <= 8 * 1024 * 1024
                    else 15 if size <= 16 * 1024 * 1024
                    else 35 if size <= MAX_BYTES else 100)
    return triangle_penalty + size_penalty

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {
        "source": BASE,
        "query_date_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "selection_policy": "complete realistic exterior buildings only; reject modular parts, props, unrelated themes and undersized assets; Eclipse Central tower candidates must be at least 35m tall",
        "cities": {},
    }
    globally_seen = set()
    for city, queries in QUERIES.items():
        raw_by_slug = {}
        query_diagnostics = []
        for query in queries:
            params = urllib.parse.urlencode({
                "q": query, "category": "buildings", "style": "realistic",
                "sort": "relevance", "limit": 100
            })
            results = unwrap(get(f"{BASE}/assets?{params}"))
            used_fallback = False
            if not results:
                fallback = urllib.parse.urlencode({"q": query, "sort": "relevance", "limit": 100})
                results = unwrap(get(f"{BASE}/assets?{fallback}"))
                used_fallback = True
            query_diagnostics.append({
                "query": query,
                "result_count": len(results),
                "fallback_without_category_or_style": used_fallback,
                "sample_records": [{
                    "slug": item.get("slug") or item.get("id"),
                    "title": item.get("title") or item.get("name"),
                    "category": item.get("category"),
                    "style": item.get("style"),
                    "tags": tag_slugs(item),
                    "stats": item.get("stats"),
                    "summary": item.get("summary") or item.get("description"),
                } for item in results[:8]],
            })
            for item in results:
                slug = item.get("slug") or item.get("id")
                if slug:
                    raw_by_slug[slug] = item

        candidates, rejected = [], []
        for slug, item in raw_by_slug.items():
            if slug in globally_seen:
                continue
            reason = rejection_reason(item, city)
            if reason:
                rejected.append({
                    "slug": slug,
                    "name": item.get("title") or item.get("name"),
                    "reason": reason,
                    "category": item.get("category"),
                    "style": item.get("style"),
                    "tags": tag_slugs(item),
                    "dimensions_m": list(dimensions(item)),
                    "summary": item.get("summary") or item.get("description"),
                    "source_url": item.get("url") or ("https://3dassets.dev/assets/" + str(slug)),
                    "stats": item.get("stats"),
                    "license": item.get("license"),
                })
                continue
            stats = item.get("stats") or {}
            dims = dimensions(item)
            license_info = item.get("license")
            size = as_number(stats.get("fileSize"))
            triangles = as_number(stats.get("triangles"))
            tags = tag_slugs(item)
            searchable = f"{item.get('title') or ''} {item.get('summary') or ''}".lower()
            relevance = sum(5 for term in POSITIVE_TERMS if term in searchable)
            relevance += 3 if "exterior" in tags else 0
            relevance += 8 if city == "EclipseCentral" and words_present(searchable, TOWER_TERMS) else 0
            candidates.append({
                "slug": slug,
                "name": item.get("title") or item.get("name"),
                "description": item.get("summary") or item.get("description"),
                "category": (item.get("category") or {}).get("title") if isinstance(item.get("category"), dict) else item.get("category"),
                "tags": tags,
                "dimensions_m": list(dims),
                "triangles": triangles,
                "file_size_bytes": size,
                "cdn_url": item.get("cdnUrl") or item.get("cdn_url"),
                "license": license_info,
                "source_url": item.get("url") or f"https://3dassets.dev/assets/{slug}",
                "relevance_score": relevance,
                "mobile_cost_score": mobile_cost({"triangles": triangles, "file_size_bytes": size}),
                "raw_record": item,
            })

        candidates.sort(key=lambda c: (-c["relevance_score"], c["mobile_cost_score"], c["slug"]))
        chosen = candidates[:30]
        globally_seen.update(item["slug"] for item in chosen)
        report["cities"][city] = {
            "queries": queries,
            "query_diagnostics": query_diagnostics,
            "raw_candidate_count": len(raw_by_slug),
            "candidate_count": len(candidates),
            "rejected_count": len(rejected),
            "rejection_records": rejected,
            "candidates": chosen,
        }
        print(f"{city}: {len(raw_by_slug)} raw; {len(candidates)} complete-building candidates; rejected {len(rejected)}")

    (OUT / "nine-city-candidates.json").write_text(json.dumps(report, indent=2) + "\n")
    lines = [
        "# Nine-city complete-building candidate results", "",
        f"Query time: {report['query_date_utc']}", "",
        "Only complete realistic exterior buildings are shortlisted. Modular parts, props and unrelated settings are rejected.", "",
    ]
    for city, data in report["cities"].items():
        lines += [f"## {city}", f"Queries: {', '.join(data['queries'])}", ""]
        for item in data["candidates"][:12]:
            lines.append(
                f"- **{item['name'] or item['slug']}** — {item['dimensions_m']} m; "
                f"{item['triangles']} triangles; {item['file_size_bytes']} bytes; "
                f"[source]({item['source_url']})"
            )
        if not data["candidates"]:
            lines.append("- No qualifying full-building model found. Do not substitute a modular prop.")
        lines.append("")
    (OUT / "nine-city-candidates.md").write_text("\n".join(lines))
    print(f"Saved strict full-building discovery report to {OUT}")
    if any(not data["candidates"] for data in report["cities"].values()):
        raise SystemExit("At least one city has no qualifying full-building model; partial results retained, no completion claim allowed.")

if __name__ == "__main__":
    main()
