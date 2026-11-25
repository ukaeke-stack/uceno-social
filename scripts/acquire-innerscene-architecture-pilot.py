#!/usr/bin/env python3
"""Acquire a provenance-pinned Innerscene CC0 architecture pilot.

This is a structural inspection stage only. It does not certify visual quality,
Unity import, authored LODs, or suitability for any final city scene.
"""
import hashlib
import html
import json
import pathlib
import re
import struct
import urllib.request
from html.parser import HTMLParser
from urllib.parse import urlparse

OUT = pathlib.Path("artifacts/innerscene-architecture-pilot")
UA = "UCENO-architecture-pilot/1.2"
CITY_IDS = (
    "solstice", "verdant", "nexus", "aurora", "saffron",
    "monsoon", "eclipse", "origin", "atlas",
)
MAX_DOWNLOAD_BYTES = 30 * 1024 * 1024
MAX_SOURCE_PAGE_BYTES = 2 * 1024 * 1024
ASSETS = [
    {
        "id": "innerscene-residential-tower-ab650cbf",
        "asset_class": "architecture",
        "candidate_city_ids": ["solstice", "verdant", "monsoon"],
        "name": "Residential tower",
        "city_role": "generic residential skyline candidate; city assignment pending art review",
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/residential-tower-ab650cbf",
        "download_url": "https://files.innerscene.com/library/residential-tower-ab650cbf/bece214b7b01a29cedec/residential-tower.glb",
        "license": "CC0",
        "listed_size_bytes": 17.2 * 1024 * 1024,
        "listed_dimensions_m": [33.2, 26.8, 86.9],
    },
    {
        "id": "innerscene-mixed-use-high-rise-27a41221",
        "asset_class": "architecture",
        "candidate_city_ids": ["nexus", "eclipse"],
        "name": "Mixed-use high-rise",
        "city_role": "generic mixed-use skyline candidate; city assignment pending art review",
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/mixed-use-high-rise-27a41221",
        "download_url": "https://files.innerscene.com/library/mixed-use-high-rise-27a41221/a1828516e07b80de4f5e/mixed-use-high-rise.glb",
        "license": "CC0",
        "listed_size_bytes": 23.1 * 1024 * 1024,
        "listed_dimensions_m": [56.24, 42.32, 134.604],
    },
    {
        "id": "innerscene-library-building-362b4104",
        "asset_class": "architecture",
        "candidate_city_ids": ["origin"],
        "name": "Library building",
        "city_role": "civic/education architecture candidate for Origin Plains; assignment pending art review",
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/library-building-362b4104",
        "download_url": "https://files.innerscene.com/library/library-building-362b4104/2650e8edf31a11641da2/library-building.glb",
        "license": "CC0",
        "listed_size_bytes": 26.4 * 1024 * 1024,
        "listed_dimensions_m": [31.3, 23.1, 16.5],
    },
    {
        "id": "innerscene-stepped-art-deco-tower-352816d9",
        "asset_class": "architecture",
        "candidate_city_ids": ["eclipse"],
        "name": "Stepped art-deco tower",
        "city_role": "distinctive skyline/landmark candidate for Eclipse Central; assignment pending art review",
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/stepped-art-deco-tower-352816d9",
        "download_url": "https://files.innerscene.com/library/stepped-art-deco-tower-352816d9/906293bd5162bcfe9e88/stepped-art-deco-tower.glb",
        "license": "CC0",
        "listed_size_bytes": 11.8 * 1024 * 1024,
        "listed_dimensions_m": [42.0, 37.2, 173.4],
    },

    {
        "id": "innerscene-three-storey-office-building-16b33ce5",
        "name": "Three-storey office building",
        "asset_class": "architecture",
        "city_role": "complete low-rise office building; candidate fit for Nexus Delta or Origin Plains, pending art review",
        "candidate_city_ids": ["nexus", "origin"],
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/three-storey-office-building-16b33ce5",
        "download_url": "https://www.innerscene.com/api/library/three-storey-office-building-16b33ce5/download",
        "license": "CC0",
        "listed_size_bytes": 13.0 * 1024 * 1024,
        "listed_dimensions_m": [30.196, 20.936, 11.595]
    },
    {
        "id": "innerscene-twenty-storey-glass-office-tower-0f2e9425",
        "name": "Twenty-storey glass office tower",
        "asset_class": "architecture",
        "city_role": "complete high-rise office tower; candidate fit for Nexus Delta or Eclipse Central, pending art review",
        "candidate_city_ids": ["nexus", "eclipse"],
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/twenty-storey-glass-office-tower-0f2e9425",
        "download_url": "https://www.innerscene.com/api/library/twenty-storey-glass-office-tower-0f2e9425/download",
        "license": "CC0",
        "listed_size_bytes": 13.4 * 1024 * 1024,
        "listed_dimensions_m": [32.189, 27.736, 72.795]
    },
    {
        "id": "innerscene-eight-storey-residential-tower-7f8f2226",
        "name": "Eight-storey residential tower",
        "asset_class": "architecture",
        "city_role": "complete residential tower; candidate fit for Solstice Bay, Verdant Reach or Monsoon Harbour, pending art review",
        "candidate_city_ids": ["solstice", "verdant", "monsoon"],
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/eight-storey-residential-tower-7f8f2226",
        "download_url": "https://www.innerscene.com/api/library/eight-storey-residential-tower-7f8f2226/download",
        "license": "CC0",
        "listed_size_bytes": 15.8 * 1024 * 1024,
        "listed_dimensions_m": [20.2, 22.841, 24.872]
    },
    {
        "id": "innerscene-low-rise-office-block-d9ac3f06",
        "name": "Low-rise office block",
        "asset_class": "architecture",
        "city_role": "complete four-storey office block; candidate fit for Verdant Reach, Nexus Delta or Origin Plains, pending art review",
        "candidate_city_ids": ["verdant", "nexus", "origin"],
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/low-rise-office-block-d9ac3f06",
        "download_url": "https://www.innerscene.com/api/library/low-rise-office-block-d9ac3f06/download",
        "license": "CC0",
        "listed_size_bytes": 17.3 * 1024 * 1024,
        "listed_dimensions_m": [61.2, 24.3, 18.7]
    },
    {
        "id": "innerscene-glass-office-skyscraper-40-floors-4b927b20",
        "name": "Glass office skyscraper 40 floors",
        "asset_class": "architecture",
        "city_role": "complete forty-storey office tower; candidate fit for Eclipse Central or Nexus Delta, pending art review",
        "candidate_city_ids": ["eclipse", "nexus"],
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/glass-office-skyscraper-40-floors-4b927b20",
        "download_url": "https://www.innerscene.com/api/library/glass-office-skyscraper-40-floors-4b927b20/download",
        "license": "CC0",
        "listed_size_bytes": 12.0 * 1024 * 1024,
        "listed_dimensions_m": [50.4, 47.4, 170.4]
    },
    {
        "id": "innerscene-steel-portal-frame-factory-4b7fe547",
        "name": "Steel portal-frame factory 40 x 24 m with office block and loading dock",
        "asset_class": "architecture",
        "city_role": "complete industrial factory with office block and loading dock; candidate fit for Atlas Frontier, pending art review",
        "candidate_city_ids": ["atlas"],
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/steel-portal-frame-factory-40-x-24-m-with-office-block-and-l-4b7fe547",
        "download_url": "https://www.innerscene.com/api/library/steel-portal-frame-factory-40-x-24-m-with-office-block-and-l-4b7fe547/download",
        "license": "CC0",
        "listed_size_bytes": 2.0 * 1024 * 1024,
        "listed_dimensions_m": [40.8, 44.48, 10.741]
    },
    {
        "id": "innerscene-port-crane-terminal-building-689a9f00",
        "name": "Port crane terminal building",
        "asset_class": "architecture",
        "city_role": "complete port terminal and ship-to-shore crane complex; candidate fit for Monsoon Harbour or Atlas Frontier, pending art review",
        "candidate_city_ids": ["monsoon", "atlas"],
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/port-crane-terminal-building-689a9f00",
        "download_url": "https://www.innerscene.com/api/library/port-crane-terminal-building-689a9f00/download",
        "license": "CC0",
        "listed_size_bytes": 14.4 * 1024 * 1024,
        "listed_dimensions_m": [140.0, 112.0, 75.052]
    },
    {
        "id": "innerscene-kerala-style-house-c09f61a9",
        "name": "Kerala-style house with sloped tiled roof",
        "asset_class": "architecture",
        "city_role": "complete tropical residential house with laterite plinth, tiled roofs and verandah; candidate fit for Monsoon Harbour, pending art review",
        "candidate_city_ids": ["monsoon"],
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/kerala-style-house-with-sloped-tiled-roof-c09f61a9",
        "download_url": "https://www.innerscene.com/api/library/kerala-style-house-with-sloped-tiled-roof-c09f61a9/download",
        "license": "CC0",
        "listed_size_bytes": 20.1 * 1024 * 1024,
        "listed_dimensions_m": [13.336, 11.568, 8.551]
    },,
    {
        "id": "innerscene-a-frame-cabin-73442f48",
        "name": "A-frame cabin",
        "asset_class": "architecture",
        "city_role": "alpine residential and visitor-lodge candidate for Aurora Heights; assignment pending art review",
        "candidate_city_ids": ["aurora"],
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/a-frame-cabin-73442f48",
        "download_url": "https://www.innerscene.com/api/library/a-frame-cabin-73442f48/download",
        "license": "CC0",
        "listed_size_bytes": 7.3 * 1024 * 1024,
        "listed_dimensions_m": [6.540, 9.056, 6.006],
    },
    {
        "id": "innerscene-telescope-observatory-dome-4fd84b60",
        "name": "Telescope observatory dome",
        "asset_class": "landmark",
        "city_role": "mountain research observatory candidate for Aurora Heights; assignment pending art review",
        "candidate_city_ids": ["aurora"],
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/telescope-observatory-dome-4fd84b60",
        "download_url": "https://www.innerscene.com/api/library/telescope-observatory-dome-4fd84b60/download",
        "license": "CC0",
        "listed_size_bytes": 9.3 * 1024 * 1024,
        "listed_dimensions_m": [8.7, 9.9, 8.5],
    },
    {
        "id": "innerscene-snow-field-69a03368",
        "name": "Snow field",
        "asset_class": "environment",
        "city_role": "alpine ground-cover environment candidate for Aurora Heights; assignment pending art review",
        "candidate_city_ids": ["aurora"],
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/snow-field-69a03368",
        "download_url": "https://www.innerscene.com/api/library/snow-field-69a03368/download",
        "license": "CC0",
        "listed_size_bytes": 3.7 * 1024 * 1024,
        "listed_dimensions_m": [24.0, 24.0, 1.0],
    },
    {
        "id": "innerscene-sand-dune-68ae30e2",
        "name": "Sand dune",
        "asset_class": "environment",
        "city_role": "desert terrain and landscape candidate for Saffron Dunes; assignment pending art review",
        "candidate_city_ids": ["saffron"],
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/sand-dune-68ae30e2",
        "download_url": "https://www.innerscene.com/api/library/sand-dune-68ae30e2/download",
        "license": "CC0",
        "listed_size_bytes": 5.7 * 1024 * 1024,
        "listed_dimensions_m": [120.0, 120.0, 13.1],
    },
    {
        "id": "innerscene-ottoman-classical-mosque-d1141513",
        "name": "Ottoman classical mosque, central dome and 2 minarets",
        "asset_class": "landmark",
        "city_role": "cultural and courtyard landmark candidate for Saffron Dunes; assignment pending art review",
        "candidate_city_ids": ["saffron"],
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/ottoman-classical-mosque-central-dome-and-2-minarets-d1141513",
        "download_url": "https://www.innerscene.com/api/library/ottoman-classical-mosque-central-dome-and-2-minarets-d1141513/download",
        "license": "CC0",
        "listed_size_bytes": 1.7 * 1024 * 1024,
        "listed_dimensions_m": [63.0, 96.5, 63.66],
    },
    {
        "id": "innerscene-street-market-lane-bb6125c2",
        "name": "Street market lane with 12 stalls",
        "asset_class": "architecture",
        "city_role": "open-air souk and public-realm structure candidate for Saffron Dunes; assignment pending art review",
        "candidate_city_ids": ["saffron"],
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/street-market-lane-with-12-stalls-bb6125c2",
        "download_url": "https://www.innerscene.com/api/library/street-market-lane-with-12-stalls-bb6125c2/download",
        "license": "CC0",
        "listed_size_bytes": 2.5 * 1024 * 1024,
        "listed_dimensions_m": [40.0, 13.0, 3.1],
    },
    {
        "id": "innerscene-canyon-wall-cf1dd925",
        "name": "Canyon wall",
        "asset_class": "environment",
        "city_role": "desert canyon terrain and landscape candidate for Saffron Dunes; assignment pending art review",
        "candidate_city_ids": ["saffron"],
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/canyon-wall-cf1dd925",
        "download_url": "https://www.innerscene.com/api/library/canyon-wall-cf1dd925/download",
        "license": "CC0",
        "listed_size_bytes": 7.8 * 1024 * 1024,
        "listed_dimensions_m": [24.0, 48.0, 37.93],
    }
]



