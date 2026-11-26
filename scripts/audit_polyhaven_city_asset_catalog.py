#!/usr/bin/env python3
"""Audit Poly Haven's live CC0 catalogue for UCENO's nine-city asset needs.

This is an inventory tool, not an importer. It never claims a catalogue match is
a finished city prefab: Unity import, materials, LODs, colliders and visual review
remain separate gates.
"""
from __future__ import annotations

import json
import re
import urllib.request
from collections import defaultdict

API = "https://api.polyhaven.com"
UA = "UCENO-Virtual-World-AssetAudit/1.0 (+https://github.com/ukaeke-stack/uceno-social)"
CITIES = ("solstice", "verdant", "nexus", "aurora", "saffron", "monsoon", "eclipse", "origin", "atlas")

# Search intent, not hard guarantees. Results are manually reviewed before use.
ROLES = {
    "architecture": ("building", "architecture", "house", "urban", "industrial", "bridge", "tower", "facade"),
    "environment": ("tree", "plant", "vegetation", "grass", "rock", "street", "lamp", "bench", "fountain"),
    "landmark": ("monument", "statue", "tower", "museum", "bridge", "pavilion", "sculpture", "fountain", "landmark"),
}

def get_json(path: str):
    request = urllib.request.Request(API + path, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))

def words(asset: dict) -> str:
    return " ".join([
        str(asset.get("name", "")),
        str(asset.get("description", "")),
        str(asset.get("category", "")),
        " ".join(asset.get("tags") or []),
    ]).lower()

def matching_terms(searchable: str, terms: tuple[str, ...]) -> list[str]:
    """Return whole-word catalogue matches; underscores and hyphens are separators."""
    normalized = re.sub(r"[_-]+", " ", searchable.lower())
    return [term for term in terms if re.search(r"\b" + re.escape(term) + r"\b", normalized)]


def main():
    models = get_json("/assets?type=models")
    hdris = get_json("/assets?type=hdris")
    textures = get_json("/assets?type=textures")

    print("UCENO POLY HAVEN CATALOGUE AUDIT")
    print("Source: https://polyhaven.com | Asset licence: CC0 1.0")
    print("API use requires a visible Powered by Poly Haven credit.")
    print(f"Catalogue totals: {len(models)} models, {len(textures)} texture sets, {len(hdris)} HDRIs")
    print("")

    candidates = defaultdict(list)
    for asset_id, asset in models.items():
        searchable = words(asset)
        for role, terms in ROLES.items():
            hits = matching_terms(searchable, terms)
            if hits:
                candidates[role].append({
                    "id": asset_id,
                    "name": asset.get("name"),
                    "category": asset.get("category"),
                    "polycount": asset.get("polycount"),
                    "lods": bool(asset.get("lods", False)),
                    "matched_terms": hits,
                    "url": f"https://polyhaven.com/a/{asset_id}",
                })

    for role in ROLES:
        rows = sorted(candidates[role], key=lambda row: (not row["lods"], row["polycount"] or 10**12, row["name"] or ""))
        print(f"{role.upper()} CANDIDATES: {len(rows)}")
        for row in rows[:80]:
            print(json.dumps(row, ensure_ascii=False))
        print("")

    print("HDRI CANDIDATES:")
    for asset_id, asset in sorted(hdris.items(), key=lambda item: item[1].get("name", "")):
        searchable = words(asset)
        if any(term in searchable for term in ("city", "urban", "street", "town", "building", "industrial", "coast", "forest", "desert", "mountain")):
            print(json.dumps({
                "id": asset_id,
                "name": asset.get("name"),
                "category": asset.get("category"),
                "url": f"https://polyhaven.com/a/{asset_id}",
            }, ensure_ascii=False))

    print("")
    print("RELEASE-GATE NOTE:")
    print(f"Required by the current specification: {len(CITIES) * 12} city-specific prefabs and {len(CITIES)} city HDRIs.")
    print("This audit only identifies possible source assets. It does not prove there are enough unique, suitable assets.")
    print("No files are downloaded, no Unity prefabs are created, and no city is marked complete.")

if __name__ == "__main__":
    main()
