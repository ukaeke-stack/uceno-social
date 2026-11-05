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
                ModelImporterClipAnimation[] clips = importer.defaultClipAnimations;
                for (int i = 0; i < clips.Length; i++)
                {
                    string clipName = clips[i].name.ToLowerInvariant();
                    if (clipName.Contains("idle") || clipName.Contains("walk") ||
                        clipName.Contains("run") || clipName.Contains("strafe"))
                    {
                        clips[i].loopTime = true;
                        clips[i].loopPose = true;
                    }
                }
                importer.clipAnimations = clips;
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
