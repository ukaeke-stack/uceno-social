#!/usr/bin/env python3
"""Download selected CC0 Poly Haven models, PBR ground textures and a city HDRI.

All downloads happen at development time. The game ships the files locally and
does not make runtime requests to Poly Haven.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path, PurePosixPath, PureWindowsPath

API = "https://api.polyhaven.com"
USER_AGENT = "UCENO-Virtual-World-AssetPipeline/1.0 (+https://github.com/ukaeke-stack/uceno-social)"

MODEL_NAMES = (
    "Modular Urban Apartments Facade",
    "Modular Factory Facade",
    "Street Lamp 01",
    "Pachira Aquatica 01",
    "Shrub 02",
    "Shrub 03",
    "Covered Car",
    "Modular Chainlink Fence",
    "Sofa 01",
    "Arm Chair 01",
    "Round Wooden Table 01",
    "Gothic Bed 01",
    "Gothic Cabinet 01",
)
TEXTURE_NAMES = ("Asphalt 01", "Concrete Floor 01", "Sparse Grass")
HDRI_NAMES = ("Modern Buildings",)


def request_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=90) as response:
        return json.loads(response.read().decode("utf-8"))


def safe_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def safe_dependency_path(asset_dir: Path, relative_name: str) -> Path:
    """Resolve a Poly Haven include path without allowing POSIX or Windows traversal."""
    if not isinstance(relative_name, str) or not relative_name.strip():
        raise RuntimeError("Poly Haven dependency path must be a non-empty string")
    posix = PurePosixPath(relative_name)
    windows = PureWindowsPath(relative_name)
    if (posix.is_absolute() or windows.is_absolute() or windows.drive
            or ".." in posix.parts or ".." in windows.parts):
        raise RuntimeError(f"Unsafe dependency path from Poly Haven: {relative_name}")
    root = asset_dir.resolve()
    target = (root / Path(*posix.parts)).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise RuntimeError(f"Dependency path escapes its asset directory: {relative_name}") from exc
    return target


def download(url: str, destination: Path):
    """Download atomically and return byte-count and SHA-256 provenance."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(destination.name + ".part")
    digest = hashlib.sha256()
    byte_count = 0
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=180) as response, temporary.open("wb") as output:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                output.write(chunk)
                digest.update(chunk)
                byte_count += len(chunk)
        if byte_count == 0:
            raise RuntimeError(f"Downloaded file is empty: {destination.name}")
        os.replace(temporary, destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return {"bytes": byte_count, "sha256": digest.hexdigest()}



def verify_manifest(asset_dir: Path, manifest: dict) -> list[str]:
    """Verify every declared asset payload against its recorded size and SHA-256."""
    if not isinstance(manifest, dict):
        return ["manifest must be a JSON object"]
    declared = manifest.get("files") or manifest.get("maps")
    if declared is None and isinstance(manifest.get("file"), str):
        declared = [manifest["file"]]
    if not isinstance(declared, list) or not declared:
        return ["manifest must declare at least one payload file"]
    integrity = manifest.get("file_integrity")
    if not isinstance(integrity, dict):
        return ["manifest has no file_integrity object"]
    errors = []
    for name in declared:
        if not isinstance(name, str) or not name:
            errors.append(f"invalid payload path: {name!r}")
            continue
        try:
            path = safe_dependency_path(asset_dir, name)
        except RuntimeError as error:
            errors.append(str(error))
            continue
        record = integrity.get(name)
        if not isinstance(record, dict):
            errors.append(f"{name}: missing integrity record")
            continue
        expected_size = record.get("bytes")
        expected_hash = record.get("sha256")
        if not isinstance(expected_size, int) or expected_size < 1:
            errors.append(f"{name}: invalid recorded byte count")
            continue
        if not isinstance(expected_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_hash):
            errors.append(f"{name}: invalid SHA-256 record")
            continue
        if not path.is_file():
            errors.append(f"{name}: payload file is missing")
            continue
        actual_size = path.stat().st_size
        if actual_size != expected_size:
            errors.append(f"{name}: byte count mismatch (expected {expected_size}, got {actual_size})")
            continue
        digest = hashlib.sha256()
        with path.open("rb") as payload:
            for chunk in iter(lambda: payload.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != expected_hash:
            errors.append(f"{name}: SHA-256 mismatch")
    return errors



def write_asset_manifest(asset_dir: Path, manifest: dict):
    """Atomically persist a manifest, then verify it against downloaded payloads."""
    destination = asset_dir / "asset-manifest.json"
    temporary = destination.with_name(destination.name + ".part")
    try:
        temporary.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, destination)
        persisted = json.loads(destination.read_text(encoding="utf-8"))
        errors = verify_manifest(asset_dir, persisted)
        if errors:
            raise RuntimeError("Imported asset failed manifest verification: " + "; ".join(errors))
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return destination


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
    downloaded = [model_path.name]
    integrity = {model_path.name: download(source_url, model_path)}
    includes = record.get("include") or {}
    if not isinstance(includes, dict):
        raise RuntimeError(f"Poly Haven dependency manifest is not an object for {metadata['name']}")
    for relative_name, file_record in includes.items():
        if not isinstance(file_record, dict) or not file_record.get("url"):
            continue
        target = safe_dependency_path(asset_dir, relative_name)
        relative_path = target.relative_to(asset_dir.resolve())
        integrity[str(relative_path)] = download(file_record["url"], target)
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
        "file_integrity": integrity,
        "runtime_api_dependency": False,
    }
    write_asset_manifest(asset_dir, manifest)
    print(f"Imported model source: {metadata['name']} ({fmt}, {resolution}, {len(downloaded)} files)")


