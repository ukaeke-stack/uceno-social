#!/usr/bin/env python3
"""Download selected CC0 Poly Haven models for the UCENO Unity project.

The script uses the official Poly Haven public API only during the asset-import
workflow. It downloads FBX where available (otherwise glTF), plus all declared
texture dependencies, and writes a per-asset provenance manifest.
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

ASSET_NAMES = (
    "Modular Urban Apartments Facade",
    "Modular Factory Facade",
    "Street Lamp 01",
    "Jacaranda Tree",
    "Covered Car",
    "Modular Chainlink Fence",
)


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


def choose_model_file(tree: dict):
    # Prefer FBX for Unity's native model importer. Fall back to glTF if the
    # source asset does not publish an FBX variant.
    for fmt in ("fbx", "gltf"):
        resolutions = tree.get(fmt) or {}
        for resolution in ("1k", "2k", "4k", "8k", "16k"):
            node = resolutions.get(resolution)
            if not isinstance(node, dict):
                continue
            record = node.get(fmt)
            if isinstance(record, dict) and record.get("url"):
                return fmt, resolution, record
    raise RuntimeError("No FBX or glTF model file was published for this asset")


def download_asset(asset_id: str, metadata: dict, output_root: Path):
    files = request_json(f"{API}/files/{urllib.parse.quote(asset_id)}")
    fmt, resolution, record = choose_model_file(files)
    asset_dir = output_root / safe_name(metadata["name"])
    asset_dir.mkdir(parents=True, exist_ok=True)

    source_url = record["url"]
    suffix = ".fbx" if fmt == "fbx" else ".gltf"
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
    print(f"Imported source package: {metadata['name']} ({fmt}, {resolution}, {len(downloaded)} files)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()

    catalog = request_json(f"{API}/assets?type=models")
    by_name = {
        safe_name(item.get("name", "")): (asset_id, item)
        for asset_id, item in catalog.items()
    }

    missing = []
    selected = []
    for name in ASSET_NAMES:
        item = by_name.get(safe_name(name))
        if item is None:
            missing.append(name)
        else:
            selected.append(item)

    if missing:
        raise RuntimeError("Poly Haven catalog no longer contains expected assets: " + ", ".join(missing))

    args.output_dir.mkdir(parents=True, exist_ok=True)
    for asset_id, metadata in selected:
        download_asset(asset_id, metadata, args.output_dir)

    print(f"Downloaded {len(selected)} CC0 Poly Haven model packages into {args.output_dir}")


if __name__ == "__main__":
    try:
        main()
    except (urllib.error.URLError, urllib.error.HTTPError, RuntimeError, KeyError, ValueError) as error:
        print(f"Asset import failed: {error}", file=sys.stderr)
        raise SystemExit(1)
