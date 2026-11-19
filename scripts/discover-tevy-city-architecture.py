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
import urllib.request

BASE = "https://tevy.dev"
INDEX_URL = f"{BASE}/models.json"
OUT = pathlib.Path("artifacts/tevy-city-architecture")
MAX_BYTES = 25 * 1024 * 1024
PER_CITY = 2
CITIES = {
    "SolsticeBay": ("waterfront", "coastal", "harbour", "harbor", "marina", "lighthouse", "hotel", "residential", "apartment", "tower"),
    "VerdantReach": ("green", "garden", "sustainable", "eco", "biophilic", "park", "campus", "residential", "apartment", "office"),
    "NexusDelta": ("skyscraper", "high rise", "high-rise", "tower", "office", "commercial", "mixed use", "mixed-use", "apartment", "city"),
    "AuroraHeights": ("alpine", "mountain", "ski", "snow", "resort", "hotel", "lodge", "glass", "tower", "residential"),
    "SaffronDunes": ("desert", "adobe", "arid", "solar", "sand", "hot", "pueblo", "residential", "hotel", "tower"),
    "MonsoonHarbour": ("harbour", "harbor", "port", "waterfront", "coastal", "tropical", "marina", "terminal", "lighthouse", "warehouse"),
    "EclipseCentral": ("skyscraper", "supertall", "high rise", "high-rise", "tower", "office", "commercial", "city"),
    "OriginPlains": ("university", "campus", "school", "library", "museum", "civic", "hospital", "classroom", "college", "office"),
    "AtlasFrontier": ("industrial", "factory", "warehouse", "hangar", "logistics", "workshop", "manufacturing", "terminal", "plant", "office"),
}
NON_OCCUPIABLE = ("power pylon", "transmission pylon", "pylon", "tv tower", "television tower", "broadcast tower", "radio tower", "harbour crane", "harbor crane", "crane", "chairlift", "ski lift", "tower crown", "glass tower crown", "lobby floor", "cooling tower", "launch tower")
EXCLUDE = ("horror", "abandoned", "post-apocalyptic", "medieval", "fantasy", "zombie", "military", "battle", "weapon", "ruin", "derelict", "western", "wild west", "christmas", "seasonal")
GENERIC = ("building", "house", "apartment", "block", "tower", "office", "hotel", "terminal", "campus", "factory", "warehouse", "hangar", "school", "hospital", "library", "museum", "station", "hall", "residential", "commercial", "civic", "industrial", "hotel", "lighthouse", "fuel station")

def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "UCENO-city-architecture/1.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))

def get_bytes(url):
    req = urllib.request.Request(url, headers={"User-Agent": "UCENO-city-architecture/1.0"})
    with urllib.request.urlopen(req, timeout=120) as response:
        return response.read(MAX_BYTES + 1)

def dimensions(record):
    d = record.get("dimensions") or {}
    try:
        return float(d["x"]), float(d["y"]), float(d["z"])
    except (KeyError, TypeError, ValueError):
        return None

def screen(record, city):
    if record.get("category") != "buildings":
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
    if any(not isinstance(lods[i].get("sha256"), str) or len(lods[i]["sha256"]) != 64 for i in (0, 1, 2)):
        return "missing-lod-checksum"
    if any(not str(lods[i].get("path", "")).endswith(".glb") for i in (0, 1, 2)):
        return "missing-glb-lod"
    if lods[0].get("bytes", MAX_BYTES + 1) > MAX_BYTES:
        return "lod0-over-25-mib"
    text = " ".join([record.get("name", ""), record.get("description", ""), " ".join(record.get("tags") or [])]).lower()
    if any(term in text for term in NON_OCCUPIABLE):
        return "non-occupiable-infrastructure"
    if any(term in text for term in EXCLUDE):
        return "unwanted-theme"
    return None

def score(record, city):
    text = " ".join([record.get("name", ""), record.get("description", ""), " ".join(record.get("tags") or [])]).lower()
    city_hits = sum(1 for term in CITIES[city] if term in text)
    generic_hits = sum(1 for term in GENERIC if term in text)
    y = dimensions(record)[1]
    return city_hits * 10 + min(generic_hits, 5) * 2 + (5 if y >= 35 else 0)

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
    globally_used = set()
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
        selected = [r for r in candidates if r.get("slug") not in globally_used][:PER_CITY]
        acquired = []
        for record in selected:
            slug = record["slug"]
            meta = get_json(f"{BASE}/models/{slug}.json")
            if meta.get("license") != "CC0-1.0" or meta.get("deprecated"):
                raise ValueError(f"{slug}: detail metadata licence/deprecation mismatch")
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
                if not path or not path.startswith(f"/models/{slug}/v{version}/lod{lod}.glb"):
                    raise ValueError(f"{slug}: unpinned or unexpected LOD{lod} path")
                data = get_bytes(BASE + path)
                digest, extensions = verify_glb(data, file_info.get("sha256", ""))
                target = model_dir / f"{slug}-lod{lod}.glb"
                target.write_bytes(data)
                lod_records.append({"lod": lod, "file": f"{city}/{target.name}", "bytes": len(data), "sha256": digest, "triangles": file_info.get("triangles"), "extensions_used": extensions})
            acquired.append({"slug": slug, "name": meta.get("name"), "version": version, "license": meta.get("license"), "dimensions_m": meta.get("dimensions"), "preview": BASE + meta.get("preview", ""), "source_url": f"{BASE}/models/{slug}", "lods": lod_records, "status": "binary-verified; visual-review-pending; unity-import-pending"})
            globally_used.add(slug)
        report["cities"][city] = {"eligible_catalogue_count": len(candidates), "rejection_counts": rejected, "selected_and_acquired": acquired}
        print(f"{city}: {len(candidates)} eligible catalogue buildings; acquired {len(acquired)}")
    report["total_models"] = sum(len(v["selected_and_acquired"]) for v in report["cities"].values())
    (OUT / "tevy-acquisition-manifest.json").write_text(json.dumps(report, indent=2) + "\n")
    if any(not v["selected_and_acquired"] for v in report["cities"].values()):
        raise SystemExit("At least one city lacks a unique acquired building candidate; no coverage claim allowed")

if __name__ == "__main__":
    main()
