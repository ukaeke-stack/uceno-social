#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using UnityEditor;
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
        public string id;
        public float minX, maxX, minZ, maxZ;
    }

    /// <summary>
    /// Exports explicitly authored, real scene objects into the authoritative
    /// gateway registry. Runtime interaction is disabled for objects absent
    /// from this server-loaded registry.
    /// </summary>
    public static class WorldInteractableRegistryExporter
    {
        [MenuItem("UCENO/World/Export Scene Interactables to Gateway Registry", false, 105)]
        public static void Export(bool showDialog = true)
        {
            try
            {
                string root = Path.GetFullPath(Path.Combine(
                    Directory.GetParent(Application.dataPath).FullName, "..", ".."));
                string config = Path.Combine(root, "runtime", "world-gateway", "config");
                string districtPath = Path.Combine(config, "world-districts.json");
                if (!File.Exists(districtPath))
                    throw new InvalidOperationException("Missing gateway district manifest: " + districtPath);

                var districts = JsonUtility.FromJson<WorldInteractableDistrictDocument>(
                    File.ReadAllText(districtPath));
                if (districts == null || districts.districts == null || districts.districts.Length == 0)
                    throw new InvalidOperationException("Gateway district manifest is empty.");

                var loadedScenes = new List<Scene>();
                for (int sceneIndex = 0; sceneIndex < SceneManager.sceneCount; sceneIndex++)
                {
                    Scene scene = SceneManager.GetSceneAt(sceneIndex);
                    if (scene.IsValid() && scene.isLoaded && !string.IsNullOrWhiteSpace(scene.path))
                        loadedScenes.Add(scene);
                }

                // Save first so GlobalObjectId values are based on final additive
                // district scene GUIDs, not the temporary boot scene.
                foreach (Scene scene in loadedScenes)
                    if (EditorSceneManager.GetSceneByPath(scene.path).isDirty &&
                        !EditorSceneManager.SaveScene(scene))
                        throw new InvalidOperationException("Could not save scene before assigning interactable IDs: " + scene.path);

                var ids = new HashSet<string>(StringComparer.Ordinal);
                var entries = new List<WorldInteractableRegistryEntry>();
                var dirtyScenes = new HashSet<Scene>();
                foreach (Scene scene in loadedScenes)
                {
                    Scene scene = SceneManager.GetSceneAt(sceneIndex);
                    if (!scene.IsValid() || !scene.isLoaded) continue;
                    foreach (GameObject sceneRoot in scene.GetRootGameObjects())
                    foreach (WorldInteractable marker in sceneRoot.GetComponentsInChildren<WorldInteractable>(true))
                    {
                        if (marker == null || !marker.gameObject.activeInHierarchy) continue;
                        string id = marker.ObjectId;
                        if (string.IsNullOrWhiteSpace(scene.path) || string.IsNullOrWhiteSpace(id) ||
                            !id.StartsWith("scene:", StringComparison.Ordinal) || id.Length != 38 ||
                            !id.Substring(6).All(ch => (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f')) ||
                            !ids.Add(id))
                            throw new InvalidOperationException("Every interactable must have a saved scene and unique stable ID: " + id);

                        if (marker.GetComponentsInChildren<Collider>(true).Length == 0)
                            throw new InvalidOperationException("Interactable has no collider for player targeting: " + id);
                        if (marker.Kind == "door" && !marker.HasDoorPivot)
                            throw new InvalidOperationException("Door marker must reference the actual hinged door mesh/pivot: " + id);

                        Vector3 position = marker.transform.position;
                        int matches = districts.districts.Count(d =>
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

                foreach (Scene scene in loadedScenes)
                    if (EditorSceneManager.GetSceneByPath(scene.path).isDirty &&
                        !EditorSceneManager.SaveScene(scene))
                        throw new InvalidOperationException("Could not save scene after assigning interactable IDs: " + scene.path);

                if (entries.Count == 0)
                    throw new InvalidOperationException(
                        "No scene interactables were found. Mark actual door/furniture objects first; refusing to overwrite the gateway registry with an empty list.");

                foreach (Scene dirtyScene in dirtyScenes)
                {
                    EditorSceneManager.MarkSceneDirty(dirtyScene);
                    if (!EditorSceneManager.SaveScene(dirtyScene))
                        throw new InvalidOperationException("Could not save scene after assigning stable interactable IDs: " + dirtyScene.path);
                }
                AssetDatabase.SaveAssets();

                string output = Path.Combine(config, "world-interactables.json");
                string temporary = output + ".tmp";
                string json = JsonUtility.ToJson(new WorldInteractableRegistryDocument {
                    interactables = entries.ToArray()
                }, true);
                File.WriteAllText(temporary, json);
                File.Copy(temporary, output, true);
                File.Delete(temporary);
                AssetDatabase.Refresh();
                if (showDialog)
                    EditorUtility.DisplayDialog("UCENO gateway registry",
                        "Exported " + entries.Count + " scene interactables to:\n" + output +
                        "\n\nConfigure WORLD_INTERACTABLES_FILE to this file in the gateway runtime.",
                        "OK");
            }
            catch (Exception error)
            {
                if (showDialog)
                    if (showDialog)
                    EditorUtility.DisplayDialog("UCENO gateway registry export failed", error.Message, "OK");
                Debug.LogException(error);
                throw;
                throw;
            }
        }

        private static string StableObjectId(WorldInteractable marker)
        {
            string globalId = GlobalObjectId.GetGlobalObjectIdSlow(marker.gameObject).ToString();
            if (string.IsNullOrWhiteSpace(globalId) || globalId == GlobalObjectId.Null.ToString())
                throw new InvalidOperationException("Save the scene and prefab instance before assigning a stable UCENO object ID.");
            using (SHA256 hash = SHA256.Create())
            {
                byte[] digest = hash.ComputeHash(Encoding.UTF8.GetBytes(globalId));
                string id = "scene:" + BitConverter.ToString(digest, 0, 16)
                    .Replace("-", "").ToLowerInvariant();
                SerializedObject data = new SerializedObject(marker);
                data.FindProperty("objectId").stringValue = id;
                data.ApplyModifiedPropertiesWithoutUndo();
                EditorUtility.SetDirty(marker);
                return id;
            }
        }
    }
}
#endif
