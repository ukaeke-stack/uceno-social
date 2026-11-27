#!/usr/bin/env python3
"""Discover and rank Poly Haven CC0 model candidates for UCENO's nine cities.

This is a discovery report only. It does not download, import, assign, or approve
assets. A candidate still requires licence/source verification, visual review,
Unity import, material/texture checks, colliders, LOD validation and city fit.
"""
from __future__ import annotations

import json
import re
import urllib.request
from collections import defaultdict
from pathlib import Path

API = "https://api.polyhaven.com"
OUT = Path("artifacts/polyhaven-city-discovery/candidates.json")
USER_AGENT = "UCENO-Virtual-World-AssetDiscovery/2.0 (+https://github.com/ukaeke-stack/uceno-social)"

# Distinct functional roles make the discovery useful beyond generic "building" hits.
ROLE_TERMS = {
    "residential": ("house", "apartment", "residential", "villa", "townhouse", "cabin"),
    "commercial": ("shop", "store", "market", "mall", "office", "commercial", "restaurant"),
    "civic_cultural": ("museum", "library", "school", "gallery", "civic", "theatre", "theater", "temple"),
    "transport_industrial": ("station", "terminal", "airport", "factory", "warehouse", "industrial", "bridge"),
    "landmark": ("monument", "statue", "tower", "observatory", "pavilion", "sculpture", "fountain"),
    "street_furniture": ("bench", "streetlight", "lamp post", "bus stop", "sign", "bollard", "bin"),
    "vegetation": ("tree", "plant", "bush", "grass", "flower", "palm"),
    "terrain": ("rock", "cliff", "boulder", "sand", "terrain", "mountain"),
    "recreation": ("playground", "sports", "stadium", "pool", "park", "amusement"),
    "interior": ("sofa", "chair", "table", "bed", "kitchen", "interior", "cabinet", "desk"),
}
CITY_THEMES = {
    "SolsticeBay": ("coastal", "waterfront", "marina", "beach", "port"),
    "VerdantReach": ("forest", "garden", "botanical", "rural", "eco"),
    "NexusDelta": ("modern", "technology", "transit", "industrial", "bridge"),
    "AuroraHeights": ("mountain", "alpine", "observatory", "highland", "ski"),
    "SaffronDunes": ("desert", "market", "souq", "oasis", "sandstone"),
    "MonsoonHarbour": ("harbour", "harbor", "rain", "tropical", "dock"),
    "EclipseCentral": ("urban", "downtown", "skyscraper", "plaza", "metro"),
    "OriginPlains": ("farm", "agriculture", "village", "grassland", "ranch"),
    "AtlasFrontier": ("mining", "frontier", "quarry", "energy", "logistics"),
}


def fetch_json(path: str):
    request = urllib.request.Request(
        API + path, headers={"User-Agent": USER_AGENT, "Accept": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def searchable_text(asset: dict) -> str:
    tags = asset.get("tags") or []
    if not isinstance(tags, list):
        tags = []
    raw = " ".join(
        [str(asset.get("name") or ""), str(asset.get("description") or ""),
         str(asset.get("category") or ""), " ".join(map(str, tags))]
    ).lower()
    return re.sub(r"[_-]+", " ", raw)


def hits(text: str, terms: tuple[str, ...]) -> list[str]:
    return [term for term in terms if re.search(r"(?<!\w)" + re.escape(term) + r"(?!\w)", text)]


def main():
    models = fetch_json("/assets?type=models")
    if not isinstance(models, dict):
        raise ValueError("Poly Haven model catalogue response was not an object")

    rows = []
    role_counts = defaultdict(int)
    for asset_id, asset in models.items():
        if not isinstance(asset, dict):
            continue
        text = searchable_text(asset)
        roles = {role: matched for role, terms in ROLE_TERMS.items()
                 if (matched := hits(text, terms))}
        if not roles:
            continue
        themes = {city: matched for city, terms in CITY_THEMES.items()
                  if (matched := hits(text, terms))}
        row = {
            "id": asset_id,
            "name": asset.get("name"),
            "category": asset.get("category"),
            "polycount": asset.get("polycount"),
            "has_lods": bool(asset.get("lods", False)),
            "roles": roles,
            "possible_city_theme_matches": themes,
            "source_url": f"https://polyhaven.com/a/{asset_id}",
            "licence": "CC0 1.0 (verify current asset page before use)",
            "status": "candidate_only_not_approved",
        }
        rows.append(row)
        for role in roles:
            role_counts[role] += 1

    rows.sort(key=lambda item: (
        -len(item["roles"]), not item["has_lods"],
        item["polycount"] if isinstance(item["polycount"], int) else 10**12,
        item["id"],
    ))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "schema_version": 2,
        "source": "Poly Haven public model catalogue",
        "source_url": "https://polyhaven.com",
        "licence_policy": "CC0 only; verify each asset page and retain required source credits",
        "city_count": len(CITY_THEMES),
        "catalogue_model_count": len(models),
        "candidate_count": len(rows),
        "candidate_counts_by_role": dict(sorted(role_counts.items())),
        "candidates": rows,
        "release_gate": {
            "approved_assets": 0,
            "unity_import_verified": False,
            "visual_review_complete": False,
            "note": "Discovery does not satisfy the city prefab or imported-art release gate.",
        },
    }
    OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "candidates"}, indent=2))
    print(f"Candidate report written to {OUT}")


if __name__ == "__main__":
    main()
