#!/usr/bin/env python3
"""Audit acquired city-building GLBs without Unity or a Unity licence.

This checks binary integrity, manifest coverage, LOD presence and embedded
image evidence. It deliberately does not approve geometry, materials, city fit,
prefabs or visual quality; those still require the Unity/editor release gate.
"""
import hashlib
import json
import pathlib
import struct

ROOT = pathlib.Path("artifacts")
TEVY = ROOT / "tevy-city-architecture" / "tevy-acquisition-manifest.json"
ASSETS = ROOT / "city-architecture-models" / "acquisition-manifest.json"
OUT = ROOT / "city-architecture-quality-audit.json"
CITIES = (
    "SolsticeBay", "VerdantReach", "NexusDelta", "AuroraHeights",
    "SaffronDunes", "MonsoonHarbour", "EclipseCentral", "OriginPlains",
    "AtlasFrontier",
)
MAX_BYTES = 25 * 1024 * 1024


def inspect_glb(path, expected_sha=None):
    """Validate a bounded GLB 2.0 container and report image evidence."""
    path = pathlib.Path(path)
    size = path.stat().st_size
    if size < 20 or size > MAX_BYTES:
        raise ValueError(f"{path}: invalid GLB header or size")
    with path.open("rb") as stream:
        data = stream.read(MAX_BYTES + 1)
    if len(data) != size or data[:4] != b"glTF":
        raise ValueError(f"{path}: invalid GLB header or size")
    version, declared_length = struct.unpack_from("<II", data, 4)
    if version != 2 or declared_length != len(data):
        raise ValueError(f"{path}: invalid GLB 2.0 version or declared length")

    offset = 12
    document = None
    chunk_index = 0
    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError(f"{path}: incomplete GLB chunk header")
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        if chunk_length == 0 or chunk_length % 4:
            raise ValueError(f"{path}: GLB chunk length must be positive and 4-byte aligned")
        end = offset + chunk_length
        if end > len(data):
            raise ValueError(f"{path}: chunk extends beyond file boundary")
        if chunk_index == 0:
            if chunk_type != 0x4E4F534A:
                raise ValueError(f"{path}: first GLB chunk must be JSON")
            try:
                document = json.loads(data[offset:end].decode("utf-8").rstrip(" \\x00"))
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise ValueError(f"{path}: invalid GLB JSON chunk") from exc
        elif chunk_index == 1:
            if chunk_type != 0x004E4942:
                raise ValueError(f"{path}: second GLB chunk, when present, must be BIN")
        else:
            raise ValueError(f"{path}: GLB contains more than two chunks")
        offset = end
        chunk_index += 1

    if offset != len(data) or not isinstance(document, dict):
        raise ValueError(f"{path}: malformed GLB chunks or missing JSON")
    if document.get("asset", {}).get("version") != "2.0":
        raise ValueError(f"{path}: embedded glTF version is not 2.0")
    digest = hashlib.sha256(data).hexdigest()
    if expected_sha and digest.lower() != str(expected_sha).lower():
        raise ValueError(f"{path}: SHA-256 mismatch")
    images = document.get("images") or []
    embedded = sum(
        1 for item in images
        if isinstance(item, dict) and (
            isinstance(item.get("bufferView"), int)
            or str(item.get("uri", "")).startswith("data:")
        )
    )
    return {
        "bytes": len(data),
        "sha256": digest,
        "mesh_count": len(document.get("meshes") or []),
        "material_count": len(document.get("materials") or []),
        "image_count": len(images),
        "embedded_image_count": embedded,
        "external_image_count": len(images) - embedded,
    }

def safe_artifact_path(base, relative):
    """Resolve a manifest path without allowing absolute or escaping paths."""
    if not isinstance(relative, str) or not relative.strip():
        raise ValueError("Manifest asset path must be a non-empty relative string")
    candidate = pathlib.Path(relative)
    if candidate.is_absolute():
        raise ValueError(f"Absolute manifest asset path rejected: {relative}")
    root = pathlib.Path(base).resolve()
    resolved = (root / candidate).resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise ValueError(f"Manifest asset path escapes its acquisition root: {relative}") from exc
    return resolved


