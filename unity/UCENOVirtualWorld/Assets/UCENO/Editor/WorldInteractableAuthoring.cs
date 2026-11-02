#if UNITY_EDITOR
using System;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace UCENO.VirtualWorld.Editor
{
    /// <summary>
    /// Explicit authoring commands for real imported scene props. Nothing is
    /// auto-marked: a scene designer chooses the actual door, chair or object.
    /// </summary>
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
                string path = WorldCollisionGeometryExporter.Export(UnityEditor.SceneManagement.EditorSceneManager.GetActiveScene());
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
            string slug = new string(selected.name.ToLowerInvariant().Select(character =>
                char.IsLetterOrDigit(character) || "._:-".IndexOf(character) >= 0 ? character : '-').ToArray());
            data.FindProperty("objectId").stringValue = slug + "-" + Guid.NewGuid().ToString("N").Substring(0, 8);
            if (kind == WorldInteractableKind.Door)
                data.FindProperty("doorPivot").objectReferenceValue = selected.transform;
            data.ApplyModifiedProperties();
            EditorUtility.SetDirty(marker);
            Selection.activeObject = marker;
        }
    }
}
#endif
