import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const manifest = JSON.parse(read("unity/UCENOVirtualWorld/Packages/manifest.json"));
const delivery = read("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldContentDelivery.cs");
const sceneBuilder = read("unity/UCENOVirtualWorld/Assets/UCENO/Editor/FreeAssetWorldSceneBuilder.cs");
const cityScenePipeline = read("unity/UCENOVirtualWorld/Assets/UCENO/Editor/WorldCityScenePipeline.cs");
const buildCommand = read("unity/UCENOVirtualWorld/Assets/UCENO/Editor/BuildCommand.cs");
const cityMobileImporter = read("unity/UCENOVirtualWorld/Assets/UCENO/Editor/WorldCityMobileAssetPostprocessor.cs");
const avatarCrowdLod = read("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/AvatarCrowdLod.cs");
const cityRegistryExporter = read("unity/UCENOVirtualWorld/Assets/UCENO/Editor/WorldInteractableRegistryExporter.cs");
const cityCollisionExporter = read("unity/UCENOVirtualWorld/Assets/UCENO/Editor/WorldCollisionGeometryExporter.cs");
const cityAssetProfiles = JSON.parse(read("unity/UCENOVirtualWorld/Assets/UCENO/Editor/city-scene-asset-profiles.json"));
const areaBinding = read("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldAreaContentBinding.cs");
const gateway = read("unity/UCENOVirtualWorld/Assets/UCENO/Scripts/WorldGatewayClient.cs");
const gatewayServer = read("runtime/world-gateway/src/server.ts");
const districtPolicy = read("runtime/world-gateway/src/district-policy.ts");
const districtConfig = JSON.parse(read("runtime/world-gateway/config/world-districts.json"));
const districtTests = read("runtime/world-gateway/tests/district-policy.test.mjs");
const cityCatalog = JSON.parse(read("runtime/world-gateway/config/world-cities.json"));
const cityPolicy = read("runtime/world-gateway/src/city-catalog-policy.ts");
const cityTests = read("runtime/world-gateway/tests/city-catalog-policy.test.mjs");
const architecture = read("docs/virtual-world/REMOTE_CONTENT_DELIVERY.md");
const tests = read("docs/virtual-world/REMOTE_CONTENT_DELIVERY_TESTS.md");

