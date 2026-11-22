#!/usr/bin/env python3
"""Discover full-scale realistic city buildings from 3DAssets.dev.

Search results are only candidates. Modular parts, props, fantasy/military
structures and undersized objects are rejected before acquisition. No model is
called a city landmark until its source record and binary are independently
validated.
"""
import json
from collections import Counter
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
        "coastal apartment building exterior",
        "island resort hotel exterior architecture",
        "modern ferry terminal building exterior",
        "waterfront mixed use residential building",
        "harbour promenade commercial building",
        "contemporary beachside villa building",
        "complete coastal apartment hotel exterior building",
        "modern island residential clubhouse exterior building",
    ],
    "VerdantReach": [
        "biophilic vertical garden tower exterior",
        "modern sustainable residential high rise",
        "green mixed use office tower exterior",
        "contemporary urban campus building",
        "sustainable university building exterior",
        "green residential apartment building",
        "botanical garden visitor centre building",
        "eco friendly office building exterior",
        "modern park pavilion building exterior",
        "vertical garden residential tower",
        "complete botanical research centre exterior building",
        "sustainable timber residential campus building exterior",
    ],
    "NexusDelta": [
        "modern glass skyscraper exterior",
        "futuristic office tower building",
        "high rise commercial building exterior",
        "mixed use city skyscraper",
        "modern city apartment skyscraper",
        "urban mixed use commercial tower",
        "glass bank office tower exterior",
        "modern shopping centre building exterior",
        "contemporary cinema building exterior",
        "large metropolitan office building",
        "complete urban convention centre building exterior",
        "modern metropolitan residential complex exterior building",
    ],
    "AuroraHeights": [
        "modern alpine city residential building exterior",
        "mountain resort hotel building exterior",
        "contemporary glass high rise tower",
        "modern civic building exterior",
        "alpine chalet hotel building exterior",
        "mountain village apartment building",
        "timber mountain lodge exterior architecture",
        "ski resort visitor centre building",
        "alpine residential apartment block",
        "mountain town civic centre exterior",
        "complete alpine village hotel building exterior",
        "mountain research observatory visitor centre building",
    ],
    "SaffronDunes": [
        "desert city high rise building exterior",
        "contemporary desert hotel building",
        "solar integrated office tower exterior",
        "modern urban residential tower",
        "adobe courtyard house complete building",
        "desert resort hotel exterior architecture",
        "modern mosque building desert architecture",
        "mudbrick residential building exterior",
        "oasis visitor centre building exterior",
        "solar powered commercial building exterior",
        "complete desert courtyard residential building exterior",
        "modern oasis cultural centre building exterior",
    ],
    "MonsoonHarbour": [
        "modern waterfront skyscraper exterior",
        "tropical port terminal building exterior",
        "coastal mixed use high rise building",
        "contemporary harbour office tower",
        "tropical waterfront apartment building",
        "island village complete house exterior",
        "modern ferry terminal architecture",
        "coastal resort hotel building exterior",
        "port authority office building",
        "harbour market building exterior",
        "complete tropical port administration building exterior",
        "coastal fish market terminal building exterior",
    ],
    "EclipseCentral": [
        "futuristic illuminated skyscraper tower exterior",
        "supertall glass office tower exterior",
        "mixed use landmark skyscraper exterior",
        "neon commercial high rise tower",
        "modern concert arena exterior",
        "super tall metropolitan skyscraper building",
        "35 meter office tower exterior architecture",
        "futuristic city landmark office skyscraper",
        "modern high rise commercial tower building",
        "glass supertall mixed use skyscraper",
        "complete 40 metre modern city office skyscraper exterior",
        "supertall mixed use residential commercial tower building",
    ],
    "OriginPlains": [
        "modern university campus building exterior",
        "contemporary civic centre building exterior",
        "sustainable urban office building",
        "modern glass office tower exterior",
        "university library complete building exterior",
        "modern school campus building exterior",
        "research laboratory building exterior architecture",
        "contemporary museum building exterior",
        "modern hospital building exterior",
        "university lecture hall building exterior",
        "complete rural innovation campus research building exterior",
        "modern agricultural science institute building exterior",
    ],
    "AtlasFrontier": [
        "modern industrial logistics terminal building exterior",
        "contemporary factory building exterior",
        "urban technology campus building",
        "industrial office tower exterior",
        "modern warehouse complete building exterior",
        "industrial research laboratory building exterior",
        "manufacturing plant building exterior architecture",
        "logistics distribution centre building",
        "steel industrial workshop building exterior",
        "industrial power station building exterior",
        "complete logistics distribution terminal building exterior",
        "modern industrial engineering campus building exterior",
    ],
}
UA = "UCENO-city-architecture-discovery/2.0"
MAX_BYTES = 25 * 1024 * 1024
MIN_HEIGHT_M = 5.0
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
    "laboratory", "workshop", "garage", "depot", "station", "hangar", "church",
    "mosque", "clinic", "warehouse", "barn", "shed", "hut", "cottage", "villa",
    "clubhouse", "restaurant", "shop", "store", "market", "supermarket", "motel",
    "farmhouse", "fire station", "police station", "office building", "chalet",
    "lodge", "resort", "bank", "cinema", "theatre", "theater", "power plant",
)
NON_BUILDING_TITLE_TERMS = (
    "windmill", "wind turbine", "mill sail", "sculpture", "statue", "fountain",
    "sign", "monument", "bridge", "wall panel", "facade panel", "module", "prop",
    "front", "frontage", "shopfront", "shop front", "building front", "roof section",
    "tower section", "gantry", "silo", "glazed dome", "staging tower",
    "observation tower", "site office", "canopy", "canopy section",
    "forecourt canopy", "canopy module", "fabrication shed bay", "shed bay",
    "bay section", "section module",
)
POSITIVE_TERMS = (
    "building", "skyscraper", "tower", "high rise", "high-rise", "office",
    "residential", "hotel", "campus", "terminal", "civic", "commercial",
    "mixed use", "mixed-use", "arena", "factory", "waterfront", "house",
    "village", "laboratory", "plant", "warehouse", "workshop", "hangar",
    "church", "mosque", "clinic", "shop", "store", "market", "villa",
    "cottage", "chalet", "lodge", "resort", "bank", "cinema", "theatre",
    "theater",
)
CITY_RELEVANCE = {
    "SolsticeBay": ("waterfront", "coastal", "harbour", "harbor", "marina", "beach",
                    "residential", "apartment", "villa", "korean", "hanok", "village",
                    "island", "ferry"),
    "VerdantReach": ("green", "garden", "sustainable", "biophilic", "eco", "campus",
                     "university", "park", "botanical", "residential", "vertical garden"),
    "NexusDelta": ("skyscraper", "high rise", "high-rise", "office", "commercial",
                   "mixed use", "mixed-use", "city block", "urban", "glass", "bank",
                   "cinema", "supermarket", "market", "residential"),
    "AuroraHeights": ("alpine", "mountain", "ski", "snow", "resort", "lodge", "chalet",
                      "village", "timber", "mountain", "ski lodge"),
    "SaffronDunes": ("desert", "adobe", "arid", "sand", "solar", "oasis", "mosque",
                     "mudbrick", "courtyard", "arabic", "middle eastern"),
    "MonsoonHarbour": ("harbour", "harbor", "port", "waterfront", "coastal", "tropical",
                       "marina", "ferry", "terminal", "quay", "dock", "island", "village"),
    "EclipseCentral": ("skyscraper", "supertall", "high rise", "high-rise", "tower",
                       "office", "commercial", "skyline", "city"),
    "OriginPlains": ("university", "campus", "school", "library", "museum", "civic",
                     "hospital", "classroom", "college", "courthouse", "research",
                     "education"),
    "AtlasFrontier": ("industrial", "factory", "warehouse", "hangar", "logistics",
                      "workshop", "manufacturing", "terminal", "plant", "steel",
                      "power station", "laboratory", "assay"),
}

