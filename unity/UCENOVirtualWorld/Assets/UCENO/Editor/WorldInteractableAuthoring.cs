#if UNITY_EDITOR
using System;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace UCENO.VirtualWorld.Editor
{
    /// <summary>Explicit authoring tools for imported scene props.</summary>
    public static class WorldInteractableAuthoring
    {
        [MenuItem("GameObject/UCENO/Mark Selected as Door", false, 30)]
        private static void MarkDoor() => Add(WorldInteractableKind.Door);
        [MenuItem("GameObject/UCENO/Mark Selected as Seat", false, 31)]
        private static void MarkSeat() => Add(WorldInteractableKind.Seat);
        [MenuItem("GameObject/UCENO/Mark Selected as Usable Object", false, 32)]
        private static void MarkObject() => Add(WorldInteractableKind.Object);
        [MenuItem("GameObject/UCENO/Mark Selected as Furniture", false, 33)]
        private static void MarkFurniture() => Add(WorldInteractableKind.Furniture);
        [MenuItem("GameObject/UCENO/Mark Selected as Vehicle", false, 34)]
        private static void MarkVehicle() => Add(WorldInteractableKind.Vehicle);

        [MenuItem("GameObject/UCENO/Use Selected Child as Parent Door Pivot", false, 35)]
        private static void SetSelectedDoorPivot()
        {
            Transform selected = Selection.activeTransform;
            WorldInteractable marker = selected != null ? selected.GetComponentInParent<WorldInteractable>() : null;
            if (marker == null || marker.Kind != "door" || selected == marker.transform)
                throw new InvalidOperationException("Select the actual hinge/pivot child beneath a door marker, not the building or door assembly root.");
            SerializedObject data = new SerializedObject(marker);
            data.FindProperty("doorPivot").objectReferenceValue = selected;
            data.ApplyModifiedProperties();
            EditorUtility.SetDirty(marker);
            Debug.Log("UCENO assigned the selected hinge transform to door " + marker.ObjectId);
        }

        [MenuItem("GameObject/UCENO/Use Selected Child as Parent Door Pivot", true)]
        private static bool ValidateSelectedDoorPivot()
        {
            Transform selected = Selection.activeTransform;
            WorldInteractable marker = selected != null ? selected.GetComponentInParent<WorldInteractable>() : null;
            return marker != null && marker.Kind == "door" && selected != marker.transform;
        }

        [MenuItem("GameObject/UCENO/Add Targeting Collider From Renderers", false, 36)]
        private static void AddTargetingCollider()
        {
            GameObject selected = Selection.activeGameObject;
            if (selected == null || selected.GetComponent<WorldInteractable>() == null)
                throw new InvalidOperationException("Select the GameObject carrying the WorldInteractable marker.");
            Collider[] existing = selected.GetComponentsInChildren<Collider>(true);
            if (existing.Any(c => c != null && c.enabled && !c.isTrigger))
            {
                EditorUtility.DisplayDialog("UCENO targeting collider", "This interactable already has an enabled, non-trigger collider.", "OK");
                return;
            }
            Renderer[] renderers = selected.GetComponentsInChildren<Renderer>(true)
                .Where(r => r != null && r.enabled).ToArray();
            if (renderers.Length == 0)
                throw new InvalidOperationException("No enabled renderers were found beneath the selected interactable.");
            Bounds bounds = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++) bounds.Encapsulate(renderers[i].bounds);
            Vector3 min = new Vector3(float.PositiveInfinity, float.PositiveInfinity, float.PositiveInfinity);
            Vector3 max = new Vector3(float.NegativeInfinity, float.NegativeInfinity, float.NegativeInfinity);
            for (int x = -1; x <= 1; x += 2)
            for (int y = -1; y <= 1; y += 2)
            for (int z = -1; z <= 1; z += 2)
            {
                Vector3 corner = bounds.center + Vector3.Scale(bounds.extents, new Vector3(x, y, z));
                Vector3 local = selected.transform.InverseTransformPoint(corner);
                min = Vector3.Min(min, local);
                max = Vector3.Max(max, local);
            }
            BoxCollider box = selected.GetComponent<BoxCollider>();
            if (box == null) box = Undo.AddComponent<BoxCollider>(selected);
            else Undo.RecordObject(box, "Configure UCENO targeting collider");
            box.center = (min + max) * 0.5f;
            box.size = max - min;
            box.isTrigger = false;
            box.enabled = true;
            EditorUtility.SetDirty(box);
            EditorSceneManager.MarkSceneDirty(selected.scene);
            Debug.Log("UCENO created a non-trigger targeting collider for " + selected.name);
        }

        [MenuItem("GameObject/UCENO/Add Targeting Collider From Renderers", true)]
        private static bool ValidateTargetingCollider() =>
            Selection.activeGameObject != null && Selection.activeGameObject.GetComponent<WorldInteractable>() != null;

        [MenuItem("GameObject/UCENO/Mark Selected as Door", true)]
        [MenuItem("GameObject/UCENO/Mark Selected as Seat", true)]
        [MenuItem("GameObject/UCENO/Mark Selected as Usable Object", true)]
        [MenuItem("GameObject/UCENO/Mark Selected as Furniture", true)]
        [MenuItem("GameObject/UCENO/Mark Selected as Vehicle", true)]
        private static bool ValidateSelection() => Selection.activeGameObject != null;

        [MenuItem("UCENO/World/Export Current Scene Collision Map", false, 100)]
        private static void ExportCurrentScene()
        {
            try
            {
                string path = WorldCollisionGeometryExporter.Export(EditorSceneManager.GetActiveScene());
                EditorUtility.DisplayDialog("UCENO collision export", "Exported current scene geometry to:\n" + path, "OK");
            }
            catch (Exception error)
            {
                EditorUtility.DisplayDialog("UCENO collision export failed", error.Message, "OK");
                Debug.LogException(error);
            }
        }

        private static void Add(WorldInteractableKind kind)
        {
            GameObject selected = Selection.activeGameObject;
            if (selected == null) return;
            WorldInteractable marker = selected.GetComponent<WorldInteractable>();
            if (marker == null) marker = Undo.AddComponent<WorldInteractable>(selected);
            SerializedObject data = new SerializedObject(marker);
            data.FindProperty("kind").enumValueIndex = (int)kind;
            string globalId = GlobalObjectId.GetGlobalObjectIdSlow(selected).ToString();
            if (string.IsNullOrWhiteSpace(selected.scene.path) || string.IsNullOrWhiteSpace(globalId) || globalId == GlobalObjectId.Null.ToString())
                throw new InvalidOperationException("Save the scene and prefab instance before assigning a stable UCENO object ID.");
            using (SHA256 hash = SHA256.Create())
            {
                byte[] digest = hash.ComputeHash(Encoding.UTF8.GetBytes(globalId));
                data.FindProperty("objectId").stringValue = "scene:" + BitConverter.ToString(digest, 0, 16).Replace("-", "").ToLowerInvariant();
            }
            // Never assume the selected assembly root is a door hinge.
            if (kind == WorldInteractableKind.Door) data.FindProperty("doorPivot").objectReferenceValue = null;
            data.ApplyModifiedProperties();
            EditorUtility.SetDirty(marker);
            Selection.activeObject = marker;
        }
    }
}
#endif
