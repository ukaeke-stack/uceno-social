#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

namespace UCENO.VirtualWorld.Editor
{
    /// <summary>
    /// Applies predictable Unity import settings to externally sourced models.
    /// Character assets are imported as Unity Humanoids so later professional
    /// replacements can use the same movement and animation layer.
    /// </summary>
    public sealed class FreeAssetModelPostprocessor : AssetPostprocessor
    {
        private const string CharacterRoot = "Assets/UCENO/Characters/Imported/";
        private const string EnvironmentRoot = "Assets/UCENO/Environment/Imported/";

        private void OnPreprocessModel()
        {
            if (!(assetImporter is ModelImporter importer))
                return;

            if (assetPath.StartsWith(CharacterRoot, System.StringComparison.Ordinal))
            {
                importer.animationType = ModelImporterAnimationType.Human;
                importer.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
                importer.importAnimation = true;
                importer.importBlendShapes = true;
                importer.optimizeMesh = true;
                importer.meshCompression = ModelImporterMeshCompression.Medium;
                importer.importCameras = false;
                importer.importLights = false;
                return;
            }

            if (assetPath.StartsWith(EnvironmentRoot, System.StringComparison.Ordinal))
            {
                importer.animationType = ModelImporterAnimationType.None;
                importer.importAnimation = false;
                importer.optimizeMesh = true;
                importer.meshCompression = ModelImporterMeshCompression.Medium;
                importer.importCameras = false;
                importer.importLights = false;
                importer.isReadable = false;
            }
        }
    }
}
#endif
