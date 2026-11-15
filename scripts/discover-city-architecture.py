#!/usr/bin/env python3
"""Discover realistic CC0 architecture candidates from 3DAssets.dev.

This is an executable catalogue query, not an acquisition claim. It saves the
full source records and a per-city shortlist so exact models can be reviewed
before any binary is downloaded into Unity.
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
    raise RuntimeError("Unexpected 3DAssets.dev search response; preserve response for inspection")

def text_of(record):
    return " ".join(str(record.get(k, "")) for k in
                    ("name", "title", "slug", "description", "category", "style", "theme", "tags")).lower()

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {"source": BASE, "query_date_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "selection_policy": "realistic building-category search; no binary acquisition or Unity acceptance",
              "cities": {}}
    seen = set()
    for city, queries in QUERIES.items():
        entries = []
        raw_by_slug = {}
        for query in queries:
            params = urllib.parse.urlencode({"q": query, "category": "buildings", "style": "realistic", "limit": 30})
            payload = get(f"{BASE}/assets?{params}")
            for item in unwrap(payload):
                slug = item.get("slug") or item.get("id")
                if not slug:
                    continue
                raw_by_slug[slug] = item
        for slug, item in raw_by_slug.items():
            if slug in seen:
                continue
            record_text = text_of(item)
            stats = item.get("stats") or {}
            triangles = stats.get("triangles") or stats.get("triangleCount") or item.get("triangles")
            size = stats.get("fileSizeBytes") or item.get("fileSizeBytes")
            cdn = item.get("cdnUrl") or item.get("cdn_url")
            usage = item.get("usage") or {}
            # Keep source metadata intact; missing technical fields are explicitly unknown.
            entries.append({
                "slug": slug,
                "name": item.get("name") or item.get("title"),
                "description": item.get("description"),
                "category": item.get("category"),
                "style": item.get("style"),
                "theme": item.get("theme"),
                "tags": item.get("tags"),
                "triangles": triangles,
                "file_size_bytes": size,
                "cdn_url": cdn,
                "license": item.get("license"),
                "attribution": item.get("license", {}).get("attributionText") if isinstance(item.get("license"), dict) else None,
                "source_url": f"https://3dassets.dev/assets/{slug}",
                "raw_record": item,
            })
        # Prioritize substantive architecture records, but do not invent scores or pass criteria.
        entries.sort(key=lambda x: (x["triangles"] is None, -(x["triangles"] or 0), x["slug"]))
        chosen = entries[:30]
        for item in chosen:
            seen.add(item["slug"])
        report["cities"][city] = {"queries": queries, "candidate_count": len(entries), "candidates": chosen}
        print(f"{city}: {len(entries)} distinct candidates found; shortlisted {len(chosen)}")
    (OUT / "nine-city-candidates.json").write_text(json.dumps(report, indent=2) + "\n")
    lines = ["# Nine-city realistic architecture candidate results", "",
             f"Query time: {report['query_date_utc']}", "",
             "These are live API results, not acquired assets. No model is imported or accepted by this job.", ""]
    for city, data in report["cities"].items():
        lines += [f"## {city}", f"Queries: {', '.join(data['queries'])}", ""]
        for item in data["candidates"][:12]:
            lines.append(f"- **{item['name'] or item['slug']}** — {item['triangles'] or 'triangle count unknown'} triangles; "
                         f"{item['file_size_bytes'] or 'size unknown'} bytes; "
                         f"[source]({item['source_url']})")
        if not data["candidates"]:
            lines.append("- No candidates returned; commission or source this city's architecture separately.")
        lines.append("")
    (OUT / "nine-city-candidates.md").write_text("\n".join(lines))
    print(f"Saved live candidate data to {OUT}")

if __name__ == "__main__":
    main()
