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
    binary_chunk = None
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
            binary_chunk = data[offset:end]
        else:
            raise ValueError(f"{path}: GLB contains more than two chunks")
        offset = end
        chunk_index += 1

    if offset != len(data) or not isinstance(document, dict):
        raise ValueError(f"{path}: malformed GLB chunks or missing JSON")
    asset = document.get("asset")
    if not isinstance(asset, dict) or asset.get("version") != "2.0":
        raise ValueError(f"{path}: embedded glTF asset metadata/version is invalid")
    for collection in ("meshes", "materials", "images"):
        value = document.get(collection, [])
        if not isinstance(value, list):
            raise ValueError(f"{path}: glTF {collection} must be an array")

    # Validate the actual scene graph and geometry references. A valid GLB
    # header alone is not evidence that Unity can render a building.
    arrays = ("buffers", "bufferViews", "accessors", "textures", "samplers", "nodes", "scenes")
    for collection in arrays:
        if not isinstance(document.get(collection, []), list):
            raise ValueError(f"{path}: glTF {collection} must be an array")

    buffers = document.get("buffers", [])
    buffer_views = document.get("bufferViews", [])
    accessors = document.get("accessors", [])
    if len(buffers) > 1:
        raise ValueError(f"{path}: self-contained GLB must not declare multiple buffers")
    if buffers:
        buffer = buffers[0]
        if not isinstance(buffer, dict):
            raise ValueError(f"{path}: glTF buffer 0 must be an object")
        if buffer.get("uri") is not None:
            raise ValueError(f"{path}: external buffer URI is not accepted in acquired GLB")
        declared_buffer_bytes = buffer.get("byteLength")
        if not isinstance(declared_buffer_bytes, int) or isinstance(declared_buffer_bytes, bool) or declared_buffer_bytes <= 0:
            raise ValueError(f"{path}: glTF buffer 0 has invalid byteLength")
        if binary_chunk is None or declared_buffer_bytes > len(binary_chunk):
            raise ValueError(f"{path}: declared buffer bytes exceed the GLB BIN chunk")
    elif buffer_views:
        raise ValueError(f"{path}: bufferViews exist without a glTF buffer")
    meshes = document.get("meshes", [])
    materials = document.get("materials", [])
    textures = document.get("textures", [])
    samplers = document.get("samplers", [])
    nodes = document.get("nodes", [])
    scenes = document.get("scenes", [])

    for index, view in enumerate(buffer_views):
        if not isinstance(view, dict):
            raise ValueError(f"{path}: bufferView {index} must be an object")
        buffer_index = view.get("buffer")
        if not isinstance(buffer_index, int) or isinstance(buffer_index, bool) or not 0 <= buffer_index < len(buffers):
            raise ValueError(f"{path}: bufferView {index} references an invalid buffer")
        byte_length = view.get("byteLength")
        byte_offset = view.get("byteOffset", 0)
        if not isinstance(byte_length, int) or isinstance(byte_length, bool) or byte_length <= 0:
            raise ValueError(f"{path}: bufferView {index} has invalid byteLength")
        if not isinstance(byte_offset, int) or isinstance(byte_offset, bool) or byte_offset < 0:
            raise ValueError(f"{path}: bufferView {index} has invalid byteOffset")
        if buffer_index == 0 and buffers and byte_offset + byte_length > buffers[0]["byteLength"]:
            raise ValueError(f"{path}: bufferView {index} exceeds declared buffer bounds")

    for index, accessor in enumerate(accessors):
        if not isinstance(accessor, dict):
            raise ValueError(f"{path}: accessor {index} must be an object")
        view_index = accessor.get("bufferView")
        if view_index is not None and (
            not isinstance(view_index, int) or isinstance(view_index, bool) or not 0 <= view_index < len(buffer_views)
        ):
            raise ValueError(f"{path}: accessor {index} references an invalid bufferView")
        count = accessor.get("count")
        component_type = accessor.get("componentType")
        accessor_type = accessor.get("type")
        if not isinstance(count, int) or isinstance(count, bool) or count <= 0:
            raise ValueError(f"{path}: accessor {index} has invalid count")
        if component_type not in {5120, 5121, 5122, 5123, 5125, 5126}:
            raise ValueError(f"{path}: accessor {index} has invalid componentType")
        if accessor_type not in {"SCALAR", "VEC2", "VEC3", "VEC4", "MAT2", "MAT3", "MAT4"}:
            raise ValueError(f"{path}: accessor {index} has invalid type")

    primitive_count = 0
    material_references = set()
    for mesh_index, mesh in enumerate(meshes):
        if not isinstance(mesh, dict) or not isinstance(mesh.get("primitives"), list) or not mesh["primitives"]:
            raise ValueError(f"{path}: mesh {mesh_index} must contain primitives")
        for primitive_index, primitive in enumerate(mesh["primitives"]):
            if not isinstance(primitive, dict) or not isinstance(primitive.get("attributes"), dict) or not primitive["attributes"]:
                raise ValueError(f"{path}: mesh {mesh_index} primitive {primitive_index} has no attributes")
            for semantic, accessor_index in primitive["attributes"].items():
                if not isinstance(accessor_index, int) or isinstance(accessor_index, bool) or not 0 <= accessor_index < len(accessors):
                    raise ValueError(f"{path}: mesh {mesh_index} primitive {primitive_index} has invalid {semantic} accessor")
            indices = primitive.get("indices")
            if indices is not None:
                if not isinstance(indices, int) or isinstance(indices, bool) or not 0 <= indices < len(accessors):
                    raise ValueError(f"{path}: mesh {mesh_index} primitive {primitive_index} has invalid indices accessor")
                index_accessor = accessors[indices]
                if index_accessor.get("type") != "SCALAR" or index_accessor.get("componentType") not in {5121, 5123, 5125}:
                    raise ValueError(f"{path}: mesh {mesh_index} primitive {primitive_index} indices must use an unsigned SCALAR accessor")
            mode = primitive.get("mode", 4)
            if not isinstance(mode, int) or isinstance(mode, bool) or mode not in {0, 1, 2, 3, 4, 5, 6}:
                raise ValueError(f"{path}: mesh {mesh_index} primitive {primitive_index} has invalid topology mode")
            material_index = primitive.get("material")
            if material_index is not None:
                if not isinstance(material_index, int) or isinstance(material_index, bool) or not 0 <= material_index < len(materials):
                    raise ValueError(f"{path}: mesh {mesh_index} primitive {primitive_index} has invalid material")
                material_references.add(material_index)
            primitive_count += 1

    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            raise ValueError(f"{path}: node {index} must be an object")
        mesh_index = node.get("mesh")
        if mesh_index is not None and (
            not isinstance(mesh_index, int) or isinstance(mesh_index, bool) or not 0 <= mesh_index < len(meshes)
        ):
            raise ValueError(f"{path}: node {index} references an invalid mesh")
        for child in node.get("children", []):
            if not isinstance(child, int) or isinstance(child, bool) or not 0 <= child < len(nodes):
                raise ValueError(f"{path}: node {index} references an invalid child")

    for index, scene in enumerate(scenes):
        if not isinstance(scene, dict):
            raise ValueError(f"{path}: scene {index} must be an object")
        for node_index in scene.get("nodes", []):
            if not isinstance(node_index, int) or isinstance(node_index, bool) or not 0 <= node_index < len(nodes):
                raise ValueError(f"{path}: scene {index} references an invalid node")

    for index, sampler in enumerate(samplers):
        if not isinstance(sampler, dict):
            raise ValueError(f"{path}: sampler {index} must be an object")
        min_filter = sampler.get("minFilter")
        if min_filter is not None and min_filter not in {9728, 9729, 9984, 9985, 9986, 9987}:
            raise ValueError(f"{path}: sampler {index} has invalid minFilter")
        mag_filter = sampler.get("magFilter")
        if mag_filter is not None and mag_filter not in {9728, 9729}:
            raise ValueError(f"{path}: sampler {index} has invalid magFilter")
        for field in ("wrapS", "wrapT"):
            wrap = sampler.get(field)
            if wrap is not None and wrap not in {33071, 33648, 10497}:
                raise ValueError(f"{path}: sampler {index} has invalid {field}")

    for index, texture in enumerate(textures):
        if not isinstance(texture, dict):
            raise ValueError(f"{path}: texture {index} must be an object")
        source = texture.get("source")
        if source is not None and (
            not isinstance(source, int) or isinstance(source, bool) or not 0 <= source < len(document.get("images", []))
        ):
            raise ValueError(f"{path}: texture {index} references an invalid image")
        sampler = texture.get("sampler")
        samplers = document.get("samplers", [])
        if sampler is not None and (
            not isinstance(sampler, int) or isinstance(sampler, bool) or not 0 <= sampler < len(samplers)
        ):
            raise ValueError(f"{path}: texture {index} references an invalid sampler")

    digest = hashlib.sha256(data).hexdigest()
    if expected_sha and digest.lower() != str(expected_sha).lower():
        raise ValueError(f"{path}: SHA-256 mismatch")
    images = document.get("images", [])
    embedded = 0
    for index, item in enumerate(images):
        if not isinstance(item, dict):
            raise ValueError(f"{path}: glTF image {index} must be an object")
        buffer_view = item.get("bufferView")
        uri = item.get("uri")
        if buffer_view is not None and (
            not isinstance(buffer_view, int) or isinstance(buffer_view, bool)
            or not 0 <= buffer_view < len(buffer_views)
        ):
            raise ValueError(f"{path}: glTF image {index} references an invalid bufferView")
        if buffer_view is not None and not isinstance(item.get("mimeType"), str):
            raise ValueError(f"{path}: glTF image {index} bufferView requires mimeType")
        if uri is not None and not isinstance(uri, str):
            raise ValueError(f"{path}: glTF image {index} has an invalid URI")
        if buffer_view is not None or (isinstance(uri, str) and uri.startswith("data:")):
            embedded += 1
    return {
        "bytes": len(data),
        "sha256": digest,
        "mesh_count": len(meshes),
        "primitive_count": primitive_count,
        "material_count": len(materials),
        "referenced_material_count": len(material_references),
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
