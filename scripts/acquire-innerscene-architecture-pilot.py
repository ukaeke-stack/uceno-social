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
        "id": "innerscene-two-storey-clt-building-87faa94c",
        "name": "Two-storey CLT building 6 x 8 m with glulam front frame",
        "asset_class": "architecture",
        "city_role": "small mass-timber community building; sustainable Verdant Reach candidate, pending art review",
        "candidate_city_ids": ["verdant"],
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/two-storey-clt-building-6-x-8-m-with-glulam-front-frame-87faa94c",
        "download_url": "https://www.innerscene.com/api/library/two-storey-clt-building-6-x-8-m-with-glulam-front-frame-87faa94c/download",
        "license": "CC0",
        "listed_size_bytes": 1.2 * 1024 * 1024,
        "listed_dimensions_m": [8.3, 6.3, 6.428]
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
    },
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
        "id": "innerscene-small-neighbourhood-mosque-2e402221",
        "name": "Small neighbourhood mosque, single dome and one minaret",
        "asset_class": "architecture",
        "city_role": "complete neighbourhood mosque building for Saffron Dunes; assignment pending art review",
        "candidate_city_ids": ["saffron"],
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/small-neighbourhood-mosque-single-dome-and-one-minaret-2e402221",
        "download_url": "https://www.innerscene.com/api/library/small-neighbourhood-mosque-single-dome-and-one-minaret-2e402221/download",
        "license": "CC0",
        "listed_size_bytes": 2.7 * 1024 * 1024,
        "listed_dimensions_m": [15.7, 17.7, 30.0]
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

def _checked_index(items, index, label):
    if isinstance(index, bool) or not isinstance(index, int) or index < 0 or index >= len(items):
        raise ValueError(f"{label} index out of range: {index!r}")
    return items[index]


def _checked_nonnegative_int(value, label):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{label} must be a non-negative integer")
    return value


def _validate_accessor_layout(accessor, accessor_index, buffer_views):
    label = f"accessor[{accessor_index}]"
    if "sparse" in accessor:
        raise ValueError(f"{label} sparse accessors are not supported by this acquisition validator")
    if "bufferView" not in accessor:
        raise ValueError(f"{label} must reference a bufferView; sparse-only accessors are not supported")
    view = _checked_index(buffer_views, accessor["bufferView"], f"{label}.bufferView")
    component_sizes = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
    component_type = accessor.get("componentType")
    if isinstance(component_type, bool) or component_type not in component_sizes:
        raise ValueError(f"{label}.componentType is invalid or unsupported")
    component_size = component_sizes[component_type]
    dimensions = {
        "SCALAR": (1, 1), "VEC2": (1, 2), "VEC3": (1, 3), "VEC4": (1, 4),
        "MAT2": (2, 2), "MAT3": (3, 3), "MAT4": (4, 4),
    }
    accessor_type = accessor.get("type")
    if accessor_type not in dimensions:
        raise ValueError(f"{label}.type is invalid")
    columns, rows = dimensions[accessor_type]
    if columns == 1:
        element_size = rows * component_size
    else:
        column_size = rows * component_size
        column_stride = (column_size + 3) // 4 * 4 if component_size < 4 else column_size
        element_size = columns * column_stride
    count = _checked_nonnegative_int(accessor.get("count"), f"{label}.count")
    if count == 0:
        raise ValueError(f"{label} has an empty count")
    accessor_offset = _checked_nonnegative_int(accessor.get("byteOffset", 0), f"{label}.byteOffset")
    view_offset = _checked_nonnegative_int(view.get("byteOffset", 0), f"bufferView[{accessor['bufferView']}].byteOffset")
    view_length = _checked_nonnegative_int(view.get("byteLength"), f"bufferView[{accessor['bufferView']}].byteLength")
    if accessor_offset % component_size or (view_offset + accessor_offset) % component_size:
        raise ValueError(f"{label} byteOffset is not aligned to its component type")
    if columns > 1 and (view_offset + accessor_offset) % 4:
        raise ValueError(f"{label} matrix byteOffset is not 4-byte aligned")
    stride = view.get("byteStride", element_size)
    if isinstance(stride, bool) or not isinstance(stride, int):
        raise ValueError(f"bufferView[{accessor['bufferView']}].byteStride must be an integer")
    if "byteStride" in view and (stride < 4 or stride > 252 or stride % 4):
        raise ValueError(f"bufferView[{accessor['bufferView']}].byteStride must be 4..252 and 4-byte aligned")
    if stride < element_size or stride % component_size:
        raise ValueError(f"{label} element does not fit the bufferView byteStride")
    required_end = accessor_offset + (count - 1) * stride + element_size
    if required_end > view_length:
        raise ValueError(
            f"{label} data range exceeds bufferView[{view_index}] "
            f"(requires {required_end} bytes, has {view_length})"
        )



