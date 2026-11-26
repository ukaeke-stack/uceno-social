#!/usr/bin/env python3
"""Audit acquired city-building GLBs without Unity or a Unity licence.

This checks binary integrity, manifest coverage, LOD presence and embedded
image evidence. It deliberately does not approve geometry, materials, city fit,
prefabs or visual quality; those still require the Unity/editor release gate.
"""
import base64
import binascii
import hashlib
import json
import pathlib
import struct
import urllib.parse

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


def embedded_buffer_length(uri, path, index):
    """Return the decoded byte length of a self-contained glTF buffer data URI."""
    if not isinstance(uri, str) or not uri.startswith("data:"):
        raise ValueError(f"{path}: external buffer URI is not accepted in acquired GLB")
    try:
        header, payload = uri[5:].split(",", 1)
    except ValueError as exc:
        raise ValueError(f"{path}: buffer {index} has a malformed data URI") from exc
    parts = header.split(";")
    media_type = parts[0].lower()
    if media_type not in {"application/octet-stream", "application/gltf-buffer"}:
        raise ValueError(f"{path}: buffer {index} data URI has an unsupported media type")
    if len(parts) > 2 or (len(parts) == 2 and parts[1].lower() != "base64"):
        raise ValueError(f"{path}: buffer {index} data URI has unsupported parameters")
    try:
        decoded = base64.b64decode(payload, validate=True) if len(parts) == 2 else urllib.parse.unquote_to_bytes(payload)
    except (binascii.Error, ValueError) as exc:
        raise ValueError(f"{path}: buffer {index} data URI payload is invalid") from exc
    return len(decoded)


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
    extensions_used = document.get("extensionsUsed", [])
    extensions_required = document.get("extensionsRequired", [])
    for label, values in (("extensionsUsed", extensions_used), ("extensionsRequired", extensions_required)):
        if not isinstance(values, list) or any(not isinstance(value, str) or not value for value in values):
            raise ValueError(f"{path}: glTF {label} must be an array of non-empty strings")
        if len(values) != len(set(values)):
            raise ValueError(f"{path}: glTF {label} contains duplicate entries")
    if not set(extensions_required).issubset(set(extensions_used)):
        raise ValueError(f"{path}: extensionsRequired must be a subset of extensionsUsed")
    meshopt_used = "EXT_meshopt_compression" in extensions_used
    meshopt_required = "EXT_meshopt_compression" in extensions_required

    buffer_lengths = []
    buffer_has_data = []
    placeholder_buffers = set()
    fallback_buffers = set()
    for index, buffer in enumerate(buffers):
        if not isinstance(buffer, dict):
            raise ValueError(f"{path}: glTF buffer {index} must be an object")
        declared = buffer.get("byteLength")
        if not isinstance(declared, int) or isinstance(declared, bool) or declared <= 0:
            raise ValueError(f"{path}: glTF buffer {index} has invalid byteLength")
        if "uri" in buffer:
            uri = buffer["uri"]
            if not isinstance(uri, str):
                raise ValueError(f"{path}: glTF buffer {index} has an invalid URI")
            actual_length = embedded_buffer_length(uri, path, index)
            if actual_length < declared:
                raise ValueError(f"{path}: embedded buffer {index} is shorter than byteLength")
            has_data = True
        elif index == 0:
            if binary_chunk is None or declared > len(binary_chunk) or len(binary_chunk) - declared > 3:
                raise ValueError(f"{path}: declared buffer 0 bytes do not match the GLB BIN chunk")
            has_data = True
        else:
            if not meshopt_required:
                raise ValueError(
                    f"{path}: buffer {index} without a URI requires EXT_meshopt_compression"
                )
            placeholder_buffers.add(index)
            has_data = False

        buffer_extensions = buffer.get("extensions", {})
        if not isinstance(buffer_extensions, dict):
            raise ValueError(f"{path}: glTF buffer {index} extensions must be an object")
        meshopt_buffer = buffer_extensions.get("EXT_meshopt_compression")
        if meshopt_buffer is not None:
            if not isinstance(meshopt_buffer, dict):
                raise ValueError(f"{path}: glTF buffer {index} meshopt extension must be an object")
            fallback = meshopt_buffer.get("fallback")
            if fallback is not None and not isinstance(fallback, bool):
                raise ValueError(f"{path}: glTF buffer {index} meshopt fallback flag must be boolean")
            if fallback is True:
                if index == 0:
                    raise ValueError(f"{path}: GLB BIN buffer 0 cannot be a meshopt fallback buffer")
                fallback_buffers.add(index)
            if fallback is False and index in placeholder_buffers:
                raise ValueError(f"{path}: buffer {index} cannot omit data while fallback is false")

        buffer_lengths.append(declared)
        buffer_has_data.append(has_data)

    if buffer_views and not buffers:
        raise ValueError(f"{path}: bufferViews exist without a glTF buffer")
    meshes = document.get("meshes", [])
    materials = document.get("materials", [])
    textures = document.get("textures", [])
    samplers = document.get("samplers", [])
    nodes = document.get("nodes", [])
    scenes = document.get("scenes", [])

    meshes = document.get("meshes", [])
    materials = document.get("materials", [])
    textures = document.get("textures", [])
    samplers = document.get("samplers", [])
    nodes = document.get("nodes", [])
    scenes = document.get("scenes", [])

    meshopt_compressed_view_count = 0
    fallback_referenced_buffers = set()
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
        if byte_offset + byte_length > buffer_lengths[buffer_index]:
            raise ValueError(f"{path}: bufferView {index} exceeds declared buffer bounds")

        view_extensions = view.get("extensions", {})
        if not isinstance(view_extensions, dict):
            raise ValueError(f"{path}: bufferView {index} extensions must be an object")
        meshopt = view_extensions.get("EXT_meshopt_compression")
        if buffer_index in placeholder_buffers and not isinstance(meshopt, dict):
            raise ValueError(
                f"{path}: meshopt fallback buffer {buffer_index} is referenced by an uncompressed bufferView"
            )
        if buffer_index in fallback_buffers and not isinstance(meshopt, dict):
            raise ValueError(
                f"{path}: meshopt fallback buffer {buffer_index} is referenced by an uncompressed bufferView"
            )
        if meshopt is not None:
            if not meshopt_used or not isinstance(meshopt, dict):
                raise ValueError(f"{path}: bufferView {index} has an undeclared meshopt compression extension")
            compressed_buffer = meshopt.get("buffer")
            compressed_offset = meshopt.get("byteOffset", 0)
            compressed_length = meshopt.get("byteLength")
            stride = meshopt.get("byteStride")
            count = meshopt.get("count")
            mode = meshopt.get("mode")
            filter_name = meshopt.get("filter", "NONE")
            if (not isinstance(compressed_buffer, int) or isinstance(compressed_buffer, bool)
                    or not 0 <= compressed_buffer < len(buffers)):
                raise ValueError(f"{path}: bufferView {index} has an invalid meshopt source buffer")
            if compressed_buffer in placeholder_buffers or compressed_buffer in fallback_buffers:
                raise ValueError(f"{path}: bufferView {index} meshopt source points to a fallback buffer")
            if not buffer_has_data[compressed_buffer]:
                raise ValueError(f"{path}: bufferView {index} meshopt source buffer has no data")
            if (not isinstance(compressed_offset, int) or isinstance(compressed_offset, bool)
                    or compressed_offset < 0 or not isinstance(compressed_length, int)
                    or isinstance(compressed_length, bool) or compressed_length <= 0
                    or compressed_offset + compressed_length > buffer_lengths[compressed_buffer]):
                raise ValueError(f"{path}: bufferView {index} meshopt compressed range exceeds source buffer")
            if (not isinstance(stride, int) or isinstance(stride, bool) or stride <= 0
                    or stride > 256 or not isinstance(count, int) or isinstance(count, bool) or count <= 0):
                raise ValueError(f"{path}: bufferView {index} has invalid meshopt stride or count")
            if mode not in {"ATTRIBUTES", "TRIANGLES", "INDICES"}:
                raise ValueError(f"{path}: bufferView {index} has an invalid meshopt mode")
            if filter_name not in {"NONE", "OCTAHEDRAL", "QUATERNION", "EXPONENTIAL"}:
                raise ValueError(f"{path}: bufferView {index} has an invalid meshopt filter")
            if byte_length != stride * count:
                raise ValueError(f"{path}: bufferView {index} meshopt output size does not match stride and count")
            if view.get("byteStride") is not None and view["byteStride"] != stride:
                raise ValueError(f"{path}: bufferView {index} byteStride disagrees with meshopt extension")
            if mode == "ATTRIBUTES" and stride % 4:
                raise ValueError(f"{path}: bufferView {index} meshopt attribute stride must be divisible by four")
            if mode == "TRIANGLES" and count % 3:
                raise ValueError(f"{path}: bufferView {index} meshopt triangle count must be divisible by three")
            if mode in {"TRIANGLES", "INDICES"} and stride not in {2, 4}:
                raise ValueError(f"{path}: bufferView {index} meshopt index stride must be two or four")
            if mode in {"TRIANGLES", "INDICES"} and filter_name != "NONE":
                raise ValueError(f"{path}: bufferView {index} meshopt index mode cannot use a filter")
            if filter_name == "OCTAHEDRAL" and stride not in {4, 8}:
                raise ValueError(f"{path}: bufferView {index} meshopt octahedral filter has invalid stride")
            if filter_name == "QUATERNION" and stride != 8:
                raise ValueError(f"{path}: bufferView {index} meshopt quaternion filter has invalid stride")
            if filter_name == "EXPONENTIAL" and stride % 4:
                raise ValueError(f"{path}: bufferView {index} meshopt exponential filter has invalid stride")
            meshopt_compressed_view_count += 1
            if buffer_index in placeholder_buffers or buffer_index in fallback_buffers:
                fallback_referenced_buffers.add(buffer_index)

        stride = view.get("byteStride")
        if stride is not None and (
            not isinstance(stride, int) or isinstance(stride, bool)
            or stride < 4 or stride > 252 or stride % 4
        ):
            raise ValueError(f"{path}: bufferView {index} has invalid byteStride")
        target = view.get("target")
        if target is not None and target not in {34962, 34963}:
            raise ValueError(f"{path}: bufferView {index} has invalid target")

    for index in placeholder_buffers | fallback_buffers:
        if index not in fallback_referenced_buffers:
            raise ValueError(f"{path}: meshopt fallback buffer {index} has no compressed bufferView references")

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
        component_bytes = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}[component_type]
        accessor_offset = accessor.get("byteOffset", 0)
        if not isinstance(accessor_offset, int) or isinstance(accessor_offset, bool) or accessor_offset < 0:
            raise ValueError(f"{path}: accessor {index} has invalid byteOffset")
        if accessor_offset % component_bytes:
            raise ValueError(f"{path}: accessor {index} byteOffset is not component-aligned")
        if accessor_type not in {"SCALAR", "VEC2", "VEC3", "VEC4", "MAT2", "MAT3", "MAT4"}:
            raise ValueError(f"{path}: accessor {index} has invalid type")

        # Compute glTF element layout, including 4-byte matrix-column padding
        # for 8-bit and 16-bit component types.
        columns, rows = {
            "SCALAR": (1, 1), "VEC2": (1, 2), "VEC3": (1, 3), "VEC4": (1, 4),
            "MAT2": (2, 2), "MAT3": (3, 3), "MAT4": (4, 4),
        }[accessor_type]
        column_bytes = rows * component_bytes
        if columns > 1 and component_bytes < 4:
            column_bytes = (column_bytes + 3) // 4 * 4
        element_bytes = columns * column_bytes
        if view_index is None:
            if "sparse" not in accessor:
                raise ValueError(f"{path}: accessor {index} has neither bufferView nor sparse data")
        else:
            view = buffer_views[view_index]
            stride = view.get("byteStride", element_bytes)
            if (not isinstance(stride, int) or isinstance(stride, bool)
                    or stride < element_bytes or stride % component_bytes):
                raise ValueError(f"{path}: accessor {index} has invalid bufferView stride")
            required_end = accessor_offset + (count - 1) * stride + element_bytes
            if required_end > view["byteLength"]:
                raise ValueError(f"{path}: accessor {index} data exceeds its bufferView bounds")

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
        "meshopt_compressed_view_count": meshopt_compressed_view_count,
        "meshopt_fallback_buffer_count": len(placeholder_buffers | fallback_buffers),
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


