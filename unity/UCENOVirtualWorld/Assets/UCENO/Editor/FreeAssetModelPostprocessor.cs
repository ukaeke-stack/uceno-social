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
        private const string ImportedAnimationRoot = "Assets/UCENO/Animations/Imported/";
        private const string AvatarPath = "Assets/UCENO/Characters/Imported/UCENO_Default_Avatar.fbx";

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

            if (assetPath.StartsWith(ImportedAnimationRoot, System.StringComparison.Ordinal))
            {
                // Animation FBXs use the exact same Humanoid Avatar definition as
                // the production character, so Unity retargets motion onto its rig.
                Avatar sourceAvatar = null;
                foreach (Object asset in AssetDatabase.LoadAllAssetsAtPath(AvatarPath))
                {
                    if (asset is Avatar candidate && candidate.isHuman)
                    {
                        sourceAvatar = candidate;
                        break;
                    }
                }

                if (sourceAvatar == null)
                    Debug.LogError("UCENO animation import cannot find the source Humanoid Avatar at " + AvatarPath);

                importer.animationType = ModelImporterAnimationType.Human;
                importer.avatarSetup = ModelImporterAvatarSetup.CopyFromOther;
                importer.sourceAvatar = sourceAvatar;
                importer.importAnimation = true;
                importer.importBlendShapes = false;
                importer.optimizeMesh = false;
                importer.meshCompression = ModelImporterMeshCompression.Off;
                importer.importCameras = false;
                importer.importLights = false;

                ModelImporterClipAnimation[] animationClips = importer.defaultClipAnimations;
                for (int i = 0; i < animationClips.Length; i++)
                {
                    string clipName = animationClips[i].name.ToLowerInvariant();
                    bool looping = clipName.Contains("idle") || clipName.Contains("walk") ||
                        clipName.Contains("run") || clipName.Contains("talk") || clipName.Contains("jog") ||
                        clipName.Contains("strafe") || clipName.Contains("dance");
                    animationClips[i].loopTime = looping;
                    animationClips[i].loopPose = looping;
                }
                importer.clipAnimations = animationClips;
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
