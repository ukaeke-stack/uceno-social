#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Security.Cryptography;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace UCENO.VirtualWorld.Editor
{
    /// <summary>
    /// Exports the actual colliders in the generated Unity scene as the
    /// authoritative gateway's world-space AABB collision map.
    /// </summary>
    public static class WorldCollisionGeometryExporter
    {
        [Serializable]
        private sealed class CollisionMap
        {
            public int version = 1;
            public string coordinateSystem = "Unity world coordinates; player position is feet/root";
            public Box[] boxes;
            public Interactable[] interactables;
        }

        [Serializable]
        private sealed class Interactable
        {
            public string id;
            public string kind;
            public float x, y, z, yaw;
        }

        [Serializable]
        private sealed class Box
        {
            public float minX, maxX, minY, maxY, minZ, maxZ;
        }

        public static string Export(string cityId, string[] includeScenePaths)
        {
            if (string.IsNullOrWhiteSpace(cityId) || includeScenePaths == null || includeScenePaths.Length == 0)
                throw new ArgumentException("A city ID and explicit generated district scene paths are required.");
            var include = new HashSet<string>(includeScenePaths, StringComparer.Ordinal);
            var loaded = new List<Scene>();
            for (int i = 0; i < SceneManager.sceneCount; i++)
            {
                Scene scene = SceneManager.GetSceneAt(i);
                if (!scene.IsValid() || !scene.isLoaded || !include.Contains(scene.path)) continue;
                loaded.Add(scene);
            }
            if (loaded.Count != include.Count)
                throw new InvalidOperationException("Not all selected city district scenes are loaded for collision export.");

            var boxes = new List<Box>();
            var interactables = new List<Interactable>();
            var ids = new HashSet<string>(StringComparer.Ordinal);
            foreach (Scene scene in loaded)
            {
                foreach (GameObject root in scene.GetRootGameObjects())
                {
                    foreach (Collider collider in root.GetComponentsInChildren<Collider>(true))
                    {
                        if (collider == null || !collider.enabled || collider.isTrigger ||
                            !collider.gameObject.activeInHierarchy ||
                            collider.GetComponentInParent<PlayerMotor>() != null) continue;
                        Bounds bounds = collider.bounds;
                        if (bounds.size.sqrMagnitude < 0.0001f) continue;
                        boxes.Add(new Box {
                            minX = Round(bounds.min.x), maxX = Round(bounds.max.x),
                            minY = Round(bounds.min.y), maxY = Round(bounds.max.y),
                            minZ = Round(bounds.min.z), maxZ = Round(bounds.max.z)
                        });
                    }
                    foreach (WorldInteractable item in root.GetComponentsInChildren<WorldInteractable>(true))
                    {
                        if (item == null || !item.gameObject.activeInHierarchy) continue;
                        string id = item.ObjectId;
                        if (string.IsNullOrWhiteSpace(id) || id.Length > 80 ||
                            !id.All(character => char.IsLetterOrDigit(character) || "._:-".IndexOf(character) >= 0) ||
                            !ids.Add(id))
                            throw new InvalidOperationException("City collision export found invalid or duplicate interactable ID: " + id);
                        Vector3 position = item.transform.position;
                        interactables.Add(new Interactable {
                            id = id, kind = item.Kind,
                            x = Round(position.x), y = Round(position.y), z = Round(position.z),
                            yaw = Round(item.transform.eulerAngles.y * Mathf.Deg2Rad)
                        });
                    }
                }
            }
            if (boxes.Count == 0)
                throw new InvalidOperationException("City " + cityId + " has no active non-trigger colliders.");
            if (boxes.Count > 500 || interactables.Count > 500)
                throw new InvalidOperationException("City " + cityId + " exceeds the gateway limit of 500 colliders or interactables.");

            string repositoryRoot = Path.GetFullPath(Path.Combine(
                Directory.GetParent(Application.dataPath).FullName, "..", ".."));
            string outputPath = Path.Combine(repositoryRoot, "runtime", "world-gateway", "data",
                "uceno-city-collision-boxes-" + cityId + ".json");
            Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
            CollisionMap map = new CollisionMap { boxes = boxes.ToArray(), interactables = interactables.ToArray() };
            File.WriteAllText(outputPath, JsonUtility.ToJson(map, true), new UTF8Encoding(false));
            ExportCityDistrictMaps(cityId, includeScenePaths, repositoryRoot);
            AssetDatabase.Refresh();
            Debug.Log("Exported " + boxes.Count + " colliders and " + interactables.Count +
                " interactables for city " + cityId + " to " + outputPath);
            return outputPath;
        }

        private static void ExportCityDistrictMaps(string cityId, string[] includeScenePaths, string repositoryRoot)
        {
            string catalogPath = Path.Combine(repositoryRoot, "runtime", "world-gateway", "config", "world-cities.json");
            if (!File.Exists(catalogPath))
                throw new InvalidOperationException("Missing authoritative city catalogue: " + catalogPath);
            CityPipelineCatalog catalog = JsonUtility.FromJson<CityPipelineCatalog>(File.ReadAllText(catalogPath));
            CityPipelineCity city = catalog?.cities?.SingleOrDefault(item => item != null && item.id == cityId);
            if (city == null || city.districts == null || city.districts.Length < 4)
                throw new InvalidOperationException("City " + cityId + " has no complete district catalogue.");

            var include = new HashSet<string>(includeScenePaths, StringComparer.Ordinal);
            var scenes = new List<Scene>();
            for (int i = 0; i < SceneManager.sceneCount; i++)
            {
                Scene scene = SceneManager.GetSceneAt(i);
                if (scene.IsValid() && scene.isLoaded && include.Contains(scene.path)) scenes.Add(scene);
            }
            if (scenes.Count != include.Count)
                throw new InvalidOperationException("City collision export must use every explicitly selected generated scene and no others.");

            string outputDirectory = Path.Combine(repositoryRoot, "runtime", "world-gateway", "data", "city-districts");
            Directory.CreateDirectory(outputDirectory);
            string manifestPath = Path.Combine(outputDirectory, "manifest.json");
            DistrictManifest existing = File.Exists(manifestPath)
                ? JsonUtility.FromJson<DistrictManifest>(File.ReadAllText(manifestPath))
                : null;
            var entries = (existing?.districts ?? Array.Empty<DistrictMapEntry>())
                .Where(item => item != null && !string.IsNullOrWhiteSpace(item.cityId) && item.cityId != cityId).ToList();
            var filenames = new HashSet<string>(entries.Select(item => item.file), StringComparer.Ordinal);
            var allInteractableIds = new HashSet<string>(StringComparer.Ordinal);
            var newEntries = new List<DistrictMapEntry>();
            var pendingMaps = new List<KeyValuePair<string, string>>();

            foreach (CityPipelineDistrict district in city.districts)
            {
                float minX = district.center.x - district.radius;
                float maxX = district.center.x + district.radius;
                float minZ = district.center.z - district.radius;
                float maxZ = district.center.z + district.radius;
                var districtBoxes = new List<Box>();
                var districtInteractables = new List<Interactable>();
                foreach (Scene scene in scenes)
                foreach (GameObject root in scene.GetRootGameObjects())
                {
                    foreach (Collider collider in root.GetComponentsInChildren<Collider>(true))
                    {
                        if (collider == null || !collider.enabled || collider.isTrigger ||
                            !collider.gameObject.activeInHierarchy ||
                            collider.GetComponentInParent<PlayerMotor>() != null) continue;
                        Bounds bounds = collider.bounds;
                        if (bounds.size.sqrMagnitude < 0.0001f ||
                            bounds.min.x >= maxX || bounds.max.x <= minX ||
                            bounds.min.z >= maxZ || bounds.max.z <= minZ) continue;
                        districtBoxes.Add(new Box {
                            minX = Round(bounds.min.x), maxX = Round(bounds.max.x),
                            minY = Round(bounds.min.y), maxY = Round(bounds.max.y),
                            minZ = Round(bounds.min.z), maxZ = Round(bounds.max.z)
                        });
                    }
                    foreach (WorldInteractable item in root.GetComponentsInChildren<WorldInteractable>(true))
                    {
                        if (item == null || !item.gameObject.activeInHierarchy) continue;
                        Vector3 position = item.transform.position;
                        if (position.x < minX || position.x >= maxX || position.z < minZ || position.z >= maxZ) continue;
                        string id = item.ObjectId;
                        if (string.IsNullOrWhiteSpace(id) || id.Length > 80 ||
                            !id.All(ch => char.IsLetterOrDigit(ch) || "._:-".IndexOf(ch) >= 0) ||
                            !allInteractableIds.Add(id))
                            throw new InvalidOperationException("Invalid or duplicate interactable ID in city " + cityId + ": " + id);
                        districtInteractables.Add(new Interactable {
                            id = id, kind = item.Kind,
                            x = Round(position.x), y = Round(position.y), z = Round(position.z),
                            yaw = Round(item.transform.eulerAngles.y * Mathf.Deg2Rad)
                        });
                    }
                }
                if (districtBoxes.Count == 0)
                    throw new InvalidOperationException("City " + cityId + " district " + district.id + " has no collision geometry; manifest was not updated.");
                if (districtBoxes.Count > 500 || districtInteractables.Count > 500)
                    throw new InvalidOperationException("City " + cityId + " district " + district.id + " exceeds the 500-item gateway limit.");
                string mapJson = JsonUtility.ToJson(new CollisionMap {
                    boxes = districtBoxes.ToArray(), interactables = districtInteractables.ToArray()
                }, true);
                string digest;
                using (SHA256 hash = SHA256.Create())
                    digest = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(mapJson)))
                        .Replace("-", "").Substring(0, 12).ToLowerInvariant();
                string fileName = cityId + "-" + district.id + "-" + digest + ".json";
                if (!filenames.Add(fileName))
                    throw new InvalidOperationException("City district collision filename conflicts with another city: " + fileName);
                pendingMaps.Add(new KeyValuePair<string, string>(fileName, mapJson));
                newEntries.Add(new DistrictMapEntry {
                    cityId = cityId, id = district.id, contentLabel = district.contentLabel,
                    file = fileName, minX = minX, maxX = maxX, minZ = minZ, maxZ = maxZ,
                    colliderCount = districtBoxes.Count, interactableCount = districtInteractables.Count
                });
            }

            entries.AddRange(newEntries);
            var identities = new HashSet<string>(StringComparer.Ordinal);
            foreach (DistrictMapEntry entry in entries)
                if (!identities.Add(entry.cityId + ":" + entry.id))
                    throw new InvalidOperationException("Duplicate city district identity in collision manifest.");
            // Write immutable, content-addressed map files first. The old
            // manifest continues to reference the old complete set until the
            // final atomic manifest replacement succeeds.
            var stagedPaths = new List<string>();
            foreach (KeyValuePair<string, string> pending in pendingMaps)
            {
                string finalPath = Path.Combine(outputDirectory, pending.Key);
                if (File.Exists(finalPath)) continue;
                string tempPath = finalPath + ".tmp";
                File.WriteAllText(tempPath, pending.Value, new UTF8Encoding(false));
                stagedPaths.Add(tempPath);
            }
            foreach (string tempPath in stagedPaths)
            {
                string finalPath = tempPath.Substring(0, tempPath.Length - 4);
                if (!File.Exists(finalPath)) File.Move(tempPath, finalPath);
                else File.Delete(tempPath);
            }

            string manifestJson = JsonUtility.ToJson(new DistrictManifest { districts = entries.ToArray() }, true);
            string tempManifestPath = manifestPath + ".tmp";
            File.WriteAllText(tempManifestPath, manifestJson, new UTF8Encoding(false));
            if (File.Exists(manifestPath)) File.Replace(tempManifestPath, manifestPath, null);
            else File.Move(tempManifestPath, manifestPath);
            Debug.Log("Updated city-scoped collision manifest with " + newEntries.Count +
                " districts for " + cityId + "; retained " + (entries.Count - newEntries.Count) + " districts from other cities.");
        }

        public static string Export(Scene scene)
        {
            if (!scene.IsValid() || !scene.isLoaded)
                throw new InvalidOperationException("Cannot export collision geometry from an unloaded scene.");

            List<Box> boxes = new List<Box>();
            foreach (GameObject root in scene.GetRootGameObjects())
            {
                foreach (Collider collider in root.GetComponentsInChildren<Collider>(true))
                {
                    if (collider == null || !collider.enabled || collider.isTrigger ||
                        !collider.gameObject.activeInHierarchy ||
                        collider.GetComponentInParent<PlayerMotor>() != null)
                        continue;

                    Bounds bounds = collider.bounds;
                    if (bounds.size.sqrMagnitude < 0.0001f) continue;
                    boxes.Add(new Box
                    {
                        minX = Round(bounds.min.x), maxX = Round(bounds.max.x),
                        minY = Round(bounds.min.y), maxY = Round(bounds.max.y),
                        minZ = Round(bounds.min.z), maxZ = Round(bounds.max.z)
                    });
                }
            }

            List<Interactable> interactables = new List<Interactable>();
            HashSet<string> ids = new HashSet<string>(StringComparer.Ordinal);
            foreach (GameObject root in scene.GetRootGameObjects())
            {
                foreach (WorldInteractable item in root.GetComponentsInChildren<WorldInteractable>(true))
                {
                    if (item == null || !item.gameObject.activeInHierarchy) continue;
                    string id = item.ObjectId;
                    if (string.IsNullOrWhiteSpace(id) || id.Length > 80 ||
                        !id.All(character => char.IsLetterOrDigit(character) || "._:-".IndexOf(character) >= 0) ||
                        !ids.Add(id))
                        throw new InvalidOperationException("World interactable IDs must be unique, non-empty and at most 80 characters: " + id);
                    Vector3 position = item.transform.position;
                    interactables.Add(new Interactable
                    {
                        id = id, kind = item.Kind,
                        x = Round(position.x), y = Round(position.y), z = Round(position.z),
                        yaw = Round(item.transform.eulerAngles.y * Mathf.Deg2Rad)
                    });
                }
            }

            if (boxes.Count == 0)
                throw new InvalidOperationException("No active, non-trigger world colliders were found.");
            if (boxes.Count > 500)
                throw new InvalidOperationException("Collision export contains " + boxes.Count +
                    " colliders; gateway limit is 500. Merge static colliders or simplify the scene.");
            if (interactables.Count > 500)
                throw new InvalidOperationException("Collision export contains " + interactables.Count +
                    " interactables; gateway limit is 500. Split the district into smaller authored interaction sets.");

            string repositoryRoot = Path.GetFullPath(Path.Combine(
                Directory.GetParent(Application.dataPath).FullName, "..", ".."));
            string outputPath = Path.Combine(repositoryRoot,
                "runtime", "world-gateway", "data", "uceno-city-collision-boxes.json");
            Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
            CollisionMap map = new CollisionMap
            {
                boxes = boxes.ToArray(),
                interactables = interactables.ToArray()
            };
            File.WriteAllText(outputPath, JsonUtility.ToJson(map, true), new UTF8Encoding(false));
            AssetDatabase.Refresh();
            Debug.Log("Exported " + boxes.Count + " actual Unity world colliders to " + outputPath);
            return outputPath;
        }

        [Serializable]
        private sealed class DistrictManifest
        {
            public int version = 1;
            public string coordinateSystem = "Unity world coordinates; player position is feet/root";
            public DistrictMapEntry[] districts;
        }

        [Serializable]
        private sealed class DistrictMapEntry
        {
            public string cityId;
            public string id;
            public string contentLabel;
            public string file;
            public float minX, maxX, minZ, maxZ;
            public int colliderCount;
            public int interactableCount;
        }

        [Serializable]
        private sealed class DistrictBounds
        {
            public string id;
            public string contentLabel;
            public float minX, maxX, minZ, maxZ;
        }

        /// <summary>
        /// Exports every currently loaded scene into district-scoped collision maps.
        /// The legacy single-map export remains unchanged until the gateway is switched
        /// to consume the generated manifest.
        /// </summary>
        [MenuItem("UCENO/World/Export Loaded District Maps", false, 91)]
        public static void ExportLoadedDistrictMaps()
        {
            try
            {
                string repositoryRoot = Path.GetFullPath(Path.Combine(
                    Directory.GetParent(Application.dataPath).FullName, "..", ".."));
                string districtConfig = Path.Combine(repositoryRoot, "runtime", "world-gateway",
                    "config", "world-districts.json");
                if (!File.Exists(districtConfig))
                    throw new InvalidOperationException("Missing district configuration: " + districtConfig);

                DistrictBounds[] districts = JsonUtility.FromJson<DistrictBoundsWrapper>(
                    File.ReadAllText(districtConfig))?.districts;
                if (districts == null || districts.Length == 0)
                    throw new InvalidOperationException("District configuration contains no districts.");

                HashSet<string> globalIds = new HashSet<string>(StringComparer.Ordinal);
                for (int sceneIndex = 0; sceneIndex < SceneManager.sceneCount; sceneIndex++)
                {
                    Scene scene = SceneManager.GetSceneAt(sceneIndex);
                    if (!scene.IsValid() || !scene.isLoaded) continue;
                    foreach (GameObject root in scene.GetRootGameObjects())
                    foreach (WorldInteractable item in root.GetComponentsInChildren<WorldInteractable>(true))
                    {
                        if (item == null || !item.gameObject.activeInHierarchy) continue;
                        string id = item.ObjectId;
                        if (string.IsNullOrWhiteSpace(id) || id.Length > 80 ||
                            !id.All(ch => char.IsLetterOrDigit(ch) || "._:-".IndexOf(ch) >= 0) ||
                            !globalIds.Add(id))
                            throw new InvalidOperationException("Invalid or duplicate interactable ID across loaded scenes: " + id);
                        Vector3 position = item.transform.position;
                        int districtMatches = districts.Count(d => Contains(d, position.x, position.z));
                        if (districtMatches != 1)
                            throw new InvalidOperationException("Interactable " + id +
                                " must belong to exactly one district; found " + districtMatches + ".");
                    }
                }
                globalIds.Clear();
                List<DistrictMapEntry> entries = new List<DistrictMapEntry>();
                string outputDirectory = Path.Combine(repositoryRoot, "runtime", "world-gateway", "data", "districts");
                Directory.CreateDirectory(outputDirectory);

                foreach (DistrictBounds district in districts)
                {
                    List<Box> boxes = new List<Box>();
                    List<Interactable> interactables = new List<Interactable>();
                    for (int sceneIndex = 0; sceneIndex < SceneManager.sceneCount; sceneIndex++)
                    {
                        Scene scene = SceneManager.GetSceneAt(sceneIndex);
                        if (!scene.IsValid() || !scene.isLoaded) continue;
                        foreach (GameObject root in scene.GetRootGameObjects())
                        {
                            foreach (Collider collider in root.GetComponentsInChildren<Collider>(true))
                            {
                                if (collider == null || !collider.enabled || collider.isTrigger ||
                                    !collider.gameObject.activeInHierarchy ||
                                    collider.GetComponentInParent<PlayerMotor>() != null) continue;
                                Bounds bounds = collider.bounds;
                                if (bounds.size.sqrMagnitude < 0.0001f) continue;
                                if (!OverlapsDistrict(district, bounds)) continue;
                                boxes.Add(new Box
                                {
                                    minX = Round(bounds.min.x), maxX = Round(bounds.max.x),
                                    minY = Round(bounds.min.y), maxY = Round(bounds.max.y),
                                    minZ = Round(bounds.min.z), maxZ = Round(bounds.max.z)
                                });
                            }

                            foreach (WorldInteractable item in root.GetComponentsInChildren<WorldInteractable>(true))
                            {
                                if (item == null || !item.gameObject.activeInHierarchy) continue;
                                Vector3 position = item.transform.position;
                                if (!Contains(district, position.x, position.z)) continue;
                                string id = item.ObjectId;
                                if (string.IsNullOrWhiteSpace(id) || id.Length > 80 ||
                                    !id.All(ch => char.IsLetterOrDigit(ch) || "._:-".IndexOf(ch) >= 0) ||
                                    !globalIds.Add(id))
                                    throw new InvalidOperationException("Invalid or duplicate interactable ID across loaded scenes: " + id);
                                interactables.Add(new Interactable
                                {
                                    id = id, kind = item.Kind,
                                    x = Round(position.x), y = Round(position.y), z = Round(position.z),
                                    yaw = Round(item.transform.eulerAngles.y * Mathf.Deg2Rad)
                                });
                            }
                        }
                    }

                    if (boxes.Count == 0)
                        throw new InvalidOperationException("District " + district.id + " has no colliders. Add or load its scene before exporting.");
                    if (boxes.Count > 500 || interactables.Count > 500)
                        throw new InvalidOperationException("District " + district.id +
                            " exceeds the gateway limit of 500 colliders or interactables.");
                    string fileName = district.id + ".json";
                    string filePath = Path.Combine(outputDirectory, fileName);
                    CollisionMap map = new CollisionMap { boxes = boxes.ToArray(), interactables = interactables.ToArray() };
                    File.WriteAllText(filePath, JsonUtility.ToJson(map, true), new UTF8Encoding(false));
                    entries.Add(new DistrictMapEntry
                    {
                        id = district.id, contentLabel = district.contentLabel, file = fileName,
                        minX = district.minX, maxX = district.maxX, minZ = district.minZ, maxZ = district.maxZ,
                        colliderCount = boxes.Count, interactableCount = interactables.Count
                    });
                }

                DistrictManifest manifest = new DistrictManifest { districts = entries.ToArray() };
                string manifestPath = Path.Combine(outputDirectory, "manifest.json");
                File.WriteAllText(manifestPath, JsonUtility.ToJson(manifest, true), new UTF8Encoding(false));
                AssetDatabase.Refresh();
                Debug.Log("Exported " + entries.Count + " district maps to " + outputDirectory +
                    ". Gateway consumption remains on the legacy global map until its loader is migrated.");
                EditorUtility.DisplayDialog("UCENO district export",
                    "Exported " + entries.Count + " district maps and a manifest. This is a build artifact only; the gateway still uses its legacy global collision map.",
                    "OK");
            }
            catch (Exception error)
            {
                Debug.LogException(error);
                EditorUtility.DisplayDialog("UCENO district export failed", error.Message, "OK");
            }
        }

        [Serializable]
        private sealed class DistrictBoundsWrapper
        {
            public DistrictBounds[] districts;
        }

        private static bool Contains(DistrictBounds district, float x, float z)
        {
            return x >= district.minX && x < district.maxX &&
                z >= district.minZ && z < district.maxZ;
        }

        private static bool OverlapsDistrict(DistrictBounds district, Bounds bounds)
        {
            return bounds.min.x < district.maxX && bounds.max.x > district.minX &&
                bounds.min.z < district.maxZ && bounds.max.z > district.minZ;
        }

        private static float Round(float value)
        {
            return (float)Math.Round(value, 3, MidpointRounding.AwayFromZero);
        }
    }
}
#endif
