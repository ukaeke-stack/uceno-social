#!/usr/bin/env python3
"""Discover and acquire verified CC0 building assets from tevy's versioned catalogue.

Catalogue candidates are not visually approved or Unity-imported. Every download
is pinned to a published version and checked against the catalogue SHA-256.
"""
import hashlib
import json
import pathlib
import re
import time
from collections import deque
import urllib.error
import urllib.request

BASE = "https://tevy.dev"
INDEX_URL = f"{BASE}/models.json"
OUT = pathlib.Path("artifacts/tevy-city-architecture")
MAX_BYTES = 25 * 1024 * 1024
PER_CITY = 12
CITIES = {
    "SolsticeBay": ("waterfront", "coastal", "harbour", "harbor", "marina", "hotel", "residential", "apartment", "tower"),
    "VerdantReach": ("green", "garden", "sustainable", "eco", "biophilic", "park", "campus", "residential", "apartment", "office"),
    "NexusDelta": ("skyscraper", "high rise", "high-rise", "tower", "office", "commercial", "mixed use", "mixed-use", "apartment", "city"),
    "AuroraHeights": ("alpine", "mountain", "ski", "snow", "resort", "hotel", "lodge", "glass", "tower", "residential"),
    "SaffronDunes": ("desert", "adobe", "arid", "solar", "sand", "hot", "pueblo", "residential", "hotel", "tower"),
    "MonsoonHarbour": ("harbour", "harbor", "port", "waterfront", "coastal", "tropical", "marina", "terminal", "warehouse"),
    "EclipseCentral": ("skyscraper", "supertall", "high rise", "high-rise", "tower", "office", "commercial", "city"),
    "OriginPlains": ("university", "campus", "school", "library", "museum", "civic", "hospital", "classroom", "college", "office"),
    "AtlasFrontier": ("industrial", "factory", "warehouse", "hangar", "logistics", "workshop", "manufacturing", "terminal", "plant", "office"),
}
# Stronger city-specific anchors prevent generic catalogue terms from assigning
# a building to the wrong climate, culture or urban typology.
CITY_THEME_ANCHORS = {
    "SolsticeBay": ("waterfront", "coastal", "harbour", "harbor", "marina", "beach", "island", "ferry", "hanok", "korean"),
    "VerdantReach": ("green", "garden", "sustainable", "biophilic", "eco", "botanical", "vertical garden", "greenhouse", "arboretum"),
    "NexusDelta": ("skyscraper", "high rise", "high-rise", "office", "commercial", "mixed use", "mixed-use", "glass", "urban", "financial", "metropolitan", "corporate", "technology", "data centre", "data center"),
    "AuroraHeights": ("alpine", "mountain", "ski", "snow", "resort", "lodge", "chalet", "timber"),
    "SaffronDunes": ("desert", "adobe", "arid", "sand", "solar", "oasis", "mudbrick", "courtyard", "middle eastern", "arabic"),
    "MonsoonHarbour": ("harbour", "harbor", "port", "waterfront", "coastal", "tropical", "marina", "ferry", "terminal", "quay", "dock", "canal", "monsoon"),
    "EclipseCentral": ("skyscraper", "supertall", "high rise", "high-rise", "tower", "office", "commercial", "skyline", "metropolitan", "city"),
    "OriginPlains": ("university", "campus", "school", "library", "museum", "civic", "hospital", "classroom", "college", "courthouse", "research", "education"),
    "AtlasFrontier": ("industrial", "factory", "warehouse", "hangar", "logistics", "workshop", "manufacturing", "terminal", "plant", "steel", "power station", "laboratory", "assay", "depot"),
}

NON_OCCUPIABLE = (
    "power pylon", "transmission pylon", "pylon", "tv tower", "television tower",
    "broadcast tower", "radio tower", "harbour crane", "harbor crane", "crane",
    "chairlift", "ski lift", "tower crown", "glass tower crown", "lobby floor",
    "cooling tower", "launch tower", "drop tower", "wind turbine", "windmill",
    "turbine", "lighthouse", "airport control tower", "control tower", "ferris wheel",
    "observation wheel", "roller coaster", "amusement ride", "theme park ride",
    "chain swing", "bumper car", "carousel", "escalator", "quay wall", "quay slipway",
    "slipway", "passenger boarding bridge", "boarding bridge", "station entrance canopy",
    "metro platform", "platform end", "loading dock", "giant corner led screen",
    "led screen", "grain silo", "silo set", "water tower", "gas storage tank",
    "gas tanks", "storage tank", "primary crusher", "crusher plant",
    "reactor room", "electrical substation", "conveyor transfer tower", "conveyor",
    "refinery column", "column unit", "process column", "distillation column",
    "industrial column"
)
FACADE_ONLY_TERMS = ("facade", "frontage", "shopfront", "shop front", "storefront", "izakaya front")
EXCLUDE = ("horror", "abandoned", "post-apocalyptic", "medieval", "fantasy", "zombie", "military", "battle", "weapon", "ruin", "derelict", "western", "wild west", "christmas", "seasonal")
GENERIC = ("building", "house", "apartment", "block", "tower", "office", "hotel", "terminal", "campus", "factory", "warehouse", "hangar", "school", "hospital", "library", "museum", "station", "hall", "residential", "commercial", "civic", "industrial", "hotel", "fuel station")

