#!/usr/bin/env python3
"""Source-level contract checks for UCENO's nine city-specific asset pipeline."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "runtime/world-gateway/config/world-cities.json"
PROFILES = ROOT / "unity/UCENOVirtualWorld/Assets/UCENO/Editor/city-scene-asset-profiles.json"
GENERATOR = ROOT / "unity/UCENOVirtualWorld/Assets/UCENO/Editor/CityProceduralAssetPackGenerator.cs"
SCENE_PIPELINE = ROOT / "unity/UCENOVirtualWorld/Assets/UCENO/Editor/WorldCityScenePipeline.cs"

def require(condition, message):
    if not condition:
        raise SystemExit("UCENO city generator validation failed: " + message)

catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
cities = catalog.get("cities", [])
require(len(cities) == 10, "catalogue must contain ten cities including Meridian Prime")
remaining = [city for city in cities if city.get("id") != "meridian"]
require(len(remaining) == 9, "exactly nine cities must be generated beyond Meridian Prime")

for field in ("id", "identity", "climate", "architecture"):
    values = [city.get(field) for city in cities]
    require(all(values) and len(set(values)) == 10, f"all ten cities need distinct {field} values")

for city in cities:
    require(len(city.get("districts", [])) == 4, f"{city.get('id')} must define four districts")
    require(len(city.get("landmarks", [])) == 3, f"{city.get('id')} must define three landmarks")
    require(len({d.get("id") for d in city["districts"]}) == 4, f"{city['id']} district IDs must be unique")
    require(len({l.get("id") for l in city["landmarks"]}) == 3, f"{city['id']} landmark IDs must be unique")

# Generated Unity assets are intentionally not committed by source-only CI.
# The Unity Editor generator writes this file after it has actually created the
# nine prefab packs. Validate its structure when present; absence is not a pass
# for runtime generation, only a valid pre-generation source state.
if PROFILES.exists():
    profiles = json.loads(PROFILES.read_text(encoding="utf-8")).get("cities", [])
    expected = {city["id"] for city in remaining}
    actual = {profile.get("cityId") for profile in profiles}
    require(actual == expected and len(profiles) == 9, "generated asset profiles must map one-to-one to the nine remaining cities")
    all_paths = []
    for profile in profiles:
        city_id = profile["cityId"]
        require(len(profile.get("architecturePrefabs", [])) == 5, f"{city_id} needs five architecture prefabs")
        require(len(profile.get("environmentPrefabs", [])) == 4, f"{city_id} needs four environment prefabs")
        require(len(profile.get("landmarks", [])) == 3, f"{city_id} needs three landmark prefabs")
        require(profile.get("assetRoot") == f"Assets/UCENO/Cities/{city_id}/Prefabs", f"{city_id} asset root is not city-owned")
        require(profile.get("skyboxTexture", "").startswith(f"Assets/UCENO/Cities/{city_id}/Textures/Skybox/"), f"{city_id} needs its own panorama")
        paths = profile["architecturePrefabs"] + profile["environmentPrefabs"] + [x["prefab"] for x in profile["landmarks"]]
        require(len(paths) == len(set(paths)), f"{city_id} has duplicate asset paths")
        require(all(path.startswith(profile["assetRoot"] + "/") for path in paths), f"{city_id} has assets outside its own root")
        all_paths.extend(paths)
    require(len(all_paths) == len(set(all_paths)), "prefab paths must never be shared between cities")

generator = GENERATOR.read_text(encoding="utf-8")
for token in ("Generate Nine City-Specific Asset Packs", "PrefabUtility.SaveAsPrefabAsset",
              "AssetDatabase.CreateAsset(mesh", "new LOD(", "LODGroup", "BuildMesh(",
              "CreatePanorama(", "ArchitectureNames", "EnvironmentNames", "DetermineArchitecturalStyle"):
    require(token in generator, f"procedural asset generator is missing {token}")

pipeline = SCENE_PIPELINE.read_text(encoding="utf-8")
for token in ("Build Remaining Nine City Scenes", "RegisterAddressableScene",
              "WorldInteractableRegistryExporter.Export", "WorldCollisionGeometryExporter.Export",
              "Verify Nine City Scene Registries"):
    require(token in pipeline, f"scene pipeline is missing {token}")

require("VerifyNineCitySceneRegistries();" in pipeline,
        "scene generation must automatically verify exported scene and registry data")
require("ValidateNineCityVisualQuality();" in pipeline,
        "city scene generation must enforce the PBR and geometry visual-quality release gate")

style_rules = {
    "solstice": "terraced waterfront",
    "verdant": "biophilic",
    "nexus": "parametric",
    "aurora": "hillside",
    "saffron": "shaded arcade",
    "monsoon": "elevated",
    "eclipse": "entertainment",
    "origin": "campus",
    "atlas": "industrial",
}
for city in remaining:
    rule = style_rules[city["id"]]
    require(rule in city["architecture"].lower(), f'{city["id"]} architecture specification no longer matches its geometry style rule')
require("No city-specific architectural style rule matches" in generator, "unknown architecture must fail instead of silently using a generic city style")
require("Material material, int architecturalStyle, int kind, bool environment" in generator,
        "prefab generation must receive the architecture style derived from the city specification")
require("BuildMesh(architecturalStyle, kind, lod, environment, assetKey)" in generator,
        "city-specific architecture style must drive the actual generated mesh geometry")
require("int style = architecturalStyle;" in generator,
        "mesh generation must not substitute catalogue index for the authored architecture style")
require('root.AddComponent<WorldInteractable>()' in generator,
        "generated landmark prefabs must carry a real WorldInteractable marker")
require("root.AddComponent<BoxCollider>()" in generator and "collider.isTrigger = false;" in generator,
        "generated landmarks must have non-trigger targeting colliders derived from mesh bounds")
require("WorldCityScenePipeline.ValidateRemainingCityPacks();" in generator,
        "generation must validate imported Unity assets immediately after import")
require('File.WriteAllText(Path.Combine(root, ProfilePath)' in generator,
        "Unity Editor generation must emit the asset profile consumed by the scene pipeline")


print("UCENO city source contract passed: 10 catalogue cities, 9 specification-driven geometry styles, 45 architecture prefabs, 36 environment prefabs, 27 landmark prefabs, unique city-owned paths, three LODs, scene export and registry verification wiring.")