def load_manifest(path):
    if not path.exists():
        return None
    value = json.loads(path.read_text())
    if not isinstance(value.get("cities"), dict):
        raise ValueError(f"{path}: missing cities object")
    return value


def audit_tevy(manifest, report):
    if manifest is None:
        return
    for city in CITIES:
        entries = manifest["cities"].get(city)
        if not isinstance(entries, dict):
            raise ValueError(f"Tevy manifest missing city {city}")
        models = entries.get("selected_and_acquired") or []
        city_result = report["cities"][city]
        city_result["tevy_model_count"] = len(models)
        seen = set()
        for model in models:
            slug = model.get("slug")
            if not slug or slug in seen:
                raise ValueError(f"Tevy {city}: missing or duplicate model slug")
            seen.add(slug)
            lods = {item.get("lod"): item for item in model.get("lods", [])}
            if set(lods) != {0, 1, 2}:
                raise ValueError(f"Tevy {city}/{slug}: expected LOD0, LOD1 and LOD2")
            lod_results = {}
            for level in (0, 1, 2):
                item = lods[level]
                path = safe_artifact_path(ROOT / "tevy-city-architecture", item.get("file"))
                result = inspect_glb(path, item.get("sha256"))
                if result["bytes"] != item.get("bytes"):
                    raise ValueError(f"Tevy {city}/{slug} LOD{level}: byte count mismatch")
                lod_results[str(level)] = result
            city_result["tevy_lods"].append({"slug": slug, "lods": lod_results})
            city_result["tevy_textured_lod0_count"] += int(
                lod_results["0"]["embedded_image_count"] > 0
            )


def audit_3dassets(manifest, report):
    if manifest is None:
        return
    for city in CITIES:
        entries = manifest["cities"].get(city)
        if not isinstance(entries, list):
            raise ValueError(f"3DAssets manifest missing city {city}")
        city_result = report["cities"][city]
        city_result["3dassets_model_count"] = len(entries)
        for model in entries:
            path = safe_artifact_path(ROOT / "city-architecture-models", model.get("file"))
            result = inspect_glb(path, model.get("sha256"))
            if result["bytes"] != model.get("bytes"):
                raise ValueError(f"3DAssets {city}/{model.get('slug')}: byte count mismatch")
            city_result["3dassets_models"].append({
                "slug": model.get("slug"),
                **result,
            })
            city_result["3dassets_textured_count"] += int(
                result["embedded_image_count"] > 0
            )


def main():
    report = {
        "scope": "binary and provenance integrity only; not visual or Unity acceptance",
        "cities": {
            city: {
                "tevy_model_count": 0, "tevy_textured_lod0_count": 0,
                "tevy_lods": [], "3dassets_model_count": 0,
                "3dassets_textured_count": 0, "3dassets_models": [],
            } for city in CITIES
        },
    }
    tevy = load_manifest(TEVY)
    assets = load_manifest(ASSETS)
    if tevy is None and assets is None:
        raise SystemExit("No acquisition manifests found; refusing an empty audit")
    audit_tevy(tevy, report)
    audit_3dassets(assets, report)
    report["totals"] = {
        "tevy_models": sum(x["tevy_model_count"] for x in report["cities"].values()),
        "tevy_lod_binaries": sum(len(x["tevy_lods"]) * 3 for x in report["cities"].values()),
        "tevy_textured_lod0": sum(x["tevy_textured_lod0_count"] for x in report["cities"].values()),
        "3dassets_models": sum(x["3dassets_model_count"] for x in report["cities"].values()),
        "3dassets_textured_models": sum(x["3dassets_textured_count"] for x in report["cities"].values()),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report["totals"], sort_keys=True))
    for city, value in report["cities"].items():
        print(
            f"{city}: Tevy {value['tevy_model_count']} models/"
            f"{value['tevy_textured_lod0_count']} textured LOD0; "
            f"3DAssets {value['3dassets_model_count']} models/"
            f"{value['3dassets_textured_count']} textured"
        )


if __name__ == "__main__":
    main()