def open_with_retries(request, timeout, attempts=4):
    """Retry transient catalogue/CDN failures without hiding permanent errors."""
    transient_statuses = {408, 425, 429, 500, 502, 503, 504}
    for attempt in range(1, attempts + 1):
        try:
            return urllib.request.urlopen(request, timeout=timeout)
        except urllib.error.HTTPError as exc:
            if exc.code not in transient_statuses or attempt >= attempts:
                raise
            retry_after = exc.headers.get("Retry-After") if exc.headers else None
            try:
                delay = float(retry_after)
            except (TypeError, ValueError):
                delay = min(2 ** (attempt - 1), 8)
            time.sleep(min(max(delay, 0.25), 15))
        except urllib.error.URLError:
            if attempt >= attempts:
                raise
            time.sleep(min(2 ** (attempt - 1), 8))
    raise RuntimeError("catalogue request retries exhausted")

def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "UCENO-city-architecture/1.0", "Accept": "application/json"})
    with open_with_retries(req, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))

def get_bytes(url):
    req = urllib.request.Request(url, headers={"User-Agent": "UCENO-city-architecture/1.0"})
    with open_with_retries(req, timeout=120) as response:
        return response.read(MAX_BYTES + 1)

def dimensions(record):
    d = record.get("dimensions") or {}
    try:
        return float(d["x"]), float(d["y"]), float(d["z"])
    except (KeyError, TypeError, ValueError):
        return None

def contains_term(text, term):
    # Match complete words/phrases; "airport" must not match "port".
    return re.search(r"(?<!\w)" + re.escape(term) + r"(?!\w)", text) is not None

