#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace UCENO.VirtualWorld.Editor
{
    [Serializable]
    internal sealed class WorldInteractableRegistryDocument
    {
        public WorldInteractableRegistryEntry[] interactables;
    }

    [Serializable]
    internal sealed class WorldCityInteractableManifestDocument
    {
        public WorldCityInteractableManifestEntry[] cities;
    }

    [Serializable]
    internal sealed class WorldCityInteractableManifestEntry
    {
        public string cityId;
        public string file;
    }

    [Serializable]
    internal sealed class WorldInteractableRegistryEntry
    {
        public string id;
        public string kind;
        public float x, y, z, yaw;
    }

    [Serializable]
    internal sealed class WorldInteractableDistrictDocument
    {
        public WorldInteractableDistrictEntry[] districts;
    }

    [Serializable]
    internal sealed class WorldInteractableDistrictEntry
    {
        public string id, name, contentLabel;
        public float minX, maxX, minZ, maxZ;
    }

    [Serializable]
    internal sealed class WorldCityCatalogDocument
    {
        public WorldCityCatalogEntry[] cities;
    }

    [Serializable]
    internal sealed class WorldCityCatalogEntry
    {
        public string id;
        public string name;
        public WorldCityCatalogDistrict[] districts;
    }

    [Serializable]
    internal sealed class WorldCityCatalogDistrict
    {
        public string id;
        public string name;
        public string contentLabel;
        public WorldCityCatalogPoint center;
        public float radius;
    }

    [Serializable]
    internal sealed class WorldCityCatalogPoint
    {
        public float x, z;
    }

    /// <summary>
    /// Exports explicitly authored objects from loaded Unity scenes to the
    /// authoritative gateway registry. Objects absent from this file cannot
    /// be interacted with through the gateway.
    /// </summary>
    public static class WorldInteractableRegistryExporter
    {
        private const string ActiveCityPreference = "UCENO.ActiveCityId";

        [MenuItem("UCENO/World/Select City For Registry Export", false, 104)]
        private static void OpenCitySelector()
        {
            WorldCityRegistrySettingsWindow.Open();
        }

        [MenuItem("UCENO/World/Export Scene Interactables to Gateway Registry", false, 105)]
        private static void ExportFromMenu()
        {
            Export(true);
        }

        public static void Export(bool showDialog, string cityId = null, string[] includeScenePaths = null)
        {
            try
            {
                string root = Path.GetFullPath(Path.Combine(
                    Directory.GetParent(Application.dataPath).FullName, "..", ".."));
                string config = Path.Combine(root, "runtime", "world-gateway", "config");
                string cityCatalogPath = Path.Combine(config, "world-cities.json");
                if (!File.Exists(cityCatalogPath))
                    throw new InvalidOperationException("Missing authored city catalogue: " + cityCatalogPath);
                WorldCityCatalogDocument cityCatalog =
                    JsonUtility.FromJson<WorldCityCatalogDocument>(File.ReadAllText(cityCatalogPath));
                string activeCityId = string.IsNullOrWhiteSpace(cityId)
                    ? EditorPrefs.GetString(ActiveCityPreference, "meridian") : cityId;
                WorldCityCatalogEntry activeCity = cityCatalog?.cities?.FirstOrDefault(city =>
                    city != null && string.Equals(city.id, activeCityId, StringComparison.Ordinal));
                if (activeCity == null || activeCity.districts == null || activeCity.districts.Length < 4)
                    throw new InvalidOperationException("The selected city has no valid district layout: " + activeCityId);

                var districtEntries = activeCity.districts.Select(district =>
                {
                    if (district == null || district.center == null || district.radius < 40f ||
                        string.IsNullOrWhiteSpace(district.id) ||
                        district.contentLabel != "world-city-" + activeCity.id + "-" + district.id)
                        throw new InvalidOperationException("Invalid district geometry or content label in city " + activeCity.id);
                    return new WorldInteractableDistrictEntry {
                        id = district.id,
                        name = district.name,
                        contentLabel = district.contentLabel,
                        minX = district.center.x - district.radius,
                        maxX = district.center.x + district.radius,
                        minZ = district.center.z - district.radius,
                        maxZ = district.center.z + district.radius
                    };
                }).ToArray();
                if (districtEntries.Length == 0)
                    throw new InvalidOperationException("Selected city district manifest is empty.");
                for (int i = 0; i < districtEntries.Length; i++)
                for (int j = i + 1; j < districtEntries.Length; j++)
                {
                    var a = districtEntries[i]; var b = districtEntries[j];
                    bool overlaps = a.minX < b.maxX && a.maxX > b.minX &&
                        a.minZ < b.maxZ && a.maxZ > b.minZ;
                    if (overlaps)
                        throw new InvalidOperationException("City district rectangles overlap: " + a.id + " / " + b.id);
                }
                var districtDocument = new WorldInteractableDistrictDocument { districts = districtEntries };

                var include = includeScenePaths != null
                    ? new HashSet<string>(includeScenePaths, StringComparer.Ordinal)
                    : null;
                var loadedScenes = new List<Scene>();
                for (int i = 0; i < SceneManager.sceneCount; i++)
                {
                    Scene scene = SceneManager.GetSceneAt(i);
                    if (!scene.IsValid() || !scene.isLoaded) continue;
                    if (include != null && !include.Contains(scene.path)) continue;
                    if (string.IsNullOrWhiteSpace(scene.path))
                        throw new InvalidOperationException("Save every selected scene before exporting its interactables.");
                    loadedScenes.Add(scene);
                }
                if (include != null && loadedScenes.Count != include.Count)
                    throw new InvalidOperationException("Not all selected city district scenes are loaded for registry export.");

                // Saving first gives GlobalObjectId stable scene GUIDs, including
                // objects that were just moved into generated additive district scenes.
                foreach (Scene scene in loadedScenes)
                    if (scene.isDirty && !EditorSceneManager.SaveScene(scene))
                        throw new InvalidOperationException("Could not save scene before registry export: " + scene.path);

                var ids = new HashSet<string>(StringComparer.Ordinal);
                var entries = new List<WorldInteractableRegistryEntry>();
                var dirtyScenes = new HashSet<string>(StringComparer.Ordinal);

                foreach (Scene scene in loadedScenes)
                {
                    foreach (GameObject sceneRoot in scene.GetRootGameObjects())
                    {
                        foreach (WorldInteractable marker in sceneRoot.GetComponentsInChildren<WorldInteractable>(true))
                        {
                            if (marker == null || !marker.gameObject.activeInHierarchy) continue;

                            string id = marker.ObjectId;
                            if (string.IsNullOrWhiteSpace(id))
                            {
                                id = StableObjectId(marker);
                                dirtyScenes.Add(scene.path);
                            }

                            bool stableId = (id.StartsWith("uceno:", StringComparison.Ordinal) ||
                                id.StartsWith("scene:", StringComparison.Ordinal)) && id.Length == 38 &&
                                id.Substring(6).All(ch => (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f'));
                            if (!stableId || !ids.Add(id))
                                throw new InvalidOperationException("Every interactable must have a unique persistent UCENO ID: " + id);

                            Collider[] targetingColliders = marker.GetComponentsInChildren<Collider>(true);
                            if (!targetingColliders.Any(collider =>
                                collider != null && collider.enabled && collider.gameObject.activeInHierarchy && !collider.isTrigger))
                                throw new InvalidOperationException(
                                    "Interactable has no enabled non-trigger collider for player raycast targeting: " + id);
                            if (marker.Kind == "door" && !marker.HasDoorPivot)
                                throw new InvalidOperationException("Door marker must reference the actual hinged door mesh/pivot: " + id);

                            Vector3 position = marker.transform.position;
                            int matches = districtDocument.districts.Count(d =>
                                position.x >= d.minX && position.x < d.maxX &&
                                position.z >= d.minZ && position.z < d.maxZ);
                            if (matches != 1)
                                throw new InvalidOperationException("Interactable must be inside exactly one gateway district: " + id);

                            entries.Add(new WorldInteractableRegistryEntry {
                                id = id, kind = marker.Kind, x = position.x, y = position.y,
                                z = position.z, yaw = marker.transform.eulerAngles.y * Mathf.Deg2Rad
                            });
                        }
                    }
                }

                if (entries.Count == 0)
                    throw new InvalidOperationException(
                        "No scene interactables were found. Mark actual door/furniture objects first; refusing to overwrite the gateway registry with an empty list.");

                foreach (string scenePath in dirtyScenes)
                {
                    Scene scene = EditorSceneManager.GetSceneByPath(scenePath);
                    if (!scene.IsValid() || !EditorSceneManager.SaveScene(scene))
                        throw new InvalidOperationException("Could not save stable interactable IDs into scene: " + scenePath);
                }

                AssetDatabase.SaveAssets();
                string districtOutput = activeCity.id == "meridian" ? Path.Combine(config, "world-districts.json") : Path.Combine(config, "world-districts-" + activeCity.id + ".json");
                string districtTemporary = districtOutput + ".tmp";
                File.WriteAllText(districtTemporary, JsonUtility.ToJson(districtDocument, true));
                File.Copy(districtTemporary, districtOutput, true);
                File.Delete(districtTemporary);

                string output = Path.Combine(config, "world-interactables-" + activeCity.id + ".json");
                string temporary = output + ".tmp";
                string json = JsonUtility.ToJson(new WorldInteractableRegistryDocument {
                    interactables = entries.ToArray()
                }, true);
                File.WriteAllText(temporary, json, new UTF8Encoding(false));
                if (File.Exists(output)) File.Replace(temporary, output, null);
                else File.Move(temporary, output);

                // Update only this city's entry. The gateway will reject an
                // incomplete manifest rather than treating one city as global.
                string manifestPath = Path.Combine(config, "world-interactables-manifest.json");
                WorldCityInteractableManifestDocument existingManifest = File.Exists(manifestPath)
                    ? JsonUtility.FromJson<WorldCityInteractableManifestDocument>(File.ReadAllText(manifestPath))
                    : null;
                var manifestEntries = (existingManifest?.cities ?? Array.Empty<WorldCityInteractableManifestEntry>())
                    .Where(item => item != null && !string.IsNullOrWhiteSpace(item.cityId) && item.cityId != activeCity.id)
                    .ToList();
                manifestEntries.Add(new WorldCityInteractableManifestEntry {
                    cityId = activeCity.id, file = Path.GetFileName(output)
                });
                var manifestCities = new HashSet<string>(StringComparer.Ordinal);
                var manifestFiles = new HashSet<string>(StringComparer.Ordinal);
                foreach (WorldCityInteractableManifestEntry item in manifestEntries)
                    if (!manifestCities.Add(item.cityId) || !manifestFiles.Add(item.file))
                        throw new InvalidOperationException("Duplicate city or file in interactable manifest.");
                string manifestTemp = manifestPath + ".tmp";
                File.WriteAllText(manifestTemp, JsonUtility.ToJson(new WorldCityInteractableManifestDocument {
                    cities = manifestEntries.OrderBy(item => item.cityId, StringComparer.Ordinal).ToArray()
                }, true), new UTF8Encoding(false));
                if (File.Exists(manifestPath)) File.Replace(manifestTemp, manifestPath, null);
                else File.Move(manifestTemp, manifestPath);
                AssetDatabase.Refresh();

                if (showDialog)
                    EditorUtility.DisplayDialog("UCENO gateway registry",
                        "Exported " + entries.Count + " scene interactables to:\n" + output +
                        "\n\nConfigure WORLD_DISTRICTS_FILE to " + districtOutput + " and WORLD_INTERACTABLES_MANIFEST_FILE to " + manifestPath + " in the gateway runtime.",
                        "OK");
                Debug.Log("UCENO exported " + entries.Count + " scene interactables for " + activeCity.name + " to " + output);
            }
            catch (Exception error)
            {
                if (showDialog)
                    EditorUtility.DisplayDialog("UCENO gateway registry export failed", error.Message, "OK");
                Debug.LogException(error);
                throw;
            }
        }

        private static string StableObjectId(WorldInteractable marker)
        {
            // Derive a repeatable ID from Unity's persistent scene/object identity.
            // Saving scenes before export ensures GlobalObjectId contains a stable scene GUID.
            string globalId = GlobalObjectId.GetGlobalObjectIdSlow(marker).ToString();
            if (string.IsNullOrWhiteSpace(globalId) || globalId.Contains("-0-0-0-0"))
                throw new InvalidOperationException("Cannot derive a stable interactable ID from an unsaved scene object.");
            string id;
            using (SHA256 sha = SHA256.Create())
            {
                byte[] digest = sha.ComputeHash(Encoding.UTF8.GetBytes(globalId));
                id = "uceno:" + BitConverter.ToString(digest).Replace("-", "").ToLowerInvariant().Substring(0, 32);
            }
            // Retain a defensive GUID fallback token for compatibility with older authoring flows.
            if (string.IsNullOrEmpty(id)) id = "uceno:" + Guid.NewGuid().ToString("N");
            SerializedObject data = new SerializedObject(marker);
            data.FindProperty("objectId").stringValue = id;
            data.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(marker);
            return id;
        }
    }
    internal sealed class WorldCityRegistrySettingsWindow : EditorWindow
    {
        private WorldCityCatalogEntry[] cities = Array.Empty<WorldCityCatalogEntry>();
        private string[] cityLabels = Array.Empty<string>();
        private int selectedIndex;

        public static void Open()
        {
            var window = GetWindow<WorldCityRegistrySettingsWindow>("UCENO City Registry");
            window.minSize = new Vector2(360f, 120f);
            window.Show();
        }

        private void OnEnable()
        {
            try
            {
                string root = Path.GetFullPath(Path.Combine(
                    Directory.GetParent(Application.dataPath).FullName, "..", ".."));
                string path = Path.Combine(root, "runtime", "world-gateway", "config", "world-cities.json");
                var document = JsonUtility.FromJson<WorldCityCatalogDocument>(File.ReadAllText(path));
                cities = document?.cities ?? Array.Empty<WorldCityCatalogEntry>();
                cityLabels = cities.Select(city => city.name + " (" + city.id + ")").ToArray();
                string active = EditorPrefs.GetString("UCENO.ActiveCityId", "meridian");
                selectedIndex = Array.FindIndex(cities, city => city.id == active);
                if (selectedIndex < 0) selectedIndex = 0;
            }
            catch (Exception error)
            {
                Debug.LogException(error);
                cities = Array.Empty<WorldCityCatalogEntry>();
                cityLabels = Array.Empty<string>();
            }
        }

        private void OnGUI()
        {
            EditorGUILayout.LabelField("Choose the city whose saved scene interactables will be exported.",
                EditorStyles.wordWrappedLabel);
            if (cities.Length == 0)
            {
                EditorGUILayout.HelpBox("The ten-city catalogue could not be loaded.", MessageType.Error);
                return;
            }
            selectedIndex = EditorGUILayout.Popup("Active city", selectedIndex, cityLabels);
            EditorGUILayout.Space();
            if (GUILayout.Button("Save Active City"))
            {
                EditorPrefs.SetString("UCENO.ActiveCityId", cities[selectedIndex].id);
                EditorUtility.DisplayDialog("UCENO City Registry",
                    cities[selectedIndex].name + " is now selected for registry export.", "OK");
            }
        }
    }

}
#endif
