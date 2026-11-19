#!/usr/bin/env python3
"""Acquire a provenance-pinned Innerscene CC0 architecture pilot.

This is a structural inspection stage only. It does not certify visual quality,
Unity import, authored LODs, or suitability for any final city scene.
"""
import hashlib
import json
import pathlib
import struct
import urllib.request

OUT = pathlib.Path("artifacts/innerscene-architecture-pilot")
UA = "UCENO-architecture-pilot/1.1"
ASSETS = [
    {
        "id": "innerscene-residential-tower-ab650cbf",
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
        "name": "Stepped art-deco tower",
        "city_role": "distinctive skyline/landmark candidate for Eclipse Central; assignment pending art review",
        "source_page": "https://www.innerscene.com/tools/library/3d-parts/stepped-art-deco-tower-352816d9",
        "download_url": "https://files.innerscene.com/library/stepped-art-deco-tower-352816d9/906293bd5162bcfe9e88/stepped-art-deco-tower.glb",
        "license": "CC0",
        "listed_size_bytes": 11.8 * 1024 * 1024,
        "listed_dimensions_m": [42.0, 37.2, 173.4],
    },
]

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
    meshes = document.get("meshes", [])
    primitives = [p for m in meshes for p in m.get("primitives", [])]
    materials = document.get("materials", [])
    images = document.get("images", [])
    textures = document.get("textures", [])
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
        "stage": "downloaded and GLB-structure-inspected; not visually or Unity accepted",
        "assets": [],
    }
    for asset in ASSETS:
        if asset["license"] != "CC0":
            raise ValueError(f"Non-CC0 pilot source rejected: {asset['id']}")
        req = urllib.request.Request(asset["download_url"], headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=90) as response:
            payload = response.read(30 * 1024 * 1024 + 1)
        if len(payload) > 30 * 1024 * 1024:
            raise ValueError(f"Pilot binary exceeds 30 MiB cap: {asset['id']}")
        target = OUT / f'{asset["id"]}.glb'
        target.write_bytes(payload)
        structural = parse_glb(target)
        report["assets"].append({
            **{k: v for k, v in asset.items() if k != "download_url"},
            "download_url": asset["download_url"],
            "listed_size_bytes_approx": int(asset["listed_size_bytes"]),
            "structural_inspection": structural,
            "status": "downloaded_glb_structure_valid_visual_review_pending",
        })
        print(f'{asset["name"]}: {structural["glb_bytes"]} bytes; {structural["mesh_count"]} meshes; {structural["material_count"]} materials; {structural["triangle_count_estimate"]} triangles; sha256 {structural["sha256"]}')
    (OUT / "inspection-report.json").write_text(json.dumps(report, indent=2) + "\n")
    if len(report["assets"]) != len(ASSETS):
        raise SystemExit("Pilot asset count mismatch")

if __name__ == "__main__":
    main()