def city_candidate_coverage(assets=None):
    """Count source candidates by city and role without treating them as accepted art."""
    coverage = {
        city: {"candidate_count": 0, "architecture": 0, "environment": 0, "landmark": 0}
        for city in CITY_IDS
    }
    for asset in ASSETS if assets is None else assets:
        city_ids = asset.get("candidate_city_ids") or []
        if not isinstance(city_ids, list) or len(city_ids) != len(set(city_ids)):
            raise ValueError("Candidate city assignments must be a unique list")
        asset_class = asset.get("asset_class")
        if asset_class not in {"architecture", "environment", "landmark"}:
            raise ValueError(f"Unknown candidate asset class: {asset_class}")
        for city in city_ids:
            if city not in coverage:
                raise ValueError(f"Unknown candidate city: {city}")
            coverage[city]["candidate_count"] += 1
            coverage[city][asset_class] += 1
    return coverage


class _TextCollector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, data):
        if data and data.strip():
            self.parts.append(data.strip())


def source_page_text(raw_html):
    parser = _TextCollector()
    parser.feed(raw_html)
    parser.close()
    return " ".join(html.unescape(" ".join(parser.parts)).split())


def verify_source_page(asset, raw_html):
    """Recheck the publisher page before trusting hard-coded CC0/GLB metadata."""
    page = urlparse(asset.get("source_page", ""))
    if page.scheme != "https" or page.hostname != "www.innerscene.com":
        raise ValueError("Source page must be an HTTPS Innerscene library page")
    if not page.path.startswith("/tools/library/3d-parts/"):
        raise ValueError("Source page is outside the Innerscene 3D parts library")
    text = source_page_text(raw_html)
    folded = text.casefold()
    if asset["name"].casefold() not in folded:
        raise ValueError("Source page title does not match the candidate")
    if "public domain (cc0)" not in folded and "cc0 1.0" not in folded:
        raise ValueError("Source page does not explicitly confirm CC0")
    if "glb" not in folded or "gltf binary" not in folded:
        raise ValueError("Source page does not confirm a binary glTF model")
    if "real-world scale" not in folded:
        raise ValueError("Source page does not confirm real-world scale")
    dimensions = asset.get("listed_dimensions_m") or []
    if len(dimensions) != 3 or any(not isinstance(value, (int, float)) or value <= 0 for value in dimensions):
        raise ValueError("Candidate must declare three positive source dimensions")
    numeric_tokens = [float(value) for value in re.findall(r"(?<![A-Za-z])\d+(?:\.\d+)?", text)]
    for dimension in dimensions:
        tolerance = max(0.02, float(dimension) * 0.01)
        metre_match = any(abs(token - float(dimension)) <= tolerance for token in numeric_tokens)
        millimetre_match = any(abs(token - float(dimension) * 1000.0) <= max(20.0, float(dimension) * 10.0)
                               for token in numeric_tokens)
        if not metre_match and not millimetre_match:
            raise ValueError(f"Source page does not substantiate dimension {dimension} m")
    return {
        "title_verified": True,
        "license_verified": "CC0",
        "format_verified": "GLB 2.0 source page",
        "real_world_scale_verified": True,
        "dimensions_verified": True,
    }


