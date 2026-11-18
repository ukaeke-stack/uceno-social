#!/usr/bin/env python3
"""Acquire a small, provenance-pinned Innerscene CC0 architecture pilot.

This is a structural inspection stage only. It does not certify visual quality,
Unity import, authored LODs, or suitability for any final city scene.
"""
import hashlib
import json
import pathlib
import struct
import urllib.request

OUT = pathlib.Path("artifacts/innerscene-architecture-pilot")
UA = "UCENO-architecture-pilot/1.0"
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
    triangles = 0
    triangle_counts_known = True
    for primitive in primitives:
        if primitive.get("mode", 4) != 4:
            continue
        index = primitive.get("indices")
        if index is None:
            position = primitive.get("attributes", {}).get("POSITION")
            count = accessors[position].get("count") if position is not None else None
        else:
            count = accessors[index].get("count")
        if count is None:
            triangle_counts_known = False
        else:
            triangles += int(count) // 3
    return {
        "glb_bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "gltf_version": document.get("asset", {}).get("version"),
        "generator": document.get("asset", {}).get("generator"),
        "scene_count": len(document.get("scenes", [])),
        "node_count": len(nodes),
        "mesh_count": len(meshes),
        "primitive_count": len(primitives),
        "material_count": len(materials),
        "texture_count": len(textures),
        "image_count": len(images),
        "accessor_count": len(accessors),
        "triangle_count_estimate": triangles if triangle_counts_known else None,
        "triangle_count_complete": triangle_counts_known,
        "embedded_images": sum(1 for image in images if "bufferView" in image),
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
        req = urllib.request.Request(asset["download_url"], headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=90) as response:
            payload = response.read()
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
        print(f'{asset["name"]}: {structural["glb_bytes"]} bytes; {structural["mesh_count"]} meshes; {structural["material_count"]} materials; sha256 {structural["sha256"]}')
    (OUT / "inspection-report.json").write_text(json.dumps(report, indent=2) + "\n")
    if len(report["assets"]) != len(ASSETS):
        raise SystemExit("Pilot asset count mismatch")

if __name__ == "__main__":
    main()