def record_rejection(report, city_result, key, rejection):
    """Retain per-asset failures so one bad download cannot hide other evidence."""
    city_result.setdefault(key, []).append(rejection)
    report.setdefault("errors", []).append(rejection)


def audit_tevy(manifest, report):
    if manifest is None:
        return
    for city in CITIES:
        entries = manifest["cities"].get(city)
        if not isinstance(entries, dict):
            raise ValueError(f"Tevy manifest missing city {city}")
        models = entries.get("selected_and_acquired") or []
        if not isinstance(models, list):
            raise ValueError(f"Tevy {city}: selected_and_acquired must be an array")
        city_result = report["cities"][city]
        city_result["tevy_model_count"] = len(models)
        seen = set()
        for model in models:
            slug = model.get("slug") if isinstance(model, dict) else None
            try:
                if not isinstance(model, dict):
                    raise ValueError("Tevy model entry must be an object")
                if not isinstance(slug, str) or not slug.strip():
                    raise ValueError("Tevy model is missing a valid slug")
                if slug in seen:
                    raise ValueError(f"Tevy {city}: duplicate model slug {slug}")
                seen.add(slug)
                lod_items = model.get("lods")
                if not isinstance(lod_items, list):
                    raise ValueError(f"Tevy {city}/{slug}: lods must be an array")
                lods = {}
                for item in lod_items:
                    if not isinstance(item, dict):
                        raise ValueError(f"Tevy {city}/{slug}: LOD entry must be an object")
                    level = item.get("lod")
                    if (not isinstance(level, int) or isinstance(level, bool)
                            or level not in {0, 1, 2} or level in lods):
                        raise ValueError(f"Tevy {city}/{slug}: invalid or duplicate LOD level")
                    lods[level] = item
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
            except (OSError, ValueError, TypeError, KeyError) as exc:
                record_rejection(report, city_result, "tevy_invalid_models", {
                    "source": "tevy",
                    "city": city,
                    "slug": slug,
                    "error": str(exc),
                })


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
            slug = model.get("slug") if isinstance(model, dict) else None
            try:
                if not isinstance(model, dict):
                    raise ValueError("3DAssets model entry must be an object")
                path = safe_artifact_path(ROOT / "city-architecture-models", model.get("file"))
                result = inspect_glb(path, model.get("sha256"))
                if result["bytes"] != model.get("bytes"):
                    raise ValueError(f"3DAssets {city}/{slug}: byte count mismatch")
                city_result["3dassets_models"].append({
                    "slug": slug,
                    **result,
                })
                city_result["3dassets_textured_count"] += int(
                    result["embedded_image_count"] > 0
                )
            except (OSError, ValueError, TypeError, KeyError) as exc:
                record_rejection(report, city_result, "3dassets_invalid_models", {
                    "source": "3dassets",
                    "city": city,
                    "slug": slug,
                    "error": str(exc),
                })