def fetch_source_page(asset):
    request = urllib.request.Request(asset["source_page"], headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=45) as response:
        payload = response.read(MAX_SOURCE_PAGE_BYTES + 1)
    if len(payload) > MAX_SOURCE_PAGE_BYTES:
        raise ValueError("Source page exceeds the 2 MiB metadata cap")
    return payload.decode("utf-8", errors="replace")


def download_glb(asset):
    download = urlparse(asset["download_url"])
    if download.scheme != "https" or download.hostname not in {"www.innerscene.com", "files.innerscene.com"}:
        raise ValueError("Download URL is not an approved HTTPS Innerscene endpoint")
    request = urllib.request.Request(asset["download_url"], headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=90) as response:
        final_url = response.geturl()
        final = urlparse(final_url)
        if final.scheme != "https" or final.hostname != "files.innerscene.com":
            raise ValueError("Download redirect did not resolve to the Innerscene file host")
        payload = response.read(MAX_DOWNLOAD_BYTES + 1)
    if len(payload) > MAX_DOWNLOAD_BYTES:
        raise ValueError("GLB exceeds the 30 MiB pilot download cap")
    return payload, final_url

def parse_glb(path):
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError("GLB is too small to contain a valid header and JSON chunk")
    magic, version, total = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or total != len(data):
        raise ValueError(f"Invalid GLB header: magic={magic!r}, version={version}, declared={total}, actual={len(data)}")
    offset = 12
    document = None
    binary = None
    chunks = []
    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError("Truncated GLB chunk header")
        size, kind = struct.unpack_from("<I4s", data, offset)
        offset += 8
        end = offset + size
        if end > len(data):
            raise ValueError("Truncated GLB chunk payload")
        chunks.append({"type": kind.decode("ascii", "replace"), "bytes": size})
        if kind == b"JSON":
            document = json.loads(data[offset:end].decode("utf-8").rstrip(" \t\r\n\0"))
        elif kind == b"BIN\0":
            binary = data[offset:end]
        offset = end
    if document is None:
        raise ValueError("GLB has no JSON chunk")
    if document.get("asset", {}).get("version") != "2.0":
        raise ValueError("Embedded glTF asset version is not 2.0")
    meshes = document.get("meshes", [])
    primitives = [p for m in meshes for p in m.get("primitives", [])]
    materials = document.get("materials", [])
    images = document.get("images", [])
    textures = document.get("textures", [])
    if not meshes or not any(mesh.get("primitives") for mesh in meshes):
        raise ValueError("GLB has no renderable mesh primitives")
    if not materials:
        raise ValueError("GLB has no materials")
    if any(image.get("uri") for image in images):
        raise ValueError("GLB references external image files instead of being self-contained")
    nodes = document.get("nodes", [])
    accessors = document.get("accessors", [])
    buffer_views = document.get("bufferViews", [])
    triangles = 0
    triangle_counts_known = True
    uv_primitives = 0
    normal_primitives = 0
    position_bounds = []
    for primitive in primitives:
        attrs = primitive.get("attributes", {})
        uv_primitives += int("TEXCOORD_0" in attrs)
        normal_primitives += int("NORMAL" in attrs)
        position_index = attrs.get("POSITION")
        if position_index is not None:
            accessor = accessors[position_index]
            if "min" in accessor and "max" in accessor:
                position_bounds.append((accessor["min"], accessor["max"]))
        if primitive.get("mode", 4) != 4:
            continue
        index = primitive.get("indices")
        if index is None:
            count = accessors[position_index].get("count") if position_index is not None else None
        else:
            count = accessors[index].get("count")
        if count is None:
            triangle_counts_known = False
        else:
            triangles += int(count) // 3
    image_checks = []
    if images and binary is None:
        raise ValueError("Images are declared but the GLB has no embedded BIN chunk")
    for image in images:
        view_index = image.get("bufferView")
        if view_index is None:
            image_checks.append({"name": image.get("name"), "status": "external-uri", "uri": image.get("uri")})
            continue
        view = buffer_views[view_index]
        start = int(view.get("byteOffset", 0))
        end = start + int(view["byteLength"])
        if end > len(binary):
            raise ValueError(f"Embedded image bufferView exceeds BIN chunk: {image.get('name')}")
        payload = binary[start:end]
        mime = image.get("mimeType", "")
        valid_signature = (
            (mime == "image/png" and payload.startswith(b"\x89PNG\r\n\x1a\n")) or
            (mime == "image/jpeg" and payload.startswith(b"\xff\xd8\xff"))
        )
        if not valid_signature:
            raise ValueError(f"Embedded image signature mismatch for {image.get('name')}: {mime}")
        image_checks.append({"name": image.get("name"), "mime_type": mime, "bytes": len(payload), "status": "signature-valid"})
    if position_bounds:
        minimum = [min(pair[0][axis] for pair in position_bounds) for axis in range(3)]
        maximum = [max(pair[1][axis] for pair in position_bounds) for axis in range(3)]
        spans = [round(maximum[axis] - minimum[axis], 4) for axis in range(3)]
    else:
        minimum, maximum, spans = None, None, None
    return {
        "glb_bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "gltf_version": document.get("asset", {}).get("version"),
        "generator": document.get("asset", {}).get("generator"),
        "embedded_copyright": document.get("asset", {}).get("copyright"),
        "scene_count": len(document.get("scenes", [])),
        "node_count": len(nodes),
        "mesh_count": len(meshes),
        "primitive_count": len(primitives),
        "material_count": len(materials),
        "texture_count": len(textures),
        "image_count": len(images),
        "image_checks": image_checks,
        "accessor_count": len(accessors),
        "triangle_count_estimate": triangles if triangle_counts_known else None,
        "triangle_count_complete": triangle_counts_known,
        "primitives_with_uv0": uv_primitives,
        "primitives_with_normals": normal_primitives,
        "position_bounds_min_xyz": minimum,
        "position_bounds_max_xyz": maximum,
        "position_span_xyz_m": spans,
        "lod_extension_present": "MSFT_lod" in document.get("extensionsUsed", []),
        "external_image_uris": [image.get("uri") for image in images if image.get("uri")],
        "chunks": chunks,
    }

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {
        "stage": "CC0 source page and GLB structure checked; candidate only, not visually or Unity accepted",
        "source": "Innerscene Free Parts Library",
        "asset_count_requested": len(ASSETS),
        "candidate_city_coverage": city_candidate_coverage(),
        "coverage_note": "Counts are source candidates only; they are not unique final-city allocations, imported prefabs, visual approvals, or release-gate eligibility.",
        "cities_without_candidates": [
            city for city, counts in city_candidate_coverage().items()
            if counts["candidate_count"] == 0
        ],
        "assets": [],
    }
    failures = []
    for asset in ASSETS:
        record = {
            **asset,
            "listed_size_bytes_approx": int(asset["listed_size_bytes"]),
            "city_assignment_status": "candidate_only_pending_visual_review",
            "visual_review_status": "pending",
            "unity_import_status": "not_imported",
            "release_gate_eligible": False,
        }
        try:
            if asset.get("license") != "CC0":
                raise ValueError("Non-CC0 candidate rejected")
            source_verification = verify_source_page(asset, fetch_source_page(asset))
            payload, final_download_url = download_glb(asset)
            target = OUT / f'{asset["id"]}.glb'
            target.write_bytes(payload)
            structural = parse_glb(target)
            record.update({
                "source_metadata_verification": source_verification,
                "final_download_url": final_download_url,
                "structural_inspection": structural,
                "status": "downloaded_glb_structure_valid_visual_review_pending",
            })
            print(f'{asset["name"]}: {structural["glb_bytes"]} bytes; {structural["mesh_count"]} meshes; {structural["material_count"]} materials; {structural["triangle_count_estimate"]} triangles; sha256 {structural["sha256"]}')
        except Exception as error:
            record.update({
                "status": "acquisition_failed",
                "error": f"{type(error).__name__}: {error}",
            })
            failures.append(asset["id"])
            print(f'{asset["name"]}: FAILED: {type(error).__name__}: {error}')
        report["assets"].append(record)

    (OUT / "inspection-report.json").write_text(json.dumps(report, indent=2) + "\n")
    completed = sum(item["status"] == "downloaded_glb_structure_valid_visual_review_pending"
                    for item in report["assets"])
    print(f"Innerscene pilot: {completed}/{len(ASSETS)} candidates downloaded and structurally inspected.")
    print("No candidate is visually approved, assigned to a final city, imported into Unity, or counted toward the nine-city release gate.")
    if failures:
        raise SystemExit(f"{len(failures)} Innerscene candidates failed source verification or acquisition: {', '.join(failures)}")


if __name__ == "__main__":
    main()