const checks = [
  ["Ten distinct city catalogue entries are defined (not counted from districts)", Array.isArray(cityCatalog.cities) && cityCatalog.cities.length >= 10 && new Set(cityCatalog.cities.map(city => city.id)).size === cityCatalog.cities.length],
  ["Each city has its own root and four distinct district content labels", cityCatalog.cities?.every(city => city.contentLabel === "world-city-" + city.id && city.districts?.length >= 4 && new Set(city.districts.map(district => district.contentLabel)).size === city.districts.length && city.landmarks?.length >= 3)],
  ["City catalogue policy enforces minimum count and city-specific labels", cityPolicy.includes("minimumCities") && cityPolicy.includes("world-city-${id}")],
  ["Every city has a unique climate, biome, terrain and urban layout pattern", new Set(cityCatalog.cities.map(city => city.climate)).size === 10 && new Set(cityCatalog.cities.map(city => city.environment?.biome)).size === 10 && new Set(cityCatalog.cities.map(city => city.environment?.terrain)).size === 10 && new Set(cityCatalog.cities.map(city => city.layout?.pattern)).size === 10],
  ["Each city has three or more named landmark content labels", cityCatalog.cities.every(city => city.landmarks.length >= 3 && city.landmarks.every(landmark => landmark.contentLabel.startsWith("world-city-" + city.id + "-landmark-") && landmark.districtId))],
  ["Every city landmark is assigned to exactly one district", cityCatalog.cities.every(city => city.landmarks.every(landmark => city.districts.filter(d => d.id === landmark.districtId && landmark.position.x >= d.center.x - d.radius && landmark.position.x < d.center.x + d.radius && landmark.position.z >= d.center.z - d.radius && landmark.position.z < d.center.z + d.radius).length === 1))],
  ["Nine non-Meridian cities have independent imported asset profiles", cityAssetProfiles.cities.length === 9 && new Set(cityAssetProfiles.cities.map(profile => profile.cityId)).size === 9 && !cityAssetProfiles.cities.some(profile => profile.cityId === "meridian")],
  ["Each remaining city requires distinct architecture, environment and landmark prefabs", cityAssetProfiles.cities.every(profile => profile.architecturePrefabs.length >= 5 && profile.environmentPrefabs.length >= 4 && profile.landmarks.length === 3 && profile.skyboxTexture && new Set([...profile.architecturePrefabs, ...profile.environmentPrefabs, ...profile.landmarks.map(item => item.prefab), profile.skyboxTexture]).size === 13)],
  ["Nine-city Unity pipeline validates city-specific assets before scene generation", /ValidateRemainingCityPacks/.test(cityScenePipeline) && /BuildRemainingCities/.test(cityScenePipeline) && /checkAssets: true/.test(cityScenePipeline) && /city-specific imported asset errors/.test(cityScenePipeline)],
  ["Nine-city scene pipeline generates separate district scenes and remote Addressables labels", /BuildCity\(/.test(cityScenePipeline) && /district.contentLabel/.test(cityScenePipeline) && /RegisterAddressableScene/.test(cityScenePipeline) && /PackSeparately/.test(cityScenePipeline)],
  ["City asset validation rejects shared imported mesh geometry across cities", /geometryOwners/.test(cityScenePipeline) && /GetAssetDependencyHash/.test(cityScenePipeline) && /mesh geometry is shared with/.test(cityScenePipeline)],
  ["Human and AI avatars require three authored mesh LOD levels", /avatarLodGroup.GetLODs\(\).Length < 3/.test(sceneBuilder) && /meshLodGroup.GetLODs\(\).Length < 3/.test(avatarCrowdLod) && /lodGroup.GetLODs\(\).Length < 3/.test(cityScenePipeline)],
  ["City landmark prefabs must be interactable and have targeting colliders", /WorldInteractable/.test(cityScenePipeline) && /non-trigger targeting collider/.test(cityScenePipeline)],
  ["Generated city manifests and isolated registry exports are verified", /city-scene-manifest/.test(cityScenePipeline) && /WorldInteractableRegistryExporter/.test(cityScenePipeline) && /VerifyNineCitySceneRegistries/.test(cityScenePipeline)],
  ["Every city exports a dedicated collision map and verifies collider/interactable parity", /WorldCollisionGeometryExporter\.Export\(city.id/.test(cityScenePipeline) && /uceno-city-collision-boxes-/.test(cityCollisionExporter) && /collision map interactables do not match/.test(cityScenePipeline)],
  ["City registry exporter writes district names and content labels", /contentLabel = district.contentLabel/.test(cityRegistryExporter) && /name = district.name/.test(cityRegistryExporter)],
  ["City prefabs require Android LOD groups", /LODGroup/.test(cityScenePipeline) && /GetLODs/.test(cityScenePipeline)],
  ["City asset importer applies Android ETC2 textures and compressed meshes", /ETC2_RGBA8/.test(cityMobileImporter) && /ETC2_RGB4/.test(cityMobileImporter) && /ModelImporterMeshCompression.Medium/.test(cityMobileImporter)],
  ["Every city requires and applies a distinct HDRI skybox and atmospheric lighting", /skyboxTexture/.test(cityScenePipeline) && /CreateCitySkybox/.test(cityScenePipeline) && /ConfigureCityEnvironment/.test(cityScenePipeline) && /Skybox\/Panoramic/.test(cityScenePipeline)],
  ["Districts contain role, centre, radius and city-specific layout metadata", cityCatalog.cities.every(city => city.districts.every(district => district.role && district.center && Number.isFinite(district.radius) && district.layout === city.layout.pattern))],
  ["City catalogue tests cover duplicate IDs, bounds and incomplete districts", cityTests.includes("rejects fewer than ten cities") && cityTests.includes("invalid spawn bounds") && cityTests.includes("fewer than four districts")],

  ["Addressables package is declared", manifest.dependencies?.["com.unity.addressables"] === "2.7.6"],
  ["Addressables catalog refreshes versioned remote content", /CheckForCatalogUpdates\(false\)/.test(delivery) && /UpdateCatalogs\(catalogCheck.Result, false\)/.test(delivery)],
  ["On-demand dependency size is checked", /GetDownloadSizeAsync\(label\)/.test(delivery)],
  ["Dependencies download asynchronously", /DownloadDependenciesAsync\(label, false\)/.test(delivery)],
  ["Remote Addressables catalogs are checked and updated before city labels resolve", /CheckForCatalogUpdates\(false\)/.test(delivery) && /UpdateCatalogs\(catalogCheck.Result, false\)/.test(delivery)],
  ["Download progress is exposed", /ProgressChanged\?\.Invoke\(label, download\.PercentComplete\)/.test(delivery)],
  ["Failures are retried", /attempt < maxAttempts/.test(delivery) && /WaitForSecondsRealtime/.test(delivery)],
  ["Successful labels are cached in session", /readyLabels\.Add\(label\)/.test(delivery)],
  ["Developer preload list exists", /preloadLabels/.test(delivery) && /PreloadConfiguredContent/.test(delivery)],
  ["Remote catalog is configurable", /remoteCatalogUrl/.test(delivery)],
  ["Labeled assets are loaded into memory through Addressables", /LoadAssetsAsync<UnityEngine.Object>/.test(delivery)],
  ["Resident content uses reference-counted leases", /residencyReferences/.test(delivery) && /AcquireContent\(/.test(delivery)],
  ["Resident labels are released at zero references", /ReleaseContent\(/.test(delivery) && /Addressables.Release\(handle\)/.test(delivery)],
  ["Concurrent resident labels are capped", /maxConcurrentResidentLabels/.test(delivery)],
  ["District labels load additive Addressables scenes", /IsDistrictSceneLabel/.test(delivery) && /LoadSceneAsync\(label, LoadSceneMode.Additive/.test(delivery)],
  ["District scene handles unload after final lease release", /UnloadSceneAsync\(handle, false\)/.test(delivery) && /residentSceneHandles/.test(delivery)],
  ["Android pre-export requires all nine city packs, generated scenes, registry verification and remote catalog build", /ValidateRemainingCityPacks\(\)/.test(buildCommand) && /BuildRemainingCities\(\)/.test(buildCommand) && /VerifyNineCitySceneRegistries\(\)/.test(buildCommand) && /BuildRemoteAddressablesContent\(\)/.test(buildCommand)],
  ["Nine-city editor release gate verifies generated scenes, Addressables labels, district registries and collision maps", /VerifyNineCitySceneRegistries/.test(cityScenePipeline) && /world-districts-/.test(cityScenePipeline) && /world-interactables-/.test(cityScenePipeline) && /uceno-city-collision-boxes-/.test(cityScenePipeline)],
  ["Shutdown waits for pending additive scene loads before unloading them", /handle\.Completed \+= operation/.test(delivery) && /if \(handle\.IsDone\)/.test(delivery)],
  ["Editor builder partitions city geometry into four additive scenes", /BuildDistrictScenes\(worldRoot\)/.test(sceneBuilder) && /districtDefinitions/.test(sceneBuilder) && /ResolveDistrictName\(child\.position, districtDefinitions\)/.test(sceneBuilder) && /CreateOrMoveEntry/.test(sceneBuilder)],
  ["District scenes are separately packed remote Addressables entries", /PackSeparately/.test(sceneBuilder) && /CreateOrMoveEntry/.test(sceneBuilder) && /kRemoteLoadPath/.test(sceneBuilder)],
  ["Collision geometry is exported before district partitioning", /WorldCollisionGeometryExporter\.Export\(scene\)[\s\S]*?BuildDistrictScenes\(worldRoot\)/.test(sceneBuilder)],
  ["District transitions retain the new area and release the previous area", /activeDistrictLabel/.test(gateway) && /ReleaseContent\(activeDistrictLabel\)/.test(gateway)],
  ["District acknowledgement retries reuse the existing scene lease", /pendingDistrictResidentLabel == label/.test(gateway) && /SendDistrictContentReadyAsync\(expectedDistrict, expectedNonce\)/.test(gateway)],
  ["Home and event interiors release their content after exit", /ReleaseContent\(activeLabel\)/.test(areaBinding) && /HandleLocationExited/.test(areaBinding)],
  ["World-area binding auto-installs beside the gateway", /RuntimeInitializeOnLoadMethod/.test(areaBinding) && /WorldGatewayClient/.test(areaBinding)],
  ["Home transitions request interior content", /case "home": return "home-interiors"/.test(areaBinding)],
  ["Event transitions request venue content", /case "event": return "world-event-venues"/.test(areaBinding)],
  ["Area content binding reports progress and failures", /ProgressChanged/.test(areaBinding) && /ContentFailed/.test(areaBinding)],
  ["Home and event travel preload before sending admission", /PreloadBeforeSpatialTransition/.test(gateway) && /EnsureContent\(label/.test(gateway)],
  ["Travel request is gated on successful content download", /if \(!succeeded\)[\s\S]*?Travel cancelled/.test(gateway) && /SendSpatialContextAsync\(type, id\)/.test(gateway)],
  ["Failed preload does not send spatial admission", /Travel cancelled:[\s\S]*?spatialTransitionPending = false;[\s\S]*?yield break;/.test(gateway)],
  ["Transition feedback is visible", /spatialTransitionStatus/.test(gateway) && /private void OnGUI\(\)/.test(gateway)],
  ["Activity join preloads its content label", /PreloadBeforeActivityJoin/.test(gateway) && /EnsureContent\(label/.test(gateway)],
  ["Sports, racing, dance and adventure labels are mapped", /activity-sports/.test(gateway) && /activity-racing/.test(gateway) && /activity-dance/.test(gateway) && /activity-adventure/.test(gateway)],
  ["Server district boundaries are validated and non-overlapping", /parseWorldDistricts/.test(gatewayServer) && /overlap/.test(districtPolicy)],
  ["Server pauses movement pending district content acknowledgement without discarding direction input", /district_content_required/.test(gatewayServer) && /district_content_ready/.test(gatewayServer) && /Preserve the latest input intent/.test(gatewayServer)],
  ["District acknowledgement requires matching nonce and district", (/matchesDistrictTransition\(pending, msg\.districtId, msg\.nonce\)/.test(gatewayServer) || /msg\.districtId === pending\.id && msg\.nonce === pending\.nonce/.test(gatewayServer))],
  ["Leaving a configured district releases its active client content lease", /district_content_exited/.test(gatewayServer) && /district_content_exited/.test(gateway) && /ReleaseContent\(activeDistrictLabel\)/.test(gateway)],
  ["Client loads server-selected district labels before acknowledgement", /district_content_required/.test(gateway) && /AcquireContent\(label/.test(gateway) && /district_content_ready/.test(gateway)],
  ["Client can retry and clears cancelled district transitions", /RetryPendingDistrictContent/.test(gateway) && /district_content_cancelled/.test(gateway)],
  ["District policy tests cover bounds and overlaps", /rejects overlapping district rectangles/.test(districtTests) && /rejects malformed JSON/.test(districtTests)],
  ["Canonical gateway district config has four matching Unity scene labels", districtConfig.districts?.length === 4 && ["civic-core", "exchange-quarter", "garden-ring", "old-port"].every(id => districtConfig.districts.some(d => d.id === id && d.contentLabel === "world-city-meridian-" + id))],
  ["Gateway tests exercise canonical district geometry fixture", /canonical gateway config matches the four generated Unity district scenes/.test(districtTests)],
  ["Architecture documents automatic loading and persistent cache", /automatically|on demand|preflight/i.test(architecture) && /persistent.*cache/i.test(architecture)],
  ["Acceptance tests cover interrupted downloads and district boundary gates", /Interrupt the connection mid-download/.test(tests) && /district boundary/.test(tests)]
];

let failed = false;
for (const [name, passed] of checks) {
  console.log((passed ? "PASS " : "FAIL ") + name);
  if (!passed) failed = true;
}
if (failed) process.exit(1);