def main():
    report = {
        "scope": "binary and provenance integrity only; not visual or Unity acceptance",
        "errors": [],
        "cities": {
            city: {
                "tevy_model_count": 0, "tevy_textured_lod0_count": 0,
                "tevy_lods": [], "tevy_invalid_models": [],
                "3dassets_model_count": 0, "3dassets_textured_count": 0,
                "3dassets_models": [], "3dassets_invalid_models": [],
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
        "tevy_valid_models": sum(len(x["tevy_lods"]) for x in report["cities"].values()),
        "tevy_invalid_models": sum(len(x["tevy_invalid_models"]) for x in report["cities"].values()),
        "tevy_lod_binaries": sum(len(x["tevy_lods"]) * 3 for x in report["cities"].values()),
        "tevy_textured_lod0": sum(x["tevy_textured_lod0_count"] for x in report["cities"].values()),
        "3dassets_models": sum(x["3dassets_model_count"] for x in report["cities"].values()),
        "3dassets_valid_models": sum(len(x["3dassets_models"]) for x in report["cities"].values()),
        "3dassets_invalid_models": sum(len(x["3dassets_invalid_models"]) for x in report["cities"].values()),
        "3dassets_textured_models": sum(x["3dassets_textured_count"] for x in report["cities"].values()),
    }
    invalid_total = report["totals"]["tevy_invalid_models"] + report["totals"]["3dassets_invalid_models"]
    report["audit_status"] = "rejected_assets" if invalid_total else "passed"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report["totals"], sort_keys=True))
    for city, value in report["cities"].items():
        print(
            f"{city}: Tevy {value['tevy_model_count']} source models/"
            f"{len(value['tevy_lods'])} valid/{len(value['tevy_invalid_models'])} rejected; "
            f"{value['tevy_textured_lod0_count']} textured LOD0; "
            f"3DAssets {value['3dassets_model_count']} source models/"
            f"{len(value['3dassets_models'])} valid/"
            f"{len(value['3dassets_invalid_models'])} rejected; "
            f"{value['3dassets_textured_count']} textured"
        )
    if invalid_total:
        raise SystemExit(
            f"City asset binary audit rejected {invalid_total} model(s); "
            f"detailed per-model evidence saved to {OUT}"
        )


if __name__ == "__main__":
    main()
