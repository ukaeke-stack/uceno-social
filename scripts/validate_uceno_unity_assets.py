#!/usr/bin/env python3
"""Static validation for the UCENO Unity imported-asset scene foundation.

This intentionally does not invoke Unity, create a build, or produce an APK.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT = Path("unity/UCENOVirtualWorld")
ASSETS = PROJECT / "Assets/UCENO"
IMPORTED = ASSETS / "Environment/Imported"
MAX_FILE_BYTES = 100 * 1024 * 1024
MAX_IMPORTED_BYTES = 350 * 1024 * 1024

REQUIRED_FILES = [
    ASSETS / "Characters/Imported/UCENO_Default_Avatar.fbx",
    ASSETS / "Documentation/Ara3DGen/ASSETS_LICENSE.txt",
    ASSETS / "Documentation/FREE_ASSET_MANIFEST.md",
    ASSETS / "Editor/FreeAssetWorldSceneBuilder.cs",
    ASSETS / "Editor/FreeAssetModelPostprocessor.cs",
    ASSETS / "Editor/FreeAssetTexturePostprocessor.cs",
    ASSETS / "Editor/StarterSceneBuilder.cs",
    ASSETS / "Editor/WorldInteractableAuthoring.cs",
    ASSETS / "Editor/WorldInteractableRegistryExporter.cs",
    ASSETS / "Editor/WorldDistrictSceneValidator.cs",
    ASSETS / "Scripts/WorldInteractable.cs",
    ASSETS / "Scripts/WorldObjectInteractor.cs",
    ASSETS / "Scripts/WorldGatewayClient.cs",
    ASSETS / "Scripts/PlayerMotor.cs",
    ASSETS / "Scripts/FollowCamera.cs",
    ASSETS / "Scripts/AvatarLocomotionDriver.cs",
    ASSETS / "Scripts/AvatarCrowdLod.cs",
    ASSETS / "Scripts/WorldStatusHud.cs",
    ASSETS / "Scripts/WorldSessionClient.cs",
    ASSETS / "Scripts/WorldHomeClient.cs",
    ASSETS / "Scripts/WorldEventsClient.cs",
    ASSETS / "Scripts/WorldPresenceClient.cs",
    IMPORTED / "HDRI/modern_buildings_1k.hdr",
    IMPORTED / "Models/modular_urban_apartments_facade/modular_urban_apartments_facade.fbx",
    IMPORTED / "Models/modular_factory_facade/modular_factory_facade.fbx",
    IMPORTED / "Models/street_lamp_01/street_lamp_01.fbx",
    IMPORTED / "Models/pachira_aquatica_01/pachira_aquatica_01.fbx",
    IMPORTED / "Models/shrub_02/shrub_02.fbx",
    IMPORTED / "Models/shrub_03/shrub_03.fbx",
    IMPORTED / "Models/covered_car/covered_car.fbx",
    IMPORTED / "Models/modular_chainlink_fence/modular_chainlink_fence.fbx",
    IMPORTED / "Models/sofa_01/sofa_01.fbx",
    IMPORTED / "Models/arm_chair_01/arm_chair_01.fbx",
    IMPORTED / "Models/round_wooden_table_01/round_wooden_table_01.fbx",
    IMPORTED / "Models/gothic_bed_01/gothic_bed_01.fbx",
    IMPORTED / "Models/gothic_cabinet_01/gothic_cabinet_01.fbx",
]

REQUIRED_TEXTURES = [
    IMPORTED / "Textures/asphalt_01/asphalt_01_diff.jpg",
    IMPORTED / "Textures/asphalt_01/asphalt_01_nor_gl.png",
    IMPORTED / "Textures/asphalt_01/asphalt_01_ao.jpg",
    IMPORTED / "Textures/concrete_floor_01/concrete_floor_01_diff.jpg",
    IMPORTED / "Textures/concrete_floor_01/concrete_floor_01_nor_gl.png",
    IMPORTED / "Textures/sparse_grass/sparse_grass_diff.jpg",
    IMPORTED / "Textures/sparse_grass/sparse_grass_nor_gl.png",
]


def fail(message: str):
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as error:
        fail(f"Cannot read {path}: {error}")


def check_manifests() -> tuple[int, int]:
    manifests = sorted(IMPORTED.rglob("asset-manifest.json"))
    if len(manifests) < 10:
        fail(f"Expected model, texture and HDRI manifests; found only {len(manifests)}")

    checked_files = 0
    total_bytes = 0
    for manifest_path in manifests:
        try:
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            fail(f"Invalid asset manifest {manifest_path}: {error}")

        if data.get("license") != "CC0 1.0":
            fail(f"Non-CC0 or missing licence in {manifest_path}")
        if not str(data.get("source", "")).startswith("https://polyhaven.com/a/"):
            fail(f"Missing Poly Haven source URL in {manifest_path}")

        folder = manifest_path.parent
        listed = data.get("files") or data.get("maps") or ([data["file"]] if data.get("file") else [])
        if not listed:
            fail(f"No downloaded files recorded in {manifest_path}")

        for relative in listed:
            path = folder / relative
            if not path.is_file():
                fail(f"Manifest file is missing: {path}")
            size = path.stat().st_size
            if size >= MAX_FILE_BYTES:
                fail(f"File exceeds GitHub's 100 MB limit: {path} ({size} bytes)")
            checked_files += 1
            total_bytes += size

    if total_bytes > MAX_IMPORTED_BYTES:
        fail(f"Imported environment assets exceed 350 MB ({total_bytes} bytes)")
    return len(manifests), checked_files


def check_city_asset_inventory() -> tuple[int, int, int]:
    """Require real city files and complete source records, not path-only manifests."""
    profile_file = ASSETS / "Editor/city-scene-asset-profiles.json"
    try:
        profiles = json.loads(profile_file.read_text(encoding="utf-8")).get("cities", [])
    except (OSError, json.JSONDecodeError) as error:
        fail(f"Invalid city asset profiles: {error}")
    expected = {"solstice", "verdant", "nexus", "aurora", "saffron", "monsoon", "eclipse", "origin", "atlas"}
    if len(profiles) != 9 or {item.get("cityId") for item in profiles} != expected:
        fail("City asset inventory must contain exactly the nine non-Meridian cities.")
    missing_prefabs = []
    missing_source_manifests = []
    for city in profiles:
        city_id = city["cityId"]
        city_root = Path("unity/UCENOVirtualWorld/Assets/UCENO/Cities") / city_id
        prefab_paths = (city.get("architecturePrefabs") or []) + (city.get("environmentPrefabs") or []) + [
            landmark.get("prefab") for landmark in city.get("landmarks", [])
        ]
        for asset_path in prefab_paths:
            if not isinstance(asset_path, str):
                missing_prefabs.append(f"{city_id}: invalid prefab path {asset_path!r}")
                continue
            disk_path = PROJECT / asset_path
            if not disk_path.is_file() or disk_path.stat().st_size == 0:
                missing_prefabs.append(str(disk_path))
        source_manifest = city_root / "source-manifest.json"
        if not source_manifest.is_file() or source_manifest.stat().st_size == 0:
            missing_source_manifests.append(str(source_manifest))
    if missing_prefabs or missing_source_manifests:
        details = []
        if missing_prefabs:
            details.append(f"{len(missing_prefabs)} missing/empty city prefabs:\n - " + "\n - ".join(missing_prefabs))
        if missing_source_manifests:
            details.append(f"{len(missing_source_manifests)} missing/empty city source manifests:\n - " + "\n - ".join(missing_source_manifests))
        fail("City imported-asset inventory is incomplete; path-only profiles are not proof of imported files.\n" + "\n".join(details))

    checked_prefabs = 0
    checked_hdris = 0
    total_bytes = 0
    for city in profiles:
        city_id = city["cityId"]
        city_root = Path("unity/UCENOVirtualWorld/Assets/UCENO/Cities") / city_id
        prefab_paths = (city.get("architecturePrefabs") or []) + (city.get("environmentPrefabs") or []) + [
            landmark.get("prefab") for landmark in city.get("landmarks", [])
        ]
        if len(prefab_paths) != 12 or len(set(prefab_paths)) != 12:
            fail(f"{city_id} must declare 12 distinct city-owned prefab paths.")
        for asset_path in prefab_paths:
            if not isinstance(asset_path, str) or not asset_path.startswith(f"Assets/UCENO/Cities/{city_id}/Prefabs/"):
                fail(f"{city_id} contains a prefab path outside its own imported asset root: {asset_path}")
            disk_path = PROJECT / asset_path
            if not disk_path.is_file() or disk_path.stat().st_size == 0:
                fail(f"{city_id} prefab is absent or empty; manifest paths are not proof of import: {disk_path}")
            checked_prefabs += 1
            total_bytes += disk_path.stat().st_size
        source_manifest = city_root / "source-manifest.json"
        try:
            provenance = json.loads(source_manifest.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            fail(f"{city_id} source manifest is missing or invalid: {error}")
        records = provenance.get("assets") or []
        if len(records) != 12 or {item.get("prefab") for item in records} != set(prefab_paths):
            fail(f"{city_id} source manifest must account for exactly its 12 configured prefabs.")
        for record in records:
            if not record.get("sourceName") or not record.get("attribution"):
                fail(f"{city_id} has incomplete source attribution for {record.get('prefab')}.")
            source = record.get("sourceUrl", "")
            if not source.startswith("https://") or record.get("license") not in {
                "CC0 1.0", "CC-BY 4.0", "CC-BY 3.0", "CC-BY-SA 4.0", "CC-BY-SA 3.0"
            }:
                fail(f"{city_id} has an unapproved source URL or redistribution licence.")
        hdri_path = PROJECT / city.get("skyboxTexture", "")
        expected_hdri = city_root / "Textures" / "Skybox" / f"{city_id}_environment.hdr"
        if hdri_path != expected_hdri or not hdri_path.is_file() or hdri_path.stat().st_size == 0:
            fail(f"{city_id} city-specific HDRI is missing or mapped to the wrong path: {hdri_path}")
        record_path = hdri_path.parent / "hdri-provenance.json"
        try:
            hdri = json.loads(record_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            fail(f"{city_id} HDRI provenance is missing or invalid: {error}")
        if hdri.get("city_id") != city_id or hdri.get("file") != hdri_path.as_posix():
            fail(f"{city_id} HDRI provenance does not identify the exact city file.")
        import hashlib
        digest = hashlib.sha256(hdri_path.read_bytes()).hexdigest()
        if digest.lower() != str(hdri.get("verified_sha256", "")).lower():
            fail(f"{city_id} HDRI SHA-256 does not match its provenance record.")
        if hdri_path.stat().st_size != hdri.get("actual_size_bytes"):
            fail(f"{city_id} HDRI byte count does not match its provenance record.")
        checked_hdris += 1
        total_bytes += hdri_path.stat().st_size
    if total_bytes > MAX_IMPORTED_BYTES:
        fail(f"City-specific imported assets exceed 350 MB ({total_bytes} bytes).")
    return checked_prefabs, checked_hdris, total_bytes

def main():
    missing = [path for path in REQUIRED_FILES + REQUIRED_TEXTURES if not path.is_file()]
    if missing:
        fail("Required source assets are missing:\n - " + "\n - ".join(map(str, missing)))

    for path in REQUIRED_FILES + REQUIRED_TEXTURES:
        if path.stat().st_size >= MAX_FILE_BYTES:
            fail(f"File exceeds GitHub's 100 MB limit: {path}")

    placeholder_paths = [
        ASSETS / "Scripts/WorldBootstrap.cs",
        ASSETS / "Scripts/ProceduralAvatar.cs",
    ]
    leftovers = [path for path in placeholder_paths if path.exists()]
    if leftovers:
        fail("Procedural placeholder scripts still exist: " + ", ".join(map(str, leftovers)))

    manifest_path = PROJECT / "Packages/manifest.json"
    try:
        package_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"Invalid Unity package manifest: {error}")
    if "com.unity.cloud.gltfast" in package_manifest.get("dependencies", {}):
        fail("Unused glTFast package should not be included; all selected models are FBX.")

    builder = read_text(ASSETS / "Editor/FreeAssetWorldSceneBuilder.cs")
    for required in (
        "UCENO_Default_Avatar.fbx",
        "modular_urban_apartments_facade.fbx",
        "modular_factory_facade.fbx",
        "sofa_01.fbx",
        "arm_chair_01.fbx",
        "round_wooden_table_01.fbx",
        "gothic_bed_01.fbx",
        "gothic_cabinet_01.fbx",
        "modern_buildings_1k.hdr",
        "Textures/asphalt_01",
        "Textures/concrete_floor_01",
        "Textures/sparse_grass",
        "AnimatorController",
        "BlendTree",
        "BuildFailedException",
    ):
        if required not in builder:
            fail(f"Scene builder is missing required integration marker: {required}")

    imported_city_gate = read_text(ASSETS / "Editor/ImportedCityAssetPackGate.cs")
    for required in (
        "manifest.assets.Select(a => a.prefab).Distinct(StringComparer.Ordinal).Count() == 12",
        "SetEquals(paths)",
        "Uri.TryCreate(source.sourceUrl, UriKind.Absolute, out Uri sourceUri)",
        "sourceUri.Scheme == Uri.UriSchemeHttps",
        '"CC0 1.0", "CC-BY 4.0", "CC-BY 3.0"',
        '"CC-BY-SA 4.0", "CC-BY-SA 3.0"',
        'city.skyboxTexture.StartsWith("Assets/UCENO/Cities/" + city.cityId',
    ):
        if required not in imported_city_gate:
            fail("Imported city art provenance/reuse gate is missing: " + required)

    for required in (
        "AssetAbsolutePath(ProfilePath)",
        'Path.Combine(Application.dataPath, "..", "..", "..", CatalogPath)',
        "AssetAbsolutePath(cityRoot + \"/\" + ManifestName)",
        "AssetDatabase.LoadAssetAtPath<GameObject>(path)",
        "GetAssetDependencyHash",
    ):
        if required not in imported_city_gate:
            fail("Imported city art gate has an invalid project-root path or missing asset verification: " + required)

    city_pipeline = read_text(ASSETS / "Editor/WorldCityScenePipeline.cs")
    city_lod_contract = read_text(ASSETS / "Editor/CityAssetLodContract.cs")
    for required in ("ValidateRemainingCityPacks", "BuildRemainingCities",
                     "VerifyNineCitySceneRegistries", "BuildRemoteAddressablesContent",
                     "CheckForCatalogUpdates", "UpdateCatalogs(catalogCheck.Result, false)",
                     "BuildPlayerContent(out AddressablesPlayerBuildResult result)",
                     "RemoteCatalogJsonFilePath", "RemoteCatalogHashFilePath",
                     "geometryOwners", "GetAssetDependencyHash"):
        if required not in city_pipeline and required not in read_text(ASSETS / "Scripts/WorldContentDelivery.cs"):
            fail("Nine-city/remote Addressables release pipeline is missing: " + required)
    for required in ("CityAssetLodContract.TryGetValidLods(prefab, out LOD[] lods)",):
        if required not in city_pipeline:
            fail("Nine-city imported prefab pipeline is missing its shared LOD contract: " + required)
    for required in ("MinimumLodCount = 3", "GetComponentInChildren<LODGroup>(true)"):
        if required not in city_lod_contract:
            fail("Nine-city imported prefab LOD contract is incomplete: " + required)

    build_command = read_text(ASSETS / "Editor/BuildCommand.cs")
    for required in ("ValidateRemainingCityPacks()", "BuildRemainingCities()",
                     "VerifyNineCitySceneRegistries()", "BuildRemoteAddressablesContent()"):
        if required not in build_command:
            fail("Android pre-export does not enforce the complete city content gate: " + required)

    starter = read_text(ASSETS / "Editor/StarterSceneBuilder.cs")
    if "FreeAssetWorldSceneBuilder.CreateStarterScene()" not in starter:
        fail("StarterSceneBuilder does not invoke the realistic city scene builder.")

    city_catalog = json.loads(
        (Path("runtime/world-gateway/config/world-cities.json")).read_text(encoding="utf-8")
    )
    meridian = next((city for city in city_catalog.get("cities", [])
                     if city.get("id") == "meridian"), None)
    if meridian is None:
        fail("The Meridian starter city is missing from the gateway city catalogue.")
    meridian_districts = meridian.get("districts", [])
    gateway_districts = json.loads(
        (Path("runtime/world-gateway/config/world-districts.json")).read_text(encoding="utf-8")
    ).get("districts", [])
    district_builder = builder[builder.index("private static void BuildDistrictScenes"):]
    if len(meridian_districts) != 4 or len(gateway_districts) != 4:
        fail("Meridian catalogue and gateway must each define exactly four districts.")
    for authored in meridian_districts:
        gateway = next((item for item in gateway_districts if item.get("id") == authored.get("id")), None)
        if gateway is None or gateway.get("contentLabel") != authored.get("contentLabel"):
            fail("Meridian gateway district is missing or has a different content label: " + str(authored.get("id")))
        center = authored.get("center") or {}
        radius = authored.get("radius")
        expected_bounds = {
            "minX": center.get("x", 0) - radius,
            "maxX": center.get("x", 0) + radius,
            "minZ": center.get("z", 0) - radius,
            "maxZ": center.get("z", 0) + radius,
        }
        for key, value in expected_bounds.items():
            if gateway.get(key) != value:
                fail("Meridian gateway district geometry differs from the city catalogue: " + authored["id"] + "." + key)
    if 'const string cityId = "meridian"' not in district_builder:
        fail("Starter district scene generation must identify its actual city instead of generic district labels.")
    if '"world-city-" + cityId + "-" + districtName' not in district_builder:
        fail("Meridian Addressables labels must be generated from the actual city and district IDs.")
    if "world-city-district-" in district_builder:
        fail("Newly generated city district scenes must not use the obsolete generic Addressables label.")

    for layout in ("linear-waterfront", "multi-level-green-corridors", "river-island-campus",
                   "contour-terraces", "oasis-radial-courtyards", "elevated-grid-and-canals",
                   "entertainment-superblocks", "rail-spoke-industrial", "garden-city-radial"):
        if 'layout == "' + layout + '"' not in city_pipeline:
            fail("Nine-city scene generator is missing a dedicated layout branch: " + layout)

    profiles = json.loads(
        (ASSETS / "Editor/city-scene-asset-profiles.json").read_text(encoding="utf-8")
    ).get("cities", [])
    remaining_cities = [city for city in city_catalog.get("cities", []) if city.get("id") != "meridian"]
    if len(city_catalog.get("cities", [])) != 10 or len(remaining_cities) != 9:
        fail("The world catalogue must contain Meridian plus nine distinct additional cities.")
    if len(profiles) != 9 or {item.get("cityId") for item in profiles} != {item.get("id") for item in remaining_cities}:
        fail("Nine distinct non-Meridian city asset profiles are required.")
    roots = [item.get("assetRoot") for item in profiles]
    if len(set(roots)) != 9:
        fail("Each remaining city must have its own unique imported asset root.")
    for city in remaining_cities:
        profile = next(item for item in profiles if item.get("cityId") == city["id"])
        if len(profile.get("architecturePrefabs", [])) < 3 or len(profile.get("environmentPrefabs", [])) < 3:
            fail("City-specific architecture and environment prefab contracts are incomplete: " + city["id"])
        landmark_ids = {item.get("id") for item in city.get("landmarks", [])}
        profile_landmarks = {item.get("landmarkId") for item in profile.get("landmarks", [])}
        if len(landmark_ids) < 3 or profile_landmarks != landmark_ids:
            fail("City-specific landmark prefab mapping is incomplete: " + city["id"])
        if any(not landmark.get("districtId") or not any(
            district.get("id") == landmark.get("districtId") for district in city.get("districts", [])
        ) for landmark in city.get("landmarks", [])):
            fail("A city landmark has no valid owning district: " + city["id"])

    motor = read_text(ASSETS / "Scripts/PlayerMotor.cs")
    if "AnimationSpeed" not in motor or "SetSprinting" not in motor:
        fail("PlayerMotor is missing animation/sprint integration.")

    camera = read_text(ASSETS / "Scripts/FollowCamera.cs")
    if "Physics.SphereCast" not in camera:
        fail("FollowCamera is missing city-geometry collision handling.")
    if "previousPinchDistance" not in camera or "maximumDistance" not in camera:
        fail("FollowCamera is missing bounded pinch/wheel zoom controls.")

    avatar = read_text(ASSETS / "Scripts/AvatarLocomotionDriver.cs")
    voice = read_text(ASSETS / "Scripts/WorldSpatialVoiceClient.cs")
    if "TriggerWave" not in avatar or "TriggerCheer" not in avatar:
        fail("Avatar wave/cheer gesture actions are missing.")

    if "avatarLodGroup.GetLODs().Length < 3" not in builder:
        fail("Imported humanoid prefab is missing its three-level mesh LOD release gate.")

    crowd_lod = read_text(ASSETS / "Scripts/AvatarCrowdLod.cs")
    if "meshLodGroup.GetLODs().Length < 3" not in crowd_lod:
        fail("Human and AI crowd runtime is missing its three-level mesh LOD check.")
    for required in ("animator.enabled = visible", "AnimatorCullingMode.AlwaysAnimate",
                     "AnimatorCullingMode.CullUpdateTransforms", "locomotion.enabled = animate",
                     "expressions.enabled = facial"):
        if required not in crowd_lod:
            fail("Mobile avatar crowd LOD is missing required tier behavior: " + required)
    if "wrapper.AddComponent<AvatarCrowdLod>()" not in builder:
        fail("Generated avatar prefab is missing the shared human/AI crowd LOD controller.")

    delivery = read_text(ASSETS / "Scripts/WorldContentDelivery.cs")
    if "parts.Length >= 4" not in delivery or 'parts[0], "world"' not in delivery or 'parts[1], "city"' not in delivery:
        fail("Addressables district-scene resolver does not recognise city-specific district labels.")
    if "parts.Length >= 4" not in delivery or "world-city-district-" not in delivery:
        fail("Addressables district-scene resolver must preserve legacy scene labels and distinguish root labels.")

    hud = read_text(ASSETS / "Scripts/WorldStatusHud.cs")
    if "GUI.Button" not in hud or "Position:" not in hud or '"JUMP"' not in hud or '"RUN"' not in hud or '"WAVE"' not in hud or '"CHEER"' not in hud:
        fail("World status HUD, mobile jump control, or sprint control is missing.")

    interior = read_text(ASSETS / "Scripts/WorldHomeInteriorBuilder.cs")
    if "Object.Destroy(collider)" in interior:
        fail("Generated home geometry must retain physical colliders.")
    for required in ('"Timber Floor"', '"Back Wall"', '"Left Wall"', '"Right Wall"',
                     '"Front Wall Left"', '"Front Wall Right"', '"Ceiling"',
                     "GameObject.CreatePrimitive(PrimitiveType.Cube)"):
        if required not in interior:
            fail("Generated home interior is missing collision geometry: " + required)

    gateway_server = read_text(Path("runtime/world-gateway/src/server.ts"))
    for required in ("Math.max(-5.45, Math.min(5.45, localX))",
                     "Math.max(-4.45, Math.min(4.45, localZ))",
                     "Residential interiors are a server-owned 12 x 10 metre room."):
        if required not in gateway_server:
            fail("Server-authoritative home collision bounds are missing: " + required)

    scene_builder = read_text(ASSETS / "Editor/FreeAssetWorldSceneBuilder.cs")
    for prefab_name in ("UCENO_Home_Sofa_01", "UCENO_Home_Arm_Chair_01",
                        "UCENO_Home_Round_Table_01", "UCENO_Home_Gothic_Bed_01",
                        "UCENO_Home_Gothic_Cabinet_01"):
        marker = '"' + prefab_name + '", true)'
        # Each named furniture prefab must be generated with a physical collider.
        if marker not in scene_builder:
            fail("Home furniture prefab is missing collider generation: " + prefab_name)
    collider_builder = scene_builder[scene_builder.index("private static void AddEnvironmentCollider"):
                                     scene_builder.index("private static Bounds CalculateLocalBounds")]
    if "BoxCollider box = wrapper.AddComponent<BoxCollider>()" not in collider_builder or "box.size = Vector3.Max" not in collider_builder:
        fail("Imported home furniture is missing bounded box-collider generation.")

    interactor = read_text(ASSETS / "Scripts/WorldObjectInteractor.cs")
    for required in ("Physics.Raycast", "GetComponentInParent<WorldInteractable>()",
                     "gateway.RequestInteraction", "KeyCode.E", "GUI.Button"):
        if required not in interactor:
            fail("World object interaction input/target dispatch is missing: " + required)

    authoring = read_text(ASSETS / "Editor/WorldInteractableAuthoring.cs")
    if "GlobalObjectId.GetGlobalObjectIdSlow" not in authoring or "SHA256" not in authoring or '"uceno:"' not in authoring:
        fail("Interactable authoring must assign stable, hashed GlobalObjectId values.")
    marker = read_text(ASSETS / "Scripts/WorldInteractable.cs")
    if "gameObject.name.ToLowerInvariant()" in marker or "HasDoorPivot" not in marker:
        fail("Interactable IDs must not be derived from display names, and door pivots must be inspectable.")
    for required in ("ApplyStateVisuals", "stateAnimator", "activeStateVisuals",
                     "inactiveStateVisuals", "stateBoolParameter"):
        if required not in marker:
            fail("Authoritative furniture/object state is not connected to Unity visuals: " + required)
    scene_builder = read_text(ASSETS / "Editor/FreeAssetWorldSceneBuilder.cs")
    for required in ("Build Realistic Starter City Scene", "BuildConfiguredInteractionObjects",
                     "WorldInteractableRegistryExporter.Export(false)"):
        if required not in scene_builder:
            fail("Real city scene generation is not connected to the registered interaction flow: " + required)
    registry_exporter = read_text(ASSETS / "Editor/WorldInteractableRegistryExporter.cs")
    for required in ("Export Scene Interactables to Gateway Registry",
                     "world-interactables-manifest.json", 'world-interactables-" + activeCity.id + ".json',
                     "GetComponentsInChildren<Collider>", "marker.HasDoorPivot",
                     "No scene interactables were found"):
        if required not in registry_exporter:
            fail("Scene-to-gateway object registry export is missing: " + required)
    gateway_server = read_text(Path("runtime/world-gateway/src/server.ts"))
    if ("WORLD_INTERACTABLES_MANIFEST_FILE" not in gateway_server or
            "parseCityInteractableManifest" not in gateway_server or
            "WORLD_INTERACTABLES_FILE" not in gateway_server or
            "ensureObjectStatesLoaded(identity.worldId)" not in gateway_server):
        fail("Gateway is not loading the per-city scene interactable manifest and durable object states.")
    gateway_client = read_text(ASSETS / "Scripts/WorldGatewayClient.cs")
    if gateway_client.count("private async Task SendVoiceControlAsync(string type)") != 1:
        fail("WorldGatewayClient must declare exactly one voice-control sender; duplicate declarations break C# compilation.")
    for required in ('packet.type == "object_state"', "item.ApplyServerState", "RequestInteraction"):
        if required not in gateway_client:
            fail("Unity is missing authoritative object-state application/interaction transport: " + required)
    if "player.AddComponent<WorldObjectInteractor>()" not in scene_builder:
        fail("Generated player does not include the world object interaction controller.")
    presence_runtime = read_text(ASSETS / "Scripts/WorldPresenceClient.cs")
    for required in ("gameObject.AddComponent<WorldGatewayClient>()",
                     "gateway.Configure(session, localPlayer, remoteAvatarPrefab)"):
        if required not in presence_runtime:
            fail("World object interactions are not connected to the authenticated gateway: " + required)

    home_client = read_text(ASSETS / "Scripts/WorldHomeClient.cs")
    for required in ("RequestHomes", "CreateHomeRoutine", "LoadHomeRoutine",
                     "SaveHomeRoutine", "PlaceFurniture", "MoveSelectedFurniture", "WithinHomeBounds", "RotateSelectedFurniture", "RemoveSelectedFurniture", "CanEditSelectedHome",
                     "/api/world-homes?worldId=", "SAVE HOME LAYOUT"):
        if required not in home_client:
            fail("WorldHomeClient is missing home management integration: " + required)
    if "WorldHomeClient homeClient = player.AddComponent<WorldHomeClient>()" not in builder:
        fail("Generated player does not include the world home management client.")
    for asset_id in ("sofa_01", "arm_chair_01", "round_wooden_table_01", "gothic_bed_01", "gothic_cabinet_01"):
        if asset_id not in builder:
            fail("Generated home furniture catalogue is missing " + asset_id)

    events_client = read_text(ASSETS / "Scripts/WorldEventsClient.cs")
    for required in ("LoadEventsRoutine", "CreateEventRoutine", "SetAttendanceRoutine",
                     "/api/world-events?worldId=", "/api/world-events", "/attendance",
                     "canHost", "EVENTS", "INTERESTED"):
        if required not in events_client:
            fail("WorldEventsClient is missing event discovery/RSVP behavior: " + required)
    if "WorldEventsClient eventsClient = player.AddComponent<WorldEventsClient>()" not in builder:
        fail("Generated player does not include the world events client.")

    session = read_text(ASSETS / "Scripts/WorldSessionClient.cs")
    if session.count("public string ApiBaseUrl") != 1:
        fail("WorldSessionClient must expose exactly one ApiBaseUrl property.")
    if "SetRenewedSession" not in session or "AccessToken = token" not in session:
        fail("WorldSessionClient is missing the in-memory renewed-token setter.")

    presence = read_text(ASSETS / "Scripts/WorldPresenceClient.cs")
    if "Time.time >= tokenExpiresAt - 45f" not in presence:
        fail("WorldPresenceClient is missing early world-token renewal.")
    if "session.SetRenewedSession(response.accessToken, response.expiresInSeconds)" not in presence:
        fail("WorldPresenceClient does not install the renewed bearer token.")
    if "float.PositiveInfinity" in presence:
        fail("WorldPresenceClient contains a disabled token-renewal guard.")
    if "public int PeerCount" not in presence or "ConnectionStatus" not in presence:
        fail("WorldPresenceClient is missing multiplayer connection status.")
    if "maxVisiblePeerDistance = 110f" not in presence or "maxRemoteAvatars = 12" not in presence:
        fail("WorldPresenceClient is missing mobile remote-avatar visibility limits.")
    gateway_client = read_text(ASSETS / "Scripts/WorldGatewayClient.cs")
    if "remote.locomotion.ApplyRemoteState" not in gateway_client:
        fail("WorldGatewayClient is missing authoritative remote humanoid locomotion updates.")
    if "remote.lastSamplePosition" not in gateway_client or "remote.lastSampleTime" not in gateway_client:
        fail("WorldGatewayClient is missing movement-sample speed estimation.")
    for required in (
        "if (socket != connectionSocket) return;",
        "if (socket != target) return;",
        "socket.OnMessage += bytes =>",
    ):
        if required not in gateway_client:
            fail("WorldGatewayClient is missing stale-connection callback fencing: " + required)
    if "presence.PeerCount" not in hud or "presence.ConnectionStatus" not in hud:
        fail("World status HUD does not display multiplayer connection status.")

    if "RequestJump" not in motor or "KeyCode.Space" not in motor or "jumpHeight" not in motor:
        fail("Player jump action is missing keyboard/mobile input or grounded jump physics.")
    if "ToggleSeated" not in motor or "IsSeated" not in motor or "KeyCode.C" not in motor:
        fail("Player seated/rest state or desktop toggle is missing.")
    if "motor != null ? motor.IsSeated" not in avatar or "IsSeatedHash" not in avatar or "SetBool(IsSeatedHash, seated)" not in avatar:
        fail("Imported Humanoid seated/rest animation state is missing.")
    if ("WorldSpatialVoiceClient.LocalTransmitChanged += SetTalking" not in avatar or
            "WorldSpatialVoiceClient.LocalTransmitChanged -= SetTalking" not in avatar or
            "IsTalkingHash" not in avatar or
            "peer.microphone.SetMute(!shouldTransmit)" not in voice or
            "LocalTransmitChanged?.Invoke(shouldTransmit)" not in voice):
        fail("Humanoid talking animation is not connected to the actual microphone transmit state.")
    if "Mathf.Sin(cycle)" in avatar or "ApplyProcedural" in avatar:
        fail("Procedural humanoid gait fallback is not allowed.")
    if '"SIT"' not in hud or '"STAND"' not in hud or "GetSeatControlRect" not in hud:
        fail("Mobile sit/stand control is missing.")

    city_prefabs, city_hdris, city_bytes = check_city_asset_inventory()
    manifests, listed_files = check_manifests()
    total_required = sum(path.stat().st_size for path in REQUIRED_FILES + REQUIRED_TEXTURES)
    print("UCENO Unity source asset validation passed.")
    print(f"- Required source files: {len(REQUIRED_FILES) + len(REQUIRED_TEXTURES)}")
    print(f"- CC0 asset manifests: {manifests}")
    print(f"- Manifest-listed files checked: {listed_files}")
    print(f"- City-specific imported prefabs verified: {city_prefabs}/108")
    print(f"- City-specific HDRIs with matching SHA-256: {city_hdris}/9")
    print(f"- City-specific asset bytes: {city_bytes}")
    print(f"- Required source file bytes: {total_required}")
    print("- Procedural avatar/environment placeholders: absent")
    print("- Unity compilation, rendering and Android runtime: NOT tested by this check")


if __name__ == "__main__":
    main()
