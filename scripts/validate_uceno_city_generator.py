#!/usr/bin/env python3
"""Source-level contract checks for UCENO's imported nine-city art release gate."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "runtime/world-gateway/config/world-cities.json"
PROFILES = ROOT / "unity/UCENOVirtualWorld/Assets/UCENO/Editor/city-scene-asset-profiles.json"
IMPORTED_GATE = ROOT / "unity/UCENOVirtualWorld/Assets/UCENO/Editor/ImportedCityAssetPackGate.cs"
LOD_CONTRACT = ROOT / "unity/UCENOVirtualWorld/Assets/UCENO/Editor/CityAssetLodContract.cs"
SCENE_PIPELINE = ROOT / "unity/UCENOVirtualWorld/Assets/UCENO/Editor/WorldCityScenePipeline.cs"
PIPELINE_DOC = ROOT / "docs/virtual-world/NINE_CITY_SCENE_PIPELINE.md"


def require(condition, message):
    if not condition:
        raise SystemExit("UCENO imported city art validation failed: " + message)


catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
cities = catalog.get("cities", [])
require(len(cities) == 10, "catalogue must contain ten cities including Meridian Prime")
city_ids = [city.get("id") for city in cities]
require(len(set(city_ids)) == 10 and all(city_ids),
        "all ten city IDs must be present and unique")
require("meridian" in city_ids, "Meridian Prime must be present in the ten-city catalogue")
remaining = [city for city in cities if city.get("id") != "meridian"]
require(len(remaining) == 9, "exactly nine cities must be generated beyond Meridian Prime")
require(len({city.get("contentLabel") for city in cities}) == 10,
        "all ten cities need distinct content labels")

for field in ("identity", "climate", "architecture"):
    values = [city.get(field) for city in cities]
    require(all(values) and len(set(values)) == 10,
            f"all ten cities need distinct {field} values")

for city in cities:
    require(len(city.get("districts", [])) == 4, f"{city.get('id')} must define four districts")
    require(len(city.get("landmarks", [])) == 3, f"{city.get('id')} must define three landmarks")
    require(len({d.get("id") for d in city["districts"]}) == 4,
            f"{city['id']} district IDs must be unique")
    require(len({l.get("id") for l in city["landmarks"]}) == 3,
            f"{city['id']} landmark IDs must be unique")

require(IMPORTED_GATE.is_file(), "strict Unity imported-city-art gate is missing")
gate = IMPORTED_GATE.read_text(encoding="utf-8")
for token in (
    "Validate Imported City Art Packs", "source-manifest.json", "sourceUrl", "license",
    "attribution", "GetComponentsInChildren<MeshFilter>", "mainTexture != null",
    "CityAssetLodContract.TryGetValidLods", "WorldInteractable",
    "AssetDatabase.GetAssetDependencyHash", "skybox.width >= 1024 && skybox.height >= 512",
):
    require(token in gate, "imported-art gate is missing check: " + token)

require(LOD_CONTRACT.is_file(), "shared authored-LOD contract is missing")
lod_contract = LOD_CONTRACT.read_text(encoding="utf-8")
for token in (
    "MinimumLodCount = 3", "screenRelativeTransitionHeight",
    "previousThreshold", "assignedRenderers.Add(renderer)",
    "renderer.GetComponent<MeshFilter>()", "skinned.sharedMesh",
    "mesh.vertexCount == 0", "mesh.subMeshCount == 0",
    "previousVertexCount", "previousIndexCount", "lodVertexCount", "lodIndexCount",
    "lodVertexCount >= previousVertexCount", "lodIndexCount >= previousIndexCount",
    "mesh.GetIndexCount(subMesh)",
):
    require(token in lod_contract, "shared LOD contract is missing validation: " + token)

if PROFILES.exists():
    profiles = json.loads(PROFILES.read_text(encoding="utf-8")).get("cities", [])
    expected = {city["id"] for city in remaining}
    actual = {profile.get("cityId") for profile in profiles}
    require(actual == expected and len(profiles) == 9,
            "asset profiles must map one-to-one to the nine remaining cities")
    all_paths = []
    asset_errors = []
    for profile in profiles:
        city_id = profile["cityId"]
        require(len(profile.get("architecturePrefabs", [])) == 5,
                f"{city_id} needs five architecture prefabs")
        require(len(profile.get("environmentPrefabs", [])) == 4,
                f"{city_id} needs four environment prefabs")
        require(len(profile.get("landmarks", [])) == 3,
                f"{city_id} needs three landmark prefabs")
        require(profile.get("assetRoot") == f"Assets/UCENO/Cities/{city_id}/Prefabs",
                f"{city_id} asset root is not city-owned")
        require(profile.get("skyboxTexture", "").startswith(
            f"Assets/UCENO/Cities/{city_id}/Textures/Skybox/"),
            f"{city_id} needs its own imported panorama")
        paths = profile["architecturePrefabs"] + profile["environmentPrefabs"] + [
            x["prefab"] for x in profile["landmarks"]]
        require(len(paths) == len(set(paths)), f"{city_id} has duplicate asset paths")
        require(all(path.startswith(profile["assetRoot"] + "/") for path in paths),
                f"{city_id} has assets outside its own root")
        all_paths.extend(paths)

        unity_root = ROOT / "unity/UCENOVirtualWorld"
        city_root = unity_root / "Assets/UCENO/Cities" / city_id
        manifest = city_root / "source-manifest.json"
        if not manifest.is_file():
            asset_errors.append(
                f"{city_id}: missing source-manifest.json ({manifest.relative_to(unity_root)})")
        else:
            try:
                manifest_data = json.loads(manifest.read_text(encoding="utf-8"))
                manifest_assets = manifest_data.get("assets", [])
                if len(manifest_assets) != 12:
                    asset_errors.append(
                        f"{city_id}: source manifest declares {len(manifest_assets)} assets; expected 12")
                manifest_paths = {entry.get("prefab") for entry in manifest_assets}
                if manifest_paths != set(paths):
                    asset_errors.append(
                        f"{city_id}: source manifest does not cover the exact configured prefab paths")
            except (OSError, json.JSONDecodeError, AttributeError, TypeError) as error:
                asset_errors.append(f"{city_id}: source manifest cannot be parsed: {error}")

        for asset_path in paths:
            disk_path = unity_root / asset_path
            if not disk_path.is_file():
                asset_errors.append(
                    f"{city_id}: missing configured prefab {asset_path}")

        skybox_path = unity_root / profile["skyboxTexture"]
        if not skybox_path.is_file():
            asset_errors.append(
                f"{city_id}: missing city-specific HDRI source {profile['skyboxTexture']}")
        hdri_provenance = skybox_path.parent / "hdri-provenance.json"
        if not hdri_provenance.is_file():
            asset_errors.append(
                f"{city_id}: missing HDRI provenance {hdri_provenance.relative_to(unity_root)}")

    require(len(all_paths) == len(set(all_paths)),
            "prefab paths must never be shared between cities")
    if asset_errors:
        details = "\n - ".join(asset_errors)
        raise SystemExit(
            "UCENO imported city art validation failed with "
            f"{len(asset_errors)} missing or invalid source-art records:\n - {details}")

pipeline = SCENE_PIPELINE.read_text(encoding="utf-8")
for token in (
    "Validate Ten-City Catalogue and Pack Coverage", "actual.Count != 9",
    "expected.Count != 9", "Meridian Prime plus nine distinct catalogue cities",
    "Build Remaining Nine City Scenes", "RegisterAddressableScene",
    "WorldInteractableRegistryExporter.Export", "WorldCollisionGeometryExporter.Export",
    "Verify Nine City Scene Registries", "ValidateTenCityCoverage",
    "CityAssetLodContract.TryGetValidLods",
):
    require(token in pipeline, f"scene pipeline is missing ten-city/LOD contract: {token}")
require("VerifyNineCitySceneRegistries();" in pipeline,
        "scene generation must automatically verify exported scene and registry data")
require("ImportedCityAssetPackGate.Validate();" in pipeline,
        "scene generation must enforce real imported-art provenance and geometry before proceeding")
require("ValidateNineCityVisualQuality();" in pipeline,
        "city scene generation must enforce its visual-quality release gate")

doc = PIPELINE_DOC.read_text(encoding="utf-8")
for token in (
    "Do not use", "Validate Imported City Art Packs", "source-manifest.json",
    "108 imported prefabs", "nine city-specific HDRI",
    "shared `CityAssetLodContract` is authoritative",
):
    require(token in doc, "pipeline documentation is missing imported-art policy: " + token)

print("UCENO imported city source contract passed: ten-city catalogue, Meridian plus nine distinct city profiles, 36 districts, 30 landmarks, 108 imported prefabs, nine HDRI panoramas, provenance, detailed meshes and the shared authored-LOD contract.")
print("STATUS: source contract only. Unity Editor asset import, gate execution, scene generation and visual acceptance are still required.")
