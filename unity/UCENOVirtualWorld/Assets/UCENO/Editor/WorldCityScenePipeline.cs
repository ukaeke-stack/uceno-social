#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEditor.AddressableAssets.Settings;
using UnityEditor.AddressableAssets.Settings.GroupSchemas;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace UCENO.VirtualWorld.Editor
{
    [Serializable] internal sealed class CityPipelineCatalog { public CityPipelineCity[] cities; }
    [Serializable] internal sealed class CityPipelineCity
    {
        public string id, name, identity, climate, architecture, contentLabel;
        public CityPipelinePoint spawn;
        public CityPipelineDistrict[] districts;
        public CityPipelineLayout layout;
        public CityPipelineEnvironment environment;
        public CityPipelineLandmark[] landmarks;
    }
    [Serializable] internal sealed class CityPipelineDistrict
    {
        public string id, name, role, layout, contentLabel;
        public CityPipelinePoint center;
        public float radius;
    }
    [Serializable] internal sealed class CityPipelineLandmark
    {
        public string id, name, kind, contentLabel, districtId;
        public CityPipelinePoint position;
    }
    [Serializable] internal sealed class CityPipelinePoint { public float x, z; }
    [Serializable] internal sealed class CityPipelineLayout
    {
        public string pattern, water;
        public float blockMeters;
        public string[] roadHierarchy;
    }
    [Serializable] internal sealed class CityPipelineEnvironment
    {
        public string biome, terrain;
        public string[] weather, vegetation;
    }
    [Serializable] internal sealed class CityPipelineProfiles { public CityPipelineAssetProfile[] cities; }
    [Serializable] internal sealed class CityPipelineAssetProfile
    {
        public string cityId, assetRoot;
        public string[] architecturePrefabs, environmentPrefabs;
        public CityPipelineLandmarkAsset[] landmarks;
    }
    [Serializable] internal sealed class CityPipelineLandmarkAsset
    {
        public string landmarkId, prefab;
    }

    [Serializable] internal sealed class CitySceneManifestDocument
    {
        public string cityId, cityName, architecture, biome;
        public CitySceneManifestDistrict[] districts;
    }
    [Serializable] internal sealed class CitySceneManifestDistrict
    {
        public string districtId, contentLabel, scenePath;
        public string[] landmarkIds;
    }
    [Serializable] internal sealed class CityDistrictRegistryDocument { public CityDistrictRegistryEntry[] districts; }
    [Serializable] internal sealed class CityDistrictRegistryEntry
    {
        public string id, name, contentLabel;
        public float minX, maxX, minZ, maxZ;
    }
    [Serializable] internal sealed class CityInteractableRegistryDocument { public CityInteractableRegistryEntry[] interactables; }
    [Serializable] internal sealed class CityInteractableRegistryEntry
    {
        public string id, kind;
        public float x, y, z, yaw;
    }

    /// <summary>
    /// Data-driven scene pipeline for the nine cities other than Meridian Prime.
    /// It refuses to substitute Meridian assets or primitive buildings for missing
    /// city-specific architecture. The generated scene geometry is a layout layer;
    /// final visual acceptance still requires imported prefab packs and review.
    /// </summary>
    public static class WorldCityScenePipeline
    {
        private const string CityCatalogRelative = "runtime/world-gateway/config/world-cities.json";
        private const string ProfilesRelative = "unity/UCENOVirtualWorld/Assets/UCENO/Editor/city-scene-asset-profiles.json";
        private const string AddressableGroupName = "UCENO Remote District Scenes";

        [MenuItem("UCENO/World/Validate Remaining Nine City Asset Packs", false, 31)]
        public static void ValidateRemainingCityPacks()
        {
            CityPipelineCity[] cities = LoadRemainingCities();
            CityPipelineProfiles profiles = LoadProfiles();
            var errors = new List<string>();
            var profileIds = new HashSet<string>(StringComparer.Ordinal);
            var assetOwners = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (CityPipelineAssetProfile profile in profiles.cities ?? Array.Empty<CityPipelineAssetProfile>())
            {
                if (profile == null || string.IsNullOrWhiteSpace(profile.cityId) || !profileIds.Add(profile.cityId))
                {
                    errors.Add("Missing or duplicate city asset profile.");
                    continue;
                }
                CityPipelineCity city = cities.FirstOrDefault(item => item.id == profile.cityId);
                if (city == null) { errors.Add("Profile references unknown city: " + profile.cityId); continue; }
                ValidateProfile(city, profile, errors, assetOwners, checkAssets: true);
            }
            foreach (CityPipelineCity city in cities)
                if (!profileIds.Contains(city.id)) errors.Add("Missing city-specific asset profile: " + city.id);

            if (errors.Count > 0)
                throw new BuildFailedException("Nine-city scene pipeline is blocked. Missing or invalid city assets:\n- " +
                    string.Join("\n- ", errors));
            Debug.Log("UCENO: all nine city-specific asset packs passed path, uniqueness and landmark coverage checks.");
        }

        [MenuItem("UCENO/World/Build Remaining Nine City Scenes", false, 32)]
        public static void BuildRemainingCities()
        {
            ValidateRemainingCityPacks();
            CityPipelineCity[] cities = LoadRemainingCities();
            CityPipelineProfiles profiles = LoadProfiles();
            var errors = new List<string>();
            var profileById = (profiles.cities ?? Array.Empty<CityPipelineAssetProfile>())
                .Where(item => item != null).ToDictionary(item => item.cityId, StringComparer.Ordinal);
            var assetOwners = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (CityPipelineCity city in cities)
            {
                if (!profileById.TryGetValue(city.id, out CityPipelineAssetProfile profile))
                    errors.Add(city.id + ": missing asset profile");
                else ValidateProfile(city, profile, errors, assetOwners, checkAssets: true);
            }
            if (errors.Count > 0)
                throw new BuildFailedException("No city scenes were generated. Resolve all city-specific imported asset errors first:\n- " +
                    string.Join("\n- ", errors));

            AddressableAssetSettings settings = AddressableAssetSettingsDefaultObject.GetSettings(true);
            if (settings == null)
                throw new BuildFailedException("Addressables settings are unavailable. Configure the remote build/load paths first.");
            AddressableAssetGroup group = settings.FindGroup(AddressableGroupName);
            if (group == null)
                group = settings.CreateGroup(AddressableGroupName, false, false, true, null,
                    typeof(BundledAssetGroupSchema), typeof(ContentUpdateGroupSchema));
            ConfigureRemoteGroup(settings, group);

            foreach (CityPipelineCity city in cities)
                BuildCity(city, profileById[city.id], settings, group);

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log("UCENO generated nine distinct city scene sets. This is a scene-generation result, not final visual acceptance.");
        }

        [MenuItem("UCENO/World/Verify Nine City Scene Registries", false, 33)]
        public static void VerifyNineCitySceneRegistries()
        {
            CityPipelineCity[] cities = LoadRemainingCities();
            AddressableAssetSettings settings = AddressableAssetSettingsDefaultObject.GetSettings(false);
            if (settings == null) throw new BuildFailedException("Addressables settings are missing.");
            string config = Path.Combine(RepositoryRoot(), "runtime", "world-gateway", "config");
            var failures = new List<string>();
            foreach (CityPipelineCity city in cities)
            {
                string folder = "Assets/UCENO/Scenes/Cities/" + city.id;
                string manifestPath = folder + "/city-scene-manifest.json";
                if (!File.Exists(manifestPath))
                {
                    failures.Add(city.id + ": generated city scene manifest is missing.");
                    continue;
                }
                CitySceneManifestDocument manifest =
                    JsonUtility.FromJson<CitySceneManifestDocument>(File.ReadAllText(manifestPath));
                if (manifest == null || manifest.cityId != city.id || manifest.districts == null ||
                    manifest.districts.Length != city.districts.Length)
                {
                    failures.Add(city.id + ": scene manifest identity or district count is invalid.");
                    continue;
                }
                var seenLandmarks = new HashSet<string>(StringComparer.Ordinal);
                foreach (CityPipelineDistrict district in city.districts)
                {
                    CitySceneManifestDistrict entry = manifest.districts.FirstOrDefault(item =>
                        item != null && item.districtId == district.id);
                    if (entry == null || entry.contentLabel != district.contentLabel ||
                        !File.Exists(Path.Combine(RepositoryRoot(), entry.scenePath)))
                    {
                        failures.Add(city.id + ": missing scene or wrong content label for district " + district.id);
                        continue;
                    }
                    string guid = AssetDatabase.AssetPathToGUID(entry.scenePath);
                    AddressableAssetEntry addressable = string.IsNullOrEmpty(guid) ? null : settings.FindAssetEntry(guid);
                    if (addressable == null || !addressable.labels.Contains(district.contentLabel))
                        failures.Add(city.id + ": Addressables entry/label is missing for " + district.id);
                    foreach (string landmarkId in entry.landmarkIds ?? Array.Empty<string>())
                        if (!seenLandmarks.Add(landmarkId))
                            failures.Add(city.id + ": landmark appears in multiple district scenes: " + landmarkId);
                }
                if (seenLandmarks.Count != city.landmarks.Length ||
                    city.landmarks.Any(landmark => !seenLandmarks.Contains(landmark.id)))
                    failures.Add(city.id + ": generated scenes do not contain every landmark exactly once.");

                string districtRegistryPath = Path.Combine(config, "world-districts-" + city.id + ".json");
                string interactableRegistryPath = Path.Combine(config, "world-interactables-" + city.id + ".json");
                if (!File.Exists(districtRegistryPath) || !File.Exists(interactableRegistryPath))
                {
                    failures.Add(city.id + ": exported district/interactable registry files are missing.");
                    continue;
                }
                CityDistrictRegistryDocument districtRegistry =
                    JsonUtility.FromJson<CityDistrictRegistryDocument>(File.ReadAllText(districtRegistryPath));
                CityInteractableRegistryDocument interactableRegistry =
                    JsonUtility.FromJson<CityInteractableRegistryDocument>(File.ReadAllText(interactableRegistryPath));
                if (districtRegistry?.districts == null || districtRegistry.districts.Length != city.districts.Length)
                    failures.Add(city.id + ": exported district registry does not match the city catalogue.");
                else foreach (CityPipelineDistrict district in city.districts)
                {
                    CityDistrictRegistryEntry registered = districtRegistry.districts.FirstOrDefault(item =>
                        item.id == district.id && item.contentLabel == district.contentLabel);
                    if (registered == null || registered.minX != district.center.x - district.radius ||
                        registered.maxX != district.center.x + district.radius ||
                        registered.minZ != district.center.z - district.radius ||
                        registered.maxZ != district.center.z + district.radius)
                        failures.Add(city.id + ": exported district geometry differs for " + district.id);
                }
                if (interactableRegistry?.interactables == null || interactableRegistry.interactables.Length == 0)
                    failures.Add(city.id + ": exported interactable registry is empty.");
                else
                {
                    var ids = new HashSet<string>(StringComparer.Ordinal);
                    foreach (CityInteractableRegistryEntry item in interactableRegistry.interactables)
                    {
                        if (item == null || string.IsNullOrWhiteSpace(item.id) || !ids.Add(item.id))
                            failures.Add(city.id + ": exported interactable IDs are missing or duplicated.");
                        if (item == null || city.districts.Count(d =>
                            item.x >= d.center.x - d.radius && item.x < d.center.x + d.radius &&
                            item.z >= d.center.z - d.radius && item.z < d.center.z + d.radius) != 1)
                            failures.Add(city.id + ": exported interactable is not inside exactly one district.");
                    }
                }
            }
            if (failures.Count > 0)
                throw new BuildFailedException("Nine-city scene/Addressables/registry verification failed:\n- " +
                    string.Join("\n- ", failures));
            Debug.Log("UCENO verified nine city scene manifests, Addressables labels, district bounds and interactable registries.");
        }

        private static CityPipelineCity[] LoadRemainingCities()
        {
            string path = Path.Combine(RepositoryRoot(), CityCatalogRelative);
            if (!File.Exists(path)) throw new BuildFailedException("Missing city catalogue: " + path);
            CityPipelineCatalog document = JsonUtility.FromJson<CityPipelineCatalog>(File.ReadAllText(path));
            if (document?.cities == null || document.cities.Length < 10)
                throw new BuildFailedException("City catalogue must contain ten cities before scene generation.");
            var ids = new HashSet<string>(StringComparer.Ordinal);
            foreach (CityPipelineCity city in document.cities)
            {
                if (city == null || string.IsNullOrWhiteSpace(city.id) || !ids.Add(city.id) ||
                    city.districts == null || city.districts.Length < 4 ||
                    city.landmarks == null || city.landmarks.Length < 3 ||
                    city.layout == null || city.environment == null ||
                    city.districts.Any(d => d == null || d.center == null || d.radius < 40f ||
                        d.contentLabel != "world-city-" + city.id + "-" + d.id) ||
                    city.districts.Select(d => d.id).Distinct(StringComparer.Ordinal).Count() != city.districts.Length ||
                    city.landmarks.Any(l => l == null || l.position == null ||
                        l.contentLabel != "world-city-" + city.id + "-landmark-" + l.id) ||
                    city.landmarks.Select(l => l.id).Distinct(StringComparer.Ordinal).Count() != city.landmarks.Length)
                    throw new BuildFailedException("City catalogue contains incomplete or duplicate city data.");
                var districtIds = new HashSet<string>(city.districts.Select(item => item.id), StringComparer.Ordinal);
                foreach (CityPipelineLandmark landmark in city.landmarks)
                    if (landmark == null || string.IsNullOrWhiteSpace(landmark.districtId) ||
                        !districtIds.Contains(landmark.districtId))
                        throw new BuildFailedException(city.id + ": landmark has no valid districtId: " + landmark?.id);
            }
            return document.cities.Where(city => city.id != "meridian").ToArray();
        }

        private static CityPipelineProfiles LoadProfiles()
        {
            string path = Path.Combine(RepositoryRoot(), ProfilesRelative);
            if (!File.Exists(path)) throw new BuildFailedException("Missing city asset profiles: " + path);
            CityPipelineProfiles profiles = JsonUtility.FromJson<CityPipelineProfiles>(File.ReadAllText(path));
            if (profiles?.cities == null) throw new BuildFailedException("City asset profile document is empty.");
            return profiles;
        }

        private static void ValidateProfile(CityPipelineCity city, CityPipelineAssetProfile profile,
            List<string> errors, Dictionary<string, string> assetOwners, bool checkAssets)
        {
            if (profile.architecturePrefabs == null || profile.architecturePrefabs.Length < 3)
                errors.Add(city.id + ": requires at least three distinct architecture prefabs.");
            if (profile.environmentPrefabs == null || profile.environmentPrefabs.Length < 3)
                errors.Add(city.id + ": requires at least three environment prefabs.");
            if (profile.landmarks == null || profile.landmarks.Length != city.landmarks.Length)
                errors.Add(city.id + ": every authored landmark must have one dedicated imported prefab.");

            string expectedRoot = "Assets/UCENO/Cities/" + city.id + "/Prefabs";
            if (!string.Equals(profile.assetRoot, expectedRoot, StringComparison.Ordinal))
                errors.Add(city.id + ": assetRoot must be " + expectedRoot);
            var paths = (profile.architecturePrefabs ?? Array.Empty<string>())
                .Concat(profile.environmentPrefabs ?? Array.Empty<string>())
                .Concat((profile.landmarks ?? Array.Empty<CityPipelineLandmarkAsset>())
                    .Where(item => item != null).Select(item => item.prefab)).ToArray();
            if (paths.Any(string.IsNullOrWhiteSpace) || paths.Distinct(StringComparer.OrdinalIgnoreCase).Count() != paths.Length)
                errors.Add(city.id + ": asset paths must be non-empty and unique within the city.");
            foreach (string assetPath in paths)
            {
                if (!string.IsNullOrEmpty(assetPath) && !assetPath.StartsWith(expectedRoot + "/", StringComparison.Ordinal))
                    errors.Add(city.id + ": prefab must live under its city-specific asset root: " + assetPath);
                if (assetOwners.TryGetValue(assetPath, out string owner) && owner != city.id)
                    errors.Add(city.id + ": asset is shared with " + owner + "; each city needs its own visual identity: " + assetPath);
                else assetOwners[assetPath] = city.id;
                GameObject prefab = checkAssets ? AssetDatabase.LoadAssetAtPath<GameObject>(assetPath) : null;
                if (checkAssets && prefab == null)
                    errors.Add(city.id + ": missing imported prefab " + assetPath);
                else if (checkAssets && prefab != null)
                {
                    LODGroup lodGroup = prefab.GetComponentInChildren<LODGroup>(true);
                    if (lodGroup == null || lodGroup.GetLODs().Length < 2 ||
                        lodGroup.GetLODs().Any(lod => lod.renderers == null || lod.renderers.Length == 0))
                        errors.Add(city.id + ": prefab requires a valid multi-level LODGroup for Android: " + assetPath);
                    if (!prefab.GetComponentsInChildren<Renderer>(true).Any(renderer => renderer != null))
                        errors.Add(city.id + ": prefab contains no renderable geometry: " + assetPath);
                }
            }

            var mappedLandmarks = new HashSet<string>(StringComparer.Ordinal);
            foreach (CityPipelineLandmarkAsset asset in profile.landmarks ?? Array.Empty<CityPipelineLandmarkAsset>())
                if (asset == null || string.IsNullOrWhiteSpace(asset.landmarkId) ||
                    !mappedLandmarks.Add(asset.landmarkId) ||
                    !city.landmarks.Any(item => item.id == asset.landmarkId))
                    errors.Add(city.id + ": invalid or duplicate landmark prefab mapping.");
            foreach (CityPipelineLandmark landmark in city.landmarks)
            {
                CityPipelineLandmarkAsset mapping = (profile.landmarks ?? Array.Empty<CityPipelineLandmarkAsset>())
                    .FirstOrDefault(item => item != null && item.landmarkId == landmark.id);
                if (mapping == null)
                {
                    errors.Add(city.id + ": missing imported landmark prefab for " + landmark.id);
                    continue;
                }
                if (checkAssets)
                {
                    GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(mapping.prefab);
                    if (prefab != null)
                    {
                        if (prefab.GetComponentInChildren<WorldInteractable>(true) == null)
                            errors.Add(city.id + ": landmark prefab must contain a WorldInteractable marker: " + landmark.id);
                        if (!prefab.GetComponentsInChildren<Collider>(true).Any(collider =>
                            collider != null && collider.enabled && !collider.isTrigger))
                            errors.Add(city.id + ": landmark prefab must contain a non-trigger targeting collider: " + landmark.id);
                    }
                }
            }
        }

        private static void BuildCity(CityPipelineCity city, CityPipelineAssetProfile profile,
            AddressableAssetSettings settings, AddressableAssetGroup group)
        {
            string cityFolder = "Assets/UCENO/Scenes/Cities/" + city.id;
            EnsureFolder("Assets/UCENO/Scenes/Cities");
            EnsureFolder(cityFolder);
            EnsureFolder(cityFolder + "/Districts");

            var architecture = profile.architecturePrefabs
                .Select(path => AssetDatabase.LoadAssetAtPath<GameObject>(path)).ToArray();
            var environment = profile.environmentPrefabs
                .Select(path => AssetDatabase.LoadAssetAtPath<GameObject>(path)).ToArray();
            var landmarkPrefabs = profile.landmarks.ToDictionary(
                item => item.landmarkId, item => AssetDatabase.LoadAssetAtPath<GameObject>(item.prefab),
                StringComparer.Ordinal);
            Material ground = CreateCityGroundMaterial(city);
            Material road = CreateCityRoadMaterial(city);

            var manifestDistricts = new List<CitySceneManifestDistrict>();
            var builtScenePaths = new List<string>();
            foreach (CityPipelineDistrict district in city.districts)
            {
                Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Additive);
                SceneManager.SetActiveScene(scene);
                GameObject root = new GameObject("UCENO " + city.name + " - " + district.name);
                SceneManager.MoveGameObjectToScene(root, scene);
                BuildDistrictGround(root.transform, district, ground, road, city.layout.pattern, city.layout.water, city.id);
                BuildArchitecture(root.transform, district, architecture, city.layout.pattern);
                BuildEnvironment(root.transform, district, environment, city.environment.biome);
                CityPipelineLandmark[] districtLandmarks = city.landmarks.Where(item => item.districtId == district.id).ToArray();
                foreach (CityPipelineLandmark landmark in districtLandmarks)
                    BuildLandmark(root.transform, landmark, landmarkPrefabs[landmark.id]);

                string scenePath = cityFolder + "/Districts/" + city.id + "_" + district.id + ".unity";
                EditorSceneManager.MarkSceneDirty(scene);
                if (!EditorSceneManager.SaveScene(scene, scenePath))
                    throw new BuildFailedException("Could not save city district scene: " + scenePath);
                RegisterAddressableScene(scenePath, district.contentLabel, settings, group);
                builtScenePaths.Add(scenePath);
                manifestDistricts.Add(new CitySceneManifestDistrict {
                    districtId = district.id,
                    contentLabel = district.contentLabel,
                    scenePath = scenePath,
                    landmarkIds = districtLandmarks.Select(item => item.id).ToArray()
                });
                EditorSceneManager.CloseScene(scene, true);
            }

            var openedScenes = new List<Scene>();
            try
            {
                foreach (string scenePath in builtScenePaths)
                    openedScenes.Add(EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Additive));
                WorldInteractableRegistryExporter.Export(false, city.id, builtScenePaths.ToArray());
            }
            finally
            {
                foreach (Scene scene in openedScenes)
                    if (scene.IsValid() && scene.isLoaded) EditorSceneManager.CloseScene(scene, true);
            }

            var manifest = new CitySceneManifestDocument {
                cityId = city.id, cityName = city.name, architecture = city.architecture,
                biome = city.environment.biome, districts = manifestDistricts.ToArray()
            };
            string manifestPath = cityFolder + "/city-scene-manifest.json";
            File.WriteAllText(manifestPath, JsonUtility.ToJson(manifest, true));
            AssetDatabase.ImportAsset(manifestPath, ImportAssetOptions.ForceUpdate);
            AssetDatabase.SaveAssets();
        }

        private static void BuildDistrictGround(Transform parent, CityPipelineDistrict district,
            Material ground, Material road, string layout, string waterDescription, string cityId)
        {
            GameObject terrain = GameObject.CreatePrimitive(PrimitiveType.Plane);
            terrain.name = "District Ground - " + district.name;
            terrain.transform.SetParent(parent, false);
            terrain.transform.position = new Vector3(district.center.x, 0f, district.center.z);
            terrain.transform.localScale = new Vector3(district.radius / 5f, 1f, district.radius / 5f);
            terrain.GetComponent<Renderer>().sharedMaterial = ground;
            GameObjectUtility.SetStaticEditorFlags(terrain, StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccludeeStatic);

            float width = Mathf.Clamp(district.radius * 0.10f, 10f, 22f);
            float span = district.radius * 1.65f;
            if (layout == "linear-waterfront")
            {
                CreateRoad(parent, "Coastal Esplanade", new Vector3(district.center.x, .04f, district.center.z),
                    new Vector3(width, .08f, span), road);
                CreateRoad(parent, "Terrace Promenade", new Vector3(district.center.x + 58f, .04f, district.center.z),
                    new Vector3(width * .55f, .08f, span), road);
                CreateRoad(parent, "Beach Access", new Vector3(district.center.x, .04f, district.center.z - 58f),
                    new Vector3(span, .08f, width * .55f), road);
            }
            else if (layout == "multi-level-green-corridors")
            {
                foreach (float offset in new[] { -65f, 0f, 65f })
                    CreateRoad(parent, "Garden Mobility Corridor", new Vector3(district.center.x + offset, .04f, district.center.z),
                        new Vector3(width * .55f, .08f, span), road);
                CreateRoad(parent, "Elevated Canopy Skyway", new Vector3(district.center.x, 4.5f, district.center.z),
                    new Vector3(span, .65f, width * .55f), road);
            }
            else if (layout == "river-island-campus")
            {
                CreateRoad(parent, "Island Bridge North", new Vector3(district.center.x, .04f, district.center.z + 48f),
                    new Vector3(span, .08f, width), road);
                CreateRoad(parent, "Island Bridge South", new Vector3(district.center.x, .04f, district.center.z - 48f),
                    new Vector3(span, .08f, width), road);
                CreateRoad(parent, "Campus Spine", new Vector3(district.center.x, .04f, district.center.z),
                    new Vector3(width, .08f, span), road);
            }
            else if (layout == "contour-terraces")
            {
                int tier = 0;
                foreach (float offset in new[] { -75f, -25f, 25f, 75f })
                {
                    float elevation = tier++ * 1.15f;
                    CreateRoad(parent, "Mountain Switchback " + tier,
                        new Vector3(district.center.x, .04f + elevation, district.center.z + offset),
                        new Vector3(span, .08f, width * .62f), road);
                }
            }
            else if (layout == "oasis-radial-courtyards" || layout == "garden-city-radial")
            {
                CreateRoad(parent, "Central Market Spine", new Vector3(district.center.x, .04f, district.center.z),
                    new Vector3(width, .08f, span), road);
                CreateRoad(parent, "Courtyard Cross Axis", new Vector3(district.center.x, .04f, district.center.z),
                    new Vector3(span, .08f, width), road);
                foreach (float offset in new[] { -75f, 75f })
                {
                    CreateRoad(parent, "Radial Garden Ring", new Vector3(district.center.x, .05f, district.center.z + offset),
                        new Vector3(span * .78f, .09f, width * .55f), road);
                    CreateRoad(parent, "Radial Courtyard Link", new Vector3(district.center.x + offset, .05f, district.center.z),
                        new Vector3(width * .55f, .09f, span * .78f), road);
                }
            }
            else if (layout == "elevated-grid-and-canals")
            {
                foreach (float offset in new[] { -70f, 0f, 70f })
                {
                    CreateRoad(parent, "Raised Harbour Street", new Vector3(district.center.x + offset, .08f, district.center.z),
                        new Vector3(width * .55f, .16f, span), road);
                    CreateRoad(parent, "Covered Market Street", new Vector3(district.center.x, .08f, district.center.z + offset),
                        new Vector3(span, .16f, width * .55f), road);
                }
            }
            else if (layout == "entertainment-superblocks")
            {
                foreach (float offset in new[] { -82f, 82f })
                {
                    CreateRoad(parent, "Superblock Perimeter", new Vector3(district.center.x, .04f, district.center.z + offset),
                        new Vector3(span, .08f, width * .6f), road);
                    CreateRoad(parent, "Festival Avenue", new Vector3(district.center.x + offset, .04f, district.center.z),
                        new Vector3(width * .6f, .08f, span), road);
                }
            }
            else if (layout == "rail-spoke-industrial")
            {
                CreateRoad(parent, "Regional Rail Spine", new Vector3(district.center.x, .04f, district.center.z),
                    new Vector3(width * 1.25f, .08f, span), road);
                foreach (float offset in new[] { -70f, 0f, 70f })
                    CreateRoad(parent, "Logistics Spoke", new Vector3(district.center.x + offset, .04f, district.center.z),
                        new Vector3(width * .5f, .08f, span * .72f), road);
            }
            else
            {
                CreateRoad(parent, "Primary Boulevard", new Vector3(district.center.x, .04f, district.center.z),
                    new Vector3(span, .08f, width), road);
                CreateRoad(parent, "Secondary Street", new Vector3(district.center.x, .045f, district.center.z),
                    new Vector3(width, .09f, span), road);
            }

            string waterKey = (waterDescription ?? string.Empty).ToLowerInvariant();
            if (new[] { "canal", "river", "bay", "marina", "wetland", "oasis", "stream", "water" }
                .Any(term => waterKey.Contains(term)))
            {
                Material water = CreateMaterial("UCENO_" + cityId + "_Water",
                    new Color(.08f, .34f, .48f, .82f), .82f);
                GameObject channel = GameObject.CreatePrimitive(PrimitiveType.Cube);
                channel.name = "Water Feature - " + waterDescription;
                channel.transform.SetParent(parent, false);
                channel.transform.position = new Vector3(district.center.x - district.radius * .36f, .025f,
                    district.center.z + district.radius * .34f);
                channel.transform.localScale = new Vector3(width * .72f, .05f, district.radius * 1.25f);
                channel.GetComponent<Renderer>().sharedMaterial = water;
            }
        }

        private static void BuildArchitecture(Transform parent, CityPipelineDistrict district,
            GameObject[] prefabs, string layout)
        {
            float[][] offsets = layout.Contains("linear")
                ? new[] { new[] { -65f, -55f }, new[] { 55f, 0f }, new[] { -65f, 55f }, new[] { 55f, 65f } }
                : layout.Contains("terrace") || layout.Contains("contour")
                    ? new[] { new[] { -65f, -55f }, new[] { -20f, 15f }, new[] { 45f, 65f }, new[] { 75f, -35f } }
                    : new[] { new[] { -65f, -55f }, new[] { 65f, -55f }, new[] { -65f, 65f }, new[] { 65f, 65f } };
            for (int i = 0; i < offsets.Length; i++)
            {
                GameObject instance = (GameObject)PrefabUtility.InstantiatePrefab(prefabs[i % prefabs.Length]);
                instance.name = "City Architecture " + (i + 1);
                instance.transform.SetParent(parent, true);
                instance.transform.position = new Vector3(district.center.x + offsets[i][0], 0f,
                    district.center.z + offsets[i][1]);
                instance.transform.rotation = Quaternion.Euler(0f, (i * 90f + (layout.Contains("linear") ? 90f : 0f)) % 360f, 0f);
                instance.isStatic = true;
            }
        }

        private static void BuildEnvironment(Transform parent, CityPipelineDistrict district,
            GameObject[] prefabs, string biome)
        {
            float[][] offsets = { new[] { -95f, 0f }, new[] { 95f, 0f }, new[] { 0f, 95f }, new[] { 0f, -95f }, new[] { -75f, 75f }, new[] { 75f, -75f } };
            for (int i = 0; i < offsets.Length; i++)
            {
                GameObject instance = (GameObject)PrefabUtility.InstantiatePrefab(prefabs[i % prefabs.Length]);
                instance.name = "Biome Dressing " + biome + " " + (i + 1);
                instance.transform.SetParent(parent, true);
                instance.transform.position = new Vector3(district.center.x + offsets[i][0], 0f,
                    district.center.z + offsets[i][1]);
                instance.transform.rotation = Quaternion.Euler(0f, (i * 57f) % 360f, 0f);
                instance.isStatic = true;
            }
        }

        private static void BuildLandmark(Transform parent, CityPipelineLandmark landmark, GameObject prefab)
        {
            GameObject instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            instance.name = "Landmark - " + landmark.name;
            instance.transform.SetParent(parent, true);
            instance.transform.position = new Vector3(landmark.position.x, 0f, landmark.position.z);
            instance.isStatic = true;
        }

        private static void CreateRoad(Transform parent, string name, Vector3 position, Vector3 scale, Material material, float rotationY = 0f)
        {
            GameObject road = GameObject.CreatePrimitive(PrimitiveType.Cube);
            road.name = name;
            road.transform.SetParent(parent, false);
            road.transform.position = position;
            road.transform.localScale = scale;
            road.transform.rotation = Quaternion.Euler(0f, rotationY, 0f);
            road.GetComponent<Renderer>().sharedMaterial = material;
            GameObjectUtility.SetStaticEditorFlags(road, StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccludeeStatic);
        }

        private static Material CreateCityGroundMaterial(CityPipelineCity city)
        {
            Color color = city.environment.biome.Contains("desert") ? new Color(0.66f, 0.49f, 0.29f) :
                city.environment.biome.Contains("forest") || city.environment.biome.Contains("savanna") ? new Color(0.22f, 0.34f, 0.20f) :
                city.environment.biome.Contains("coastal") || city.environment.biome.Contains("delta") ? new Color(0.34f, 0.43f, 0.40f) :
                city.environment.biome.Contains("alpine") ? new Color(0.48f, 0.52f, 0.55f) :
                city.environment.biome.Contains("urban") ? new Color(0.28f, 0.29f, 0.34f) :
                new Color(0.38f, 0.40f, 0.36f);
            return CreateMaterial("UCENO_" + city.id + "_Ground", color, 0.1f);
        }

        private static Material CreateCityRoadMaterial(CityPipelineCity city)
        {
            Color color = city.environment.biome.Contains("desert") ? new Color(0.31f, 0.25f, 0.19f) :
                city.environment.biome.Contains("coastal") ? new Color(0.18f, 0.25f, 0.28f) :
                new Color(0.16f, 0.18f, 0.21f);
            return CreateMaterial("UCENO_" + city.id + "_Road", color, 0.18f);
        }

        private static Material CreateMaterial(string name, Color color, float smoothness)
        {
            EnsureFolder("Assets/UCENO/Materials/Cities");
            string path = "Assets/UCENO/Materials/Cities/" + name + ".mat";
            Material material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null)
            {
                Shader shader = Shader.Find("Standard");
                if (shader == null) throw new BuildFailedException("Standard shader is unavailable.");
                material = new Material(shader);
                AssetDatabase.CreateAsset(material, path);
            }
            material.color = color;
            material.SetFloat("_Glossiness", smoothness);
            EditorUtility.SetDirty(material);
            return material;
        }

        private static void ConfigureRemoteGroup(AddressableAssetSettings settings, AddressableAssetGroup group)
        {
            BundledAssetGroupSchema schema = group.GetSchema<BundledAssetGroupSchema>();
            if (schema == null) schema = group.AddSchema<BundledAssetGroupSchema>();
            schema.BundleMode = BundledAssetGroupSchema.BundlePackingMode.PackSeparately;
            schema.IncludeAddressInCatalog = true;
            schema.IncludeLabelsInCatalog = true;
            schema.BuildPath.SetVariableByName(settings, AddressableAssetSettings.kRemoteBuildPath);
            schema.LoadPath.SetVariableByName(settings, AddressableAssetSettings.kRemoteLoadPath);
            EditorUtility.SetDirty(schema);
        }

        private static void RegisterAddressableScene(string scenePath, string label,
            AddressableAssetSettings settings, AddressableAssetGroup group)
        {
            string guid = AssetDatabase.AssetPathToGUID(scenePath);
            if (string.IsNullOrEmpty(guid))
                throw new BuildFailedException("Addressables could not resolve generated scene: " + scenePath);
            AddressableAssetEntry entry = settings.CreateOrMoveEntry(guid, group, false, false);
            entry.address = label;
            entry.SetLabel(label, true, true);
            EditorUtility.SetDirty(settings);
        }

        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path).Replace("\\", "/");
            string folder = Path.GetFileName(path);
            if (!AssetDatabase.IsValidFolder(parent)) EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, folder);
        }

        private static string RepositoryRoot()
        {
            return Path.GetFullPath(Path.Combine(Directory.GetParent(Application.dataPath).FullName, "..", ".."));
        }
    }
}
#endif