def screen(record, city):
    slug = record.get("slug")
    if not isinstance(slug, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{1,79}", slug):
        return "invalid-model-slug"
    category = record.get("category")
    if isinstance(category, dict):
        category = category.get("slug") or category.get("title") or category.get("name")
    category_key = re.sub(r"[^a-z]", "", str(category or "").lower())
    if category_key not in {"building", "buildings"}:
        return "not-building-category"
    if record.get("license") != "CC0-1.0":
        return "not-explicit-cc0"
    if record.get("deprecated"):
        return "deprecated"
    dims = dimensions(record)
    if not dims:
        return "missing-dimensions"
    x, y, z = dims
    if min(x, z) < 4.0 or y < 5.0:
        return "undersized-or-thin"
    if city == "EclipseCentral" and y < 35.0:
        return "eclipse-tower-below-35m"
    files = record.get("files") or []
    lods = {f.get("lod"): f for f in files if isinstance(f, dict)}
    if not {0, 1, 2}.issubset(lods):
        return "missing-three-lod-levels"
    if any(not isinstance(lods[i].get("sha256"), str) or
           re.fullmatch(r"[0-9a-fA-F]{64}", lods[i]["sha256"]) is None
           for i in (0, 1, 2)):
        return "missing-or-invalid-lod-checksum"
    if any(re.fullmatch(
        rf"/models/{re.escape(slug)}/v[1-9][0-9]*/lod{i}\.glb",
        str(lods[i].get("path", ""))) is None for i in (0, 1, 2)):
        return "unpinned-or-unsafe-glb-lod-path"
    if lods[0].get("bytes", MAX_BYTES + 1) > MAX_BYTES:
        return "lod0-over-25-mib"
    text = " ".join([record.get("name", ""), record.get("description", ""), " ".join(record.get("tags") or [])]).lower()
    if any(term in text for term in NON_OCCUPIABLE) or any(
        term in str(record.get("name") or "").lower() for term in FACADE_ONLY_TERMS
    ):
        return "non-occupiable-infrastructure"
    if any(term in text for term in EXCLUDE):
        return "unwanted-theme"
    # A generic building is not automatically suitable for every city.
    # Require at least one explicit city-theme term before acquisition so
    # catalogue scarcity cannot silently mislabel assets across districts.
    if city not in CITIES:
        return "insufficient-city-relevance"
    if not any(contains_term(text, term) for term in CITIES[city]):
        return "insufficient-city-relevance"
    if not any(contains_term(text, term) for term in CITY_THEME_ANCHORS.get(city, ())):
        return "insufficient-city-theme-anchor"
    return None

def score(record, city):
    text = " ".join([record.get("name", ""), record.get("description", ""), " ".join(record.get("tags") or [])]).lower()
    city_hits = sum(1 for term in CITIES[city] if contains_term(text, term))
    generic_hits = sum(1 for term in GENERIC if term in text)
    y = dimensions(record)[1]
    return city_hits * 10 + min(generic_hits, 5) * 2 + (5 if y >= 35 else 0)

def allocate_city_candidates(candidate_pools, per_city=PER_CITY):
    """Maximize unique city asset coverage, preferring each model's best-fit city."""
    if not isinstance(per_city, int) or per_city < 1:
        raise ValueError("per_city must be a positive integer")
    cities = sorted(candidate_pools)
    records_by_slug = {}
    for city in cities:
        for record in candidate_pools[city]:
            slug = record.get("slug")
            if isinstance(slug, str) and slug:
                records_by_slug.setdefault(slug, record)
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
    for slug, node in asset_nodes.items():
        add_edge(source, node, 1, 0)

    assignment_edges = {slug: [] for slug in slugs}
    for city in cities:
        for record in candidate_pools[city]:
            slug = record.get("slug")
            if slug not in asset_nodes:
                continue
            edge = add_edge(asset_nodes[slug], city_nodes[city], 1,
                            -score(record, city))
            assignment_edges[slug].append((city, edge))
        # Convex slot costs make the assignment max-min fair: every city
        # gets its first qualified asset before any city receives a second,
        # while city relevance score breaks ties within the same coverage tier.
        for slot in range(per_city):
            # A large first-slot bonus makes coverage a hard priority over
            # relevance score: no city with eligible models is starved merely
            # because another city's catalogue is broader or scores higher.
            add_edge(city_nodes[city], sink, 1, -100000 + slot * 1000)

    # Successive shortest augmenting paths over the residual graph allow an
    # earlier broad-city assignment to be rerouted when that model fits another
    # city better. This avoids order-dependent greedy starvation.
    while True:
        distances = [float("inf")] * len(graph)
        previous_node = [-1] * len(graph)
        previous_edge = [-1] * len(graph)
        queued = [False] * len(graph)
        distances[source] = 0
        queue = deque([source])
        queued[source] = True
        while queue:
            node = queue.popleft()
            queued[node] = False
            for edge_index, edge in enumerate(graph[node]):
                if edge["capacity"] <= 0:
                    continue
                candidate_distance = distances[node] + edge["cost"]
                if candidate_distance >= distances[edge["to"]]:
                    continue
                distances[edge["to"]] = candidate_distance
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
        allocations[city].sort(key=lambda record: (
            -score(record, city), -dimensions(record)[1], record.get("slug", "")))
    return allocations


def verify_glb(data, expected_sha):
    if len(data) < 20 or len(data) > MAX_BYTES or data[:4] != b"glTF":
        raise ValueError("Invalid GLB header or size")
    version = int.from_bytes(data[4:8], "little")
    declared_length = int.from_bytes(data[8:12], "little")
    if version != 2 or declared_length != len(data):
        raise ValueError("GLB is not a complete version-2 binary")
    chunk_length = int.from_bytes(data[12:16], "little")
    chunk_type = int.from_bytes(data[16:20], "little")
    if chunk_type != 0x4E4F534A or 20 + chunk_length > len(data):
        raise ValueError("GLB JSON chunk is missing or malformed")
    document = json.loads(data[20:20 + chunk_length].decode("utf-8").rstrip(" \x00"))
    if document.get("asset", {}).get("version") != "2.0":
        raise ValueError("Embedded glTF asset version is not 2.0")
    digest = hashlib.sha256(data).hexdigest()
    if digest.lower() != expected_sha.lower():
        raise ValueError("SHA-256 does not match published metadata")
    return digest, document.get("extensionsUsed", [])

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    index = get_json(INDEX_URL)
    models = index.get("models")
    if not isinstance(models, list):
        raise RuntimeError("Unexpected tevy models.json schema")
    report = {"source": INDEX_URL, "catalogue_generated": index.get("generated"), "queried_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "policy": "CC0-1.0 complete building category, dimensions, three versioned GLB LODs, <=25 MiB LOD0, SHA-256 and GLB 2.0 validation; visual review and Unity import remain pending", "cities": {}}
    all_eligible = [m for m in models if isinstance(m, dict)]
    candidate_pools = {}
    rejection_pools = {}
    for city in CITIES:
        rejected = {}
        candidates = []
        for record in all_eligible:
            reason = screen(record, city)
            if reason:
                rejected[reason] = rejected.get(reason, 0) + 1
                continue
            candidates.append(record)
        candidates.sort(key=lambda r: (-score(r, city), -dimensions(r)[1], r.get("slug", "")))
        candidate_pools[city] = candidates
        rejection_pools[city] = rejected

    # A global max-flow assignment with fair city slots prevents broad catalogues
    # from consuming every shared candidate while a smaller city remains empty.
    allocations = allocate_city_candidates(candidate_pools)
    for city in sorted(CITIES, key=lambda name: (len(candidate_pools[name]), name)):
        acquired = []
        for record in allocations[city]:
            slug = record["slug"]
            meta = get_json(f"{BASE}/models/{slug}.json")
            detail_record = dict(meta)
            detail_record.setdefault("slug", slug)
            detail_reason = screen(detail_record, city)
            if detail_reason:
                raise ValueError(f"{slug}: detail metadata failed city asset screen: {detail_reason}")
            if meta.get("license") != "CC0-1.0" or meta.get("deprecated") or meta.get("slug", slug) != slug:
                raise ValueError(f"{slug}: detail metadata identity/licence/deprecation mismatch")
            version = int(meta.get("version", 0))
            if version < 1:
                raise ValueError(f"{slug}: invalid version")
            files = {f.get("lod"): f for f in meta.get("files", []) if isinstance(f, dict)}
            model_dir = OUT / city
            model_dir.mkdir(parents=True, exist_ok=True)
            lod_records = []
            for lod in (0, 1, 2):
                file_info = files.get(lod)
                if not file_info:
                    raise ValueError(f"{slug}: missing LOD{lod} detail metadata")
                path = file_info.get("path")
                expected_path = f"/models/{slug}/v{version}/lod{lod}.glb"
                if path != expected_path:
                    raise ValueError(f"{slug}: unpinned or unexpected LOD{lod} path")
                data = get_bytes(BASE + path)
                digest, extensions = verify_glb(data, file_info.get("sha256", ""))
                target = model_dir / f"{slug}-lod{lod}.glb"
                target.write_bytes(data)
                lod_records.append({"lod": lod, "file": f"{city}/{target.name}", "bytes": len(data), "sha256": digest, "triangles": file_info.get("triangles"), "extensions_used": extensions})
            acquired.append({"slug": slug, "name": meta.get("name"), "version": version, "license": meta.get("license"), "dimensions_m": meta.get("dimensions"), "preview": BASE + meta.get("preview", ""), "source_url": f"{BASE}/models/{slug}", "lods": lod_records, "status": "binary-verified; visual-review-pending; unity-import-pending"})
        report["cities"][city] = {
            "eligible_catalogue_count": len(candidate_pools[city]),
            "allocated_candidates": [{
                "slug": record["slug"],
                "name": record.get("name"),
                "relevance_score": score(record, city),
                "dimensions_m": record.get("dimensions"),
            } for record in allocations[city]],
            "rejection_counts": rejection_pools[city],
            "selected_and_acquired": acquired,
        }
        print(f"{city}: {len(candidate_pools[city])} eligible catalogue buildings; acquired {len(acquired)}")
    report["total_models"] = sum(len(v["selected_and_acquired"]) for v in report["cities"].values())
    (OUT / "tevy-acquisition-manifest.json").write_text(json.dumps(report, indent=2) + "\n")
    shortfalls = {
        city: len(value["selected_and_acquired"])
        for city, value in report["cities"].items()
        if len(value["selected_and_acquired"]) < PER_CITY
    }
    if shortfalls:
        raise SystemExit(
            f"Incomplete city asset acquisition: each city requires {PER_CITY} "
            f"unique verified building candidates; acquired counts: {shortfalls}. "
            "Partial evidence is retained, but no complete-pack coverage claim is allowed."
        )

if __name__ == "__main__":
    main()
