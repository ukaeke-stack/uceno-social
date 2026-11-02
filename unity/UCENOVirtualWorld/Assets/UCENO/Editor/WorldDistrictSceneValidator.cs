#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace UCENO.VirtualWorld.Editor
{
    [Serializable]
    internal sealed class UcenoDistrictManifest
    {
        public UcenoDistrictEntry[] districts;
    }

    [Serializable]
    internal sealed class UcenoDistrictEntry
    {
        public string id;
        public float minX, maxX, minZ, maxZ;
    }

    /// <summary>Validates gateway-ready identity, targeting geometry and district placement across every loaded scene.</summary>
    public static class WorldDistrictSceneValidator
    {
        [MenuItem("UCENO/World/Validate Loaded District Scenes", false, 90)]
        public static void ValidateLoadedScenes()
        {
            try
            {
                string root = Path.GetFullPath(Path.Combine(
                    Directory.GetParent(Application.dataPath).FullName, "..", ".."));
                string manifestPath = Path.Combine(root, "runtime", "world-gateway",
                    "config", "world-districts.json");
                if (!File.Exists(manifestPath))
                    throw new InvalidOperationException("Missing district manifest: " + manifestPath);

                UcenoDistrictManifest manifest =
                    JsonUtility.FromJson<UcenoDistrictManifest>(File.ReadAllText(manifestPath));
                if (manifest == null || manifest.districts == null || manifest.districts.Length == 0)
                    throw new InvalidOperationException("District manifest is empty or invalid.");

                HashSet<string> ids = new HashSet<string>(StringComparer.Ordinal);
                int checkedObjects = 0;
                for (int sceneIndex = 0; sceneIndex < SceneManager.sceneCount; sceneIndex++)
                {
                    Scene scene = SceneManager.GetSceneAt(sceneIndex);
                    if (!scene.IsValid() || !scene.isLoaded) continue;
                    foreach (GameObject sceneRoot in scene.GetRootGameObjects())
                    foreach (WorldInteractable item in sceneRoot.GetComponentsInChildren<WorldInteractable>(true))
                    {
                        if (item == null || !item.gameObject.activeInHierarchy) continue;
                        string id = item.ObjectId;
                        if (!IsGatewayObjectId(id) || !ids.Add(id))
                            throw new InvalidOperationException("Invalid or duplicate gateway object ID across loaded scenes: " + id);

                        if (item.GetComponentsInChildren<Collider>(true).Length == 0)
                            throw new InvalidOperationException("Interactable has no collider for player targeting: " + id);
                        if (item.Kind == "door" && !item.HasDoorPivot)
                            throw new InvalidOperationException("Door marker must reference the actual hinged door mesh/pivot: " + id);

                        Vector3 position = item.transform.position;
                        int matches = manifest.districts.Count(d =>
                            position.x >= d.minX && position.x < d.maxX &&
                            position.z >= d.minZ && position.z < d.maxZ);
                        if (matches != 1)
                            throw new InvalidOperationException("Object " + id +
                                " must belong to exactly one district; found " + matches +
                                " at world position " + position + ".");
                        checkedObjects++;
                    }
                }

                EditorUtility.DisplayDialog("UCENO district validation",
                    "Validated " + checkedObjects + " gateway-ready interactables across loaded scenes. IDs are unique, every object has a targeting collider, doors have a real pivot, and every object belongs to exactly one configured district.",
                    "OK");
            }
            catch (Exception error)
            {
                EditorUtility.DisplayDialog("UCENO district validation failed", error.Message, "OK");
                Debug.LogException(error);
            }
        }

        private static bool IsGatewayObjectId(string id)
        {
            return !string.IsNullOrWhiteSpace(id) &&
                id.StartsWith("scene:", StringComparison.Ordinal) &&
                id.Length == 38 &&
                id.Substring(6).All(ch =>
                    (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f'));
        }
    }
}
#endif
