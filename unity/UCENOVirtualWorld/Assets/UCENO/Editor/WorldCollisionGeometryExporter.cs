#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
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

        private static float Round(float value)
        {
            return (float)Math.Round(value, 3, MidpointRounding.AwayFromZero);
        }
    }
}
#endif