def get(url, max_attempts=4, base_delay_seconds=1.5, max_delay_seconds=20):
    """Fetch catalogue JSON with bounded retries for transient provider failures."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    retryable_statuses = {429, 500, 502, 503, 504}
    for attempt in range(1, max_attempts + 1):
        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            if error.code not in retryable_statuses or attempt >= max_attempts:
                raise
            retry_after = error.headers.get("Retry-After") if error.headers else None
            try:
                delay = float(retry_after) if retry_after is not None else base_delay_seconds * (2 ** (attempt - 1))
            except (TypeError, ValueError):
                delay = base_delay_seconds * (2 ** (attempt - 1))
            time.sleep(min(max(0.0, delay), max_delay_seconds))
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt >= max_attempts:
                raise
            delay = min(base_delay_seconds * (2 ** (attempt - 1)), max_delay_seconds)
            time.sleep(delay)
    raise RuntimeError("Catalogue request exhausted retry attempts")

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
    found = []
    for term in terms:
        normalized = re.sub(r"[_-]+", " ", str(term).lower())
        if re.search(r"(?<!\w)" + re.escape(normalized) + r"(?!\w)", value):
            found.append(term)
    return found

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
    category = item.get("category")
    if isinstance(category, dict):
        category = category.get("slug") or category.get("title") or category.get("name")
    category_key = re.sub(r"[^a-z]", "", str(category or "").lower())
    if category_key not in {"building", "buildings", "buildingsarchitecture", "architecture"}:
        return "not-building-category"
    title = item.get("title") or item.get("name") or ""
    summary = item.get("summary") or item.get("description") or ""
    searchable = f"{title} {summary}"
    title_searchable = re.sub(r"[_-]+", " ", str(title).lower())
    tags = tag_slugs(item)
    style = str(item.get("style") or "").lower()
    if "realistic" not in tags and style != "realistic":
        return "missing-realistic-style"
    if "exterior" not in tags and "exterior" not in searchable.lower():
        return "not-marked-exterior"
    # A modular tag alone does not prove the file is only a kit part.
    # Whole-building titles, scale and part-title checks below decide that.
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
    relevance_text = searchable + " " + " ".join(tags)
    if not words_present(relevance_text, CITY_RELEVANCE.get(city, ())):
        return "insufficient-city-relevance"
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

def broaden_city_candidates(city, queries, raw_by_slug, globally_seen, query_diagnostics,
                            target_candidates=30, max_pages_per_query=3):
    """Expand underfilled searches without weakening strict asset qualification."""
    def qualifying_count():
        return sum(
            1 for slug, item in raw_by_slug.items()
            if slug not in globally_seen and rejection_reason(item, city) is None
        )

    if qualifying_count() >= 12:
        return 0

    added_total = 0
    for query in queries:
        query_added = 0
        page_diagnostics = []
        for page in range(1, max_pages_per_query + 1):
            params = urllib.parse.urlencode({
                "q": query, "sort": "relevance", "limit": 100, "page": page
            })
            results = unwrap(get(f"{BASE}/assets?{params}"))
            for item in results:
                slug = item.get("slug") or item.get("id")
                if slug and slug not in raw_by_slug:
                    raw_by_slug[slug] = item
                    query_added += 1
            page_diagnostics.append({"page": page, "result_count": len(results)})
            if len(results) < 100:
                break
        added_total += query_added
        query_diagnostics.append({
            "query": query,
            "search_mode": "broad-underfill-retry",
            "result_count": sum(item["result_count"] for item in page_diagnostics),
            "new_records": query_added,
            "pages_checked": page_diagnostics,
            "fallback_without_category_or_style": True,
        })
        if qualifying_count() >= target_candidates:
            break
    return added_total



def allocate_unique_city_candidates(candidate_pools, per_city=30):
    """Allocate unique models globally while maximizing city coverage before extras."""
    if not isinstance(per_city, int) or per_city < 1:
        raise ValueError("per_city must be a positive integer")
    cities = sorted(candidate_pools)
    records_by_slug = {}
    for city in cities:
        for candidate in candidate_pools[city]:
            slug = candidate.get("slug")
            if isinstance(slug, str) and slug:
                records_by_slug.setdefault(slug, candidate)
    slugs = sorted(records_by_slug)
    source = 0
    asset_start = 1
    city_start = asset_start + len(slugs)
    sink = city_start + len(cities)
    graph = [[] for _ in range(sink + 1)]

    def add_edge(origin, destination, capacity, cost):
        forward = {"to": destination, "capacity": capacity, "cost": cost,
                   "reverse": len(graph[destination])}
        backward = {"to": origin, "capacity": 0, "cost": -cost,
                    "reverse": len(graph[origin])}
        graph[origin].append(forward)
        graph[destination].append(backward)
        return forward

    asset_nodes = {slug: asset_start + index for index, slug in enumerate(slugs)}
    city_nodes = {city: city_start + index for index, city in enumerate(cities)}
    for node in asset_nodes.values():
        add_edge(source, node, 1, 0)

    assignment_edges = {slug: [] for slug in slugs}
    for city in cities:
        for candidate in candidate_pools[city]:
            slug = candidate.get("slug")
            if slug not in asset_nodes:
                continue
            relevance = int(candidate.get("relevance_score") or 0)
            mobile_cost = int(candidate.get("mobile_cost_score") or 0)
            edge = add_edge(asset_nodes[slug], city_nodes[city], 1,
                            -(relevance * 100 - mobile_cost))
            assignment_edges[slug].append((city, edge))
        for slot in range(per_city):
            add_edge(city_nodes[city], sink, 1, -100000 + slot * 1000)

    while True:
        distances = [float("inf")] * len(graph)
        previous_node = [-1] * len(graph)
        previous_edge = [-1] * len(graph)
        queued = [False] * len(graph)
        from collections import deque
        distances[source] = 0
        queue = deque([source])
        queued[source] = True
        while queue:
            node = queue.popleft()
            queued[node] = False
            for edge_index, edge in enumerate(graph[node]):
                if edge["capacity"] <= 0:
                    continue
                distance = distances[node] + edge["cost"]
                if distance >= distances[edge["to"]]:
                    continue
                distances[edge["to"]] = distance
                previous_node[edge["to"]] = node
                previous_edge[edge["to"]] = edge_index
                if not queued[edge["to"]]:
                    queue.append(edge["to"])
                    queued[edge["to"]] = True
        if previous_node[sink] < 0:
            break
        node = sink
        while node != source:
            parent = previous_node[node]
            edge = graph[parent][previous_edge[node]]
            edge["capacity"] -= 1
            graph[node][edge["reverse"]]["capacity"] += 1
            node = parent

    allocations = {city: [] for city in cities}
    for slug, choices in assignment_edges.items():
        for city, edge in choices:
            if edge["capacity"] == 0:
                allocations[city].append(records_by_slug[slug])
                break
    for city in cities:
        allocations[city].sort(key=lambda item: (
            -int(item.get("relevance_score") or 0),
            int(item.get("mobile_cost_score") or 0), item.get("slug", "")))
    return allocations


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {
        "source": BASE,
        "query_date_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "selection_policy": "complete realistic exterior buildings only; reject modular parts, props, unrelated themes and undersized assets; Eclipse Central tower candidates must be at least 35m tall",
        "cities": {},
    }
    candidate_pools = {}
    for city, queries in QUERIES.items():
        raw_by_slug = {}
        query_diagnostics = []
        for query in queries:
            query_results = []
            used_fallback = False
            page_diagnostics = []
            # The catalogue caps each response at 100 records. Read multiple
            # pages so relevance-ranked page one cannot hide qualifying assets.
            for page in range(1, 9):
                params = urllib.parse.urlencode({
                    "q": query, "category": "buildings", "style": "realistic",
                    "tag": "exterior", "sort": "relevance", "limit": 100, "page": page
                })
                results = unwrap(get(f"{BASE}/assets?{params}"))
                if page == 1 and not results:
                    fallback = urllib.parse.urlencode({
                        "q": query, "sort": "relevance", "limit": 100, "page": page
                    })
                    results = unwrap(get(f"{BASE}/assets?{fallback}"))
                    used_fallback = True
                page_diagnostics.append({"page": page, "result_count": len(results)})
                query_results.extend(results)
                if len(results) < 100:
                    break
            query_diagnostics.append({
                "query": query,
                "result_count": len(query_results),
                "pages_checked": page_diagnostics,
                "fallback_without_category_or_style": used_fallback,
                "sample_records": [{
                    "slug": item.get("slug") or item.get("id"),
                    "title": item.get("title") or item.get("name"),
                    "category": item.get("category"),
                    "style": item.get("style"),
                    "tags": tag_slugs(item),
                    "stats": item.get("stats"),
                    "summary": item.get("summary") or item.get("description"),
                } for item in query_results[:8]],
            })
            for item in query_results:
                slug = item.get("slug") or item.get("id")
                if slug:
                    raw_by_slug[slug] = item

        # Broaden underfilled searches without weakening strict qualification.
        broaden_city_candidates(city, queries, raw_by_slug, set(), query_diagnostics)

        candidates, rejected = [], []
        for slug, item in raw_by_slug.items():
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
        candidate_pools[city] = candidates
        report["cities"][city] = {
            "queries": queries,
            "query_diagnostics": query_diagnostics,
            "raw_candidate_count": len(raw_by_slug),
            "candidate_count": len(candidates),
            "rejected_count": len(rejected),
            "rejection_records": rejected,
            "candidates": [],
        }
        rejection_summary = dict(Counter(item["reason"] for item in rejected).most_common(6))
        print(f"{city}: {len(raw_by_slug)} raw; {len(candidates)} complete-building candidates; rejected {len(rejected)}; top rejection reasons: {rejection_summary}")

    # Resolve cross-city overlap globally; do not let the first city in the
    # configuration consume a model that another city needs more.
    allocations = allocate_unique_city_candidates(candidate_pools, per_city=30)
    for city, chosen in allocations.items():
        report["cities"][city]["candidates"] = chosen
        report["cities"][city]["allocated_unique_count"] = len(chosen)

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