def download_texture(asset_id: str, metadata: dict, output_root: Path):
    files = request_json(f"{API}/files/{urllib.parse.quote(asset_id)}")
    texture_dir = output_root / "Textures" / safe_name(metadata["name"])
    texture_dir.mkdir(parents=True, exist_ok=True)
    downloaded = []
    integrity = {}
    resolutions_used = []

    # Poly Haven's API uses map names as top-level keys. Its naming varies
    # between short and descriptive aliases, so support both.
    map_aliases = (
        ("diff", ("diff", "diffuse", "Diffuse")),
        ("nor_gl", ("nor_gl", "normal_gl")),
        ("rough", ("rough", "roughness", "Rough")),
        ("ao", ("ao", "ambient_occlusion", "AO")),
        ("arm", ("arm", "ao_rough_metal")),
    )
    for output_name, aliases in map_aliases:
        formats = None
        resolution = None
        for alias in aliases:
            try:
                resolution, formats = choose_resolution(files.get(alias) or {})
                break
            except RuntimeError:
                continue
        if formats is None:
            continue
        resolutions_used.append(resolution)
        preferred = ("jpg", "png", "exr") if output_name in ("diff", "rough", "ao", "arm") else ("png", "jpg", "exr")
        record = next(
            (
                formats.get(ext)
                for ext in preferred
                if isinstance(formats.get(ext), dict) and formats[ext].get("url")
            ),
            None,
        )
        if record is None:
            continue
        ext = Path(urllib.parse.urlparse(record["url"]).path).suffix.lower() or ".jpg"
        filename = f"{safe_name(metadata['name'])}_{output_name}{ext}"
        integrity[filename] = download(record["url"], texture_dir / filename)
        downloaded.append(filename)

    if not downloaded:
        available = ", ".join(key for key in files.keys() if key not in ("blend", "gltf", "mtlx"))
        raise RuntimeError(f"No PBR maps were available for texture asset {metadata['name']} (keys: {available})")

    manifest = {
        "name": metadata["name"],
        "asset_id": asset_id,
        "source": f"https://polyhaven.com/a/{asset_id}",
        "license": "CC0 1.0",
        "authors": metadata.get("authors", {}),
        "texture_resolutions": sorted(set(resolutions_used)),
        "maps": downloaded,
        "file_integrity": integrity,
        "runtime_api_dependency": False,
    }
    write_asset_manifest(texture_dir, manifest)
    print(f"Imported PBR texture: {metadata['name']} ({len(downloaded)} maps)")


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
    integrity = download(record["url"], target_dir / filename)
    manifest = {
        "name": metadata["name"],
        "asset_id": asset_id,
        "source": f"https://polyhaven.com/a/{asset_id}",
        "license": "CC0 1.0",
        "authors": metadata.get("authors", {}),
        "resolution": resolution,
        "file": filename,
        "file_integrity": {filename: integrity},
        "runtime_api_dependency": False,
    }
    write_asset_manifest(target_dir, manifest)
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