def _validate_gltf_references(document, buffer_views, accessors, meshes, nodes):
    """Reject invalid glTF cross-references before any downstream indexing."""
    def items(key):
        value = document.get(key, [])
        if not isinstance(value, list):
            raise ValueError(f"glTF {key} must be an array")
        return value

    materials = items("materials")
    textures = items("textures")
    images = items("images")
    samplers = items("samplers")
    cameras = items("cameras")
    skins = items("skins")
    animations = items("animations")

    for index, view in enumerate(buffer_views):
        if "target" in view and view["target"] not in (34962, 34963):
            raise ValueError(f"bufferView[{index}].target is invalid")
        if "byteStride" in view:
            stride = view["byteStride"]
            if isinstance(stride, bool) or not isinstance(stride, int) or stride < 4 or stride > 252 or stride % 4:
                raise ValueError(f"bufferView[{index}].byteStride must be 4..252 and 4-byte aligned")

    for index, texture in enumerate(textures):
        source = texture.get("source")
        if source is not None:
            _checked_index(images, source, f"texture[{index}].source")
        sampler = texture.get("sampler")
        if sampler is not None:
            _checked_index(samplers, sampler, f"texture[{index}].sampler")
        if source is None and not texture.get("extensions"):
            raise ValueError(f"texture[{index}] has no image source or extension source")

    for index, material in enumerate(materials):
        pbr = material.get("pbrMetallicRoughness", {})
        texture_slots = [pbr.get("baseColorTexture"), pbr.get("metallicRoughnessTexture"),
                         material.get("normalTexture"), material.get("occlusionTexture"),
                         material.get("emissiveTexture")]
        for slot_number, slot in enumerate(texture_slots):
            if slot is not None:
                _checked_index(textures, slot.get("index"), f"material[{index}].texture[{slot_number}]")

    for index, mesh in enumerate(meshes):
        primitives = mesh.get("primitives", [])
        if not isinstance(primitives, list) or not primitives:
            raise ValueError(f"mesh[{index}] must contain at least one primitive")
        for primitive_index, primitive in enumerate(primitives):
            label = f"mesh[{index}].primitive[{primitive_index}]"
            attributes = primitive.get("attributes", {})
            if not isinstance(attributes, dict) or "POSITION" not in attributes:
                raise ValueError(f"{label} must reference a POSITION accessor")
            for semantic, accessor_index in attributes.items():
                accessor = _checked_index(accessors, accessor_index, f"{label}.{semantic}")
                if semantic == "POSITION" and accessor.get("type") != "VEC3":
                    raise ValueError(f"{label}.POSITION accessor must be VEC3")
            if "indices" in primitive:
                index_accessor = _checked_index(accessors, primitive["indices"], f"{label}.indices")
                if index_accessor.get("type") != "SCALAR" or index_accessor.get("componentType") not in (5121, 5123, 5125):
                    raise ValueError(f"{label}.indices must use an unsigned SCALAR accessor")
            if "material" in primitive:
                _checked_index(materials, primitive["material"], f"{label}.material")
            if "mode" in primitive and primitive["mode"] not in range(7):
                raise ValueError(f"{label}.mode is invalid")

    parents = {}
    for index, node in enumerate(nodes):
        if "mesh" in node:
            _checked_index(meshes, node["mesh"], f"node[{index}].mesh")
        if "camera" in node:
            _checked_index(cameras, node["camera"], f"node[{index}].camera")
        if "skin" in node:
            _checked_index(skins, node["skin"], f"node[{index}].skin")
        children = node.get("children", [])
        if not isinstance(children, list):
            raise ValueError(f"node[{index}].children must be an array")
        for child in children:
            child_index = _checked_index(nodes, child, f"node[{index}].children")
            if child_index == index:
                raise ValueError(f"node[{index}] cannot be its own child")
            if child_index in parents:
                raise ValueError(f"node[{child_index}] has multiple parents")
            parents[child_index] = index

    for start in range(len(nodes)):
        seen = set()
        current = start
        while current in parents:
            if current in seen:
                raise ValueError("glTF node hierarchy contains a cycle")
            seen.add(current)
            current = parents[current]

    for skin_index, skin in enumerate(skins):
        joints = skin.get("joints", [])
        if not isinstance(joints, list) or not joints:
            raise ValueError(f"skin[{skin_index}].joints must be a non-empty array")
        for joint in joints:
            _checked_index(nodes, joint, f"skin[{skin_index}].joints")
        if "skeleton" in skin:
            _checked_index(nodes, skin["skeleton"], f"skin[{skin_index}].skeleton")
        if "inverseBindMatrices" in skin:
            accessor = _checked_index(accessors, skin["inverseBindMatrices"], f"skin[{skin_index}].inverseBindMatrices")
            if accessor.get("type") != "MAT4":
                raise ValueError(f"skin[{skin_index}].inverseBindMatrices must be MAT4")

    for animation_index, animation in enumerate(animations):
        samplers_for_animation = animation.get("samplers", [])
        for sampler_index, sampler in enumerate(samplers_for_animation):
            input_accessor = _checked_index(accessors, sampler.get("input"), f"animation[{animation_index}].sampler[{sampler_index}].input")
            output_accessor = _checked_index(accessors, sampler.get("output"), f"animation[{animation_index}].sampler[{sampler_index}].output")
            if input_accessor.get("type") != "SCALAR":
                raise ValueError(f"animation[{animation_index}].sampler[{sampler_index}].input must be SCALAR")
            if sampler.get("interpolation", "LINEAR") not in ("LINEAR", "STEP", "CUBICSPLINE"):
                raise ValueError(f"animation[{animation_index}].sampler[{sampler_index}].interpolation is invalid")
        for channel_index, channel in enumerate(animation.get("channels", [])):
            sampler_index = channel.get("sampler")
            _checked_index(samplers_for_animation, sampler_index, f"animation[{animation_index}].channel[{channel_index}].sampler")
            target = channel.get("target", {})
            if "node" in target:
                _checked_index(nodes, target["node"], f"animation[{animation_index}].channel[{channel_index}].target.node")
            if target.get("path") not in ("translation", "rotation", "scale", "weights"):
                raise ValueError(f"animation[{animation_index}].channel[{channel_index}].target.path is invalid")

    for scene_index, scene in enumerate(items("scenes")):
        for node_index in scene.get("nodes", []):
            _checked_index(nodes, node_index, f"scene[{scene_index}].nodes")


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
    json_seen = False
    binary_seen = False
    chunks = []
    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError("Truncated GLB chunk header")
        size, kind = struct.unpack_from("<I4s", data, offset)
        offset += 8
        if size % 4:
            raise ValueError("GLB chunk length is not 4-byte aligned")
        end = offset + size
        if end > len(data):
            raise ValueError("Truncated GLB chunk payload")
        chunks.append({"type": kind.decode("ascii", "replace"), "bytes": size})
        if kind == b"JSON":
            if json_seen or len(chunks) != 1:
                raise ValueError("GLB must contain exactly one first-position JSON chunk")
            json_seen = True
            document = json.loads(data[offset:end].decode("utf-8").rstrip(" \t\r\n\0"))
        elif kind == b"BIN\0":
            if not json_seen or binary_seen:
                raise ValueError("GLB BIN chunk is duplicated or precedes JSON")
            binary_seen = True
            binary = data[offset:end]
        offset = end
    if document is None:
        raise ValueError("GLB has no JSON chunk")
    if not isinstance(document, dict):
        raise ValueError("GLB JSON root must be an object")
    if document.get("asset", {}).get("version") != "2.0":
        raise ValueError("Embedded glTF asset version is not 2.0")
    buffers = document.get("buffers", [])
    if len(buffers) > 1:
        raise ValueError("GLB must not declare more than one embedded buffer")
    declared_buffer_length = 0
    if buffers:
        buffer = buffers[0]
        if buffer.get("uri") is not None:
            raise ValueError("GLB buffer must be embedded, not an external URI")
        declared_buffer_length = _checked_nonnegative_int(buffer.get("byteLength"), "buffer byteLength")
        if declared_buffer_length == 0 or binary is None:
            raise ValueError("GLB buffer metadata does not match an embedded BIN chunk")
        if declared_buffer_length > len(binary) or len(binary) - declared_buffer_length > 3:
            raise ValueError("GLB BIN chunk length does not match declared buffer byteLength")
    buffer_views = document.get("bufferViews", [])
    for view_index, view in enumerate(buffer_views):
        buffer_index = view.get("buffer", 0)
        _checked_index(buffers, buffer_index, f"bufferView[{view_index}].buffer")
        start = _checked_nonnegative_int(view.get("byteOffset", 0), f"bufferView[{view_index}].byteOffset")
        length = _checked_nonnegative_int(view.get("byteLength"), f"bufferView[{view_index}].byteLength")
        if length == 0 or start + length > declared_buffer_length:
            raise ValueError(f"bufferView[{view_index}] exceeds the declared embedded buffer")
    accessors = document.get("accessors", [])
    for accessor_index, accessor in enumerate(accessors):
        _validate_accessor_layout(accessor, accessor_index, buffer_views)
    nodes = document.get("nodes", [])
    meshes = document.get("meshes", [])
    _validate_gltf_references(document, buffer_views, accessors, meshes, nodes)
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
    triangles = 0
    triangle_counts_known = True
    uv_primitives = 0
    normal_primitives = 0
    position_bounds = []
    for primitive in primitives:
        attrs = primitive.get("attributes", {})
        uv_primitives += int("TEXCOORD_0" in attrs)
        normal_primitives += int("NORMAL" in attrs)
        for attribute_name, accessor_index in attrs.items():
            _checked_index(accessors, accessor_index, f"primitive attribute {attribute_name}")
        position_index = attrs.get("POSITION")
        if position_index is not None:
            accessor = _checked_index(accessors, position_index, "POSITION accessor")
            if "min" in accessor and "max" in accessor:
                position_bounds.append((accessor["min"], accessor["max"]))
        if "material" in primitive:
            _checked_index(materials, primitive["material"], "primitive material")
        if primitive.get("mode", 4) != 4:
            continue
        index = primitive.get("indices")
        if index is None:
            count = accessors[position_index].get("count") if position_index is not None else None
        else:
            count = _checked_index(accessors, index, "primitive indices accessor").get("count")
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
        view = _checked_index(buffer_views, view_index, f"image {image.get('name')} bufferView")
        start = _checked_nonnegative_int(view.get("byteOffset", 0), "image bufferView byteOffset")
        end = start + _checked_nonnegative_int(view.get("byteLength"), "image bufferView byteLength")
        if binary is None or end > len(binary):
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
