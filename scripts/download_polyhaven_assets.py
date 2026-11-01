#!/usr/bin/env python3
"""Download selected CC0 Poly Haven models, PBR ground textures and a city HDRI.

All downloads happen at development time. The game ships the files locally and
does not make runtime requests to Poly Haven.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path, PurePosixPath

API = "https://api.polyhaven.com"
USER_AGENT = "UCENO-Virtual-World-AssetPipeline/1.0 (+https://github.com/ukaeke-stack/uceno-social)"

MODEL_NAMES = (
    "Modular Urban Apartments Facade",
    "Modular Factory Facade",
    "Street Lamp 01",
    "Jacaranda Tree",
    "Covered Car",
    "Modular Chainlink Fence",
)
TEXTURE_NAMES = ("Asphalt 01", "Concrete Floor 01", "Sparse Grass")
HDRI_NAMES = ("Modern Buildings",)


def request_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=90) as response:
        return json.loads(response.read().decode("utf-8"))


def safe_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def download(url: str, destination: Path):
    destination.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=180) as response, destination.open("wb") as output:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            output.write(chunk)


def choose_resolution(root: dict):
    for resolution in ("1k", "2k", "4k", "8k", "16k"):
        value = root.get(resolution)
        if isinstance(value, dict):
            return resolution, value
    raise RuntimeError("No downloadable resolution was published")


def choose_model_file(tree: dict):
    for fmt in ("fbx", "gltf"):
        variants = tree.get(fmt) or {}
        try:
            resolution, node = choose_resolution(variants)
        except RuntimeError:
            continue
        record = node.get(fmt)
        if isinstance(record, dict) and record.get("url"):
            return fmt, resolution, record
    raise RuntimeError("No FBX or glTF model file was published for this asset")


def download_asset(asset_id: str, metadata: dict, output_root: Path):
    files = request_json(f"{API}/files/{urllib.parse.quote(asset_id)}")
    fmt, resolution, record = choose_model_file(files)
    asset_dir = output_root / "Models" / safe_name(metadata["name"])
    asset_dir.mkdir(parents=True, exist_ok=True)

    source_url = record["url"]
    url_suffix = Path(urllib.parse.urlparse(source_url).path).suffix.lower()
    suffix = url_suffix if url_suffix in (".fbx", ".gltf", ".glb") else (".fbx" if fmt == "fbx" else ".gltf")
    model_path = asset_dir / (safe_name(metadata["name"]) + suffix)
    download(source_url, model_path)

    downloaded = [model_path.name]
    includes = record.get("include") or {}
    for relative_name, file_record in includes.items():
        if not isinstance(file_record, dict) or not file_record.get("url"):
            continue
        relative_path = PurePosixPath(relative_name)
        if relative_path.is_absolute() or ".." in relative_path.parts:
            raise RuntimeError(f"Unsafe dependency path from Poly Haven: {relative_name}")
        target = asset_dir.joinpath(*relative_path.parts)
        download(file_record["url"], target)
        downloaded.append(str(relative_path))

    manifest = {
        "name": metadata["name"],
        "asset_id": asset_id,
        "source": f"https://polyhaven.com/a/{asset_id}",
        "license": "CC0 1.0",
        "authors": metadata.get("authors", {}),
        "format": fmt,
        "texture_resolution": resolution,
        "polycount": metadata.get("polycount"),
        "lods": bool(metadata.get("lods", False)),
        "files": downloaded,
        "runtime_api_dependency": False,
    }
    (asset_dir / "asset-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Imported model source: {metadata['name']} ({fmt}, {resolution}, {len(downloaded)} files)")


def download_texture(asset_id: str, metadata: dict, output_root: Path):
    files = request_json(f"{API}/files/{urllib.parse.quote(asset_id)}")
    maps_root = files.get("$map") or {}
    resolution, maps = choose_resolution(maps_root)
    texture_dir = output_root / "Textures" / safe_name(metadata["name"])
    texture_dir.mkdir(parents=True, exist_ok=True)
    downloaded = []

    for map_name in ("diff", "nor_gl", "rough", "ao"):
        formats = maps.get(map_name) or {}
        if not isinstance(formats, dict):
            continue
        preferred = ("jpg", "png", "exr") if map_name in ("diff", "rough", "ao") else ("png", "jpg", "exr")
        record = next((formats.get(ext) for ext in preferred if isinstance(formats.get(ext), dict) and formats[ext].get("url")), None)
        if record is None:
            continue
        ext = Path(urllib.parse.urlparse(record["url"]).path).suffix.lower() or ".jpg"
        filename = f"{safe_name(metadata['name'])}_{map_name}{ext}"
        download(record["url"], texture_dir / filename)
        downloaded.append(filename)

    if not downloaded:
        raise RuntimeError(f"No PBR maps were available for texture asset {metadata['name']}")

    manifest = {
        "name": metadata["name"],
        "asset_id": asset_id,
        "source": f"https://polyhaven.com/a/{asset_id}",
        "license": "CC0 1.0",
        "authors": metadata.get("authors", {}),
        "texture_resolution": resolution,
        "maps": downloaded,
        "runtime_api_dependency": False,
    }
    (texture_dir / "asset-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Imported PBR texture: {metadata['name']} ({resolution}, {len(downloaded)} maps)")


def download_hdri(asset_id: str, metadata: dict, output_root: Path):
    files = request_json(f"{API}/files/{urllib.parse.quote(asset_id)}")
    resolution, formats = choose_resolution(files.get("hdri") or {})
    record = formats.get("hdr") or formats.get("exr")
    if not isinstance(record, dict) or not record.get("url"):
        raise RuntimeError(f"No HDRI file was published for {metadata['name']}")
    suffix = Path(urllib.parse.urlparse(record["url"]).path).suffix.lower() or ".hdr"
    target_dir = output_root / "HDRI"
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{safe_name(metadata['name'])}_{resolution}{suffix}"
    download(record["url"], target_dir / filename)
    manifest = {
        "name": metadata["name"],
        "asset_id": asset_id,
        "source": f"https://polyhaven.com/a/{asset_id}",
        "license": "CC0 1.0",
        "authors": metadata.get("authors", {}),
        "resolution": resolution,
        "file": filename,
        "runtime_api_dependency": False,
    }
    (target_dir / "asset-manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Imported city HDRI: {metadata['name']} ({resolution})")


def select_assets(catalog: dict, names: tuple[str, ...], kind: str):
    by_name = {
        safe_name(item.get("name", "")): (asset_id, item)
        for asset_id, item in catalog.items()
    }
    missing = []
    selected = []
    for name in names:
        item = by_name.get(safe_name(name))
        if item is None:
            missing.append(name)
        else:
            selected.append(item)
    if missing:
        raise RuntimeError(f"Poly Haven {kind} catalog no longer contains: " + ", ".join(missing))
    return selected


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    models = select_assets(request_json(f"{API}/assets?type=models"), MODEL_NAMES, "model")
    textures = select_assets(request_json(f"{API}/assets?type=textures"), TEXTURE_NAMES, "texture")
    hdris = select_assets(request_json(f"{API}/assets?type=hdris"), HDRI_NAMES, "HDRI")

    for asset_id, metadata in models:
        download_asset(asset_id, metadata, args.output_dir)
    for asset_id, metadata in textures:
        download_texture(asset_id, metadata, args.output_dir)
    for asset_id, metadata in hdris:
        download_hdri(asset_id, metadata, args.output_dir)

    print(
        f"Downloaded {len(models)} models, {len(textures)} PBR texture sets and "
        f"{len(hdris)} HDRI into {args.output_dir}"
    )


if __name__ == "__main__":
    try:
        main()
    except (urllib.error.URLError, urllib.error.HTTPError, RuntimeError, KeyError, ValueError) as error:
        print(f"Asset import failed: {error}", file=sys.stderr)
        raise SystemExit(1)
