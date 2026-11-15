#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace UCENO.VirtualWorld.Editor
{
    /// <summary>
    /// Release gate for imported, retargeted humanoid animation FBXs.
    /// The city/avatar pipeline must not count procedural bone posing as an animation library.
    /// </summary>
    public static class HumanoidAnimationLibraryValidator
    {
        private const string AnimationRoot = "Assets/UCENO/Animations/Imported";
        private const string BaseAvatarPath = "Assets/UCENO/Characters/Imported/UCENO_Default_Avatar.fbx";
        private static readonly string[] RequiredClips =
        {
            "idle", "walk", "run", "talk", "turn", "wave", "cheer", "dance", "interact", "sit"
        };

        [MenuItem("UCENO/Validate Imported Humanoid Animation Library")]
        public static void Validate()
        {
            string[] modelGuids = AssetDatabase.FindAssets("t:Model", new[] { AnimationRoot });
            if (modelGuids.Length == 0)
                throw new InvalidOperationException(
                    "No imported animation FBXs found. Add licensed Humanoid animation FBXs under " +
                    AnimationRoot + " and retarget them to the UCENO base Avatar before validation.");

            Avatar baseAvatar = AssetDatabase.LoadAllAssetsAtPath(BaseAvatarPath).OfType<Avatar>()
                .FirstOrDefault(candidate => candidate != null && candidate.isHuman);
            if (baseAvatar == null)
                throw new InvalidOperationException("The UCENO base Humanoid Avatar is missing: " + BaseAvatarPath);

            var clips = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var errors = new List<string>();
            foreach (string guid in modelGuids)
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                var importer = AssetImporter.GetAtPath(path) as ModelImporter;
                if (importer == null) { errors.Add(path + ": not a ModelImporter asset."); continue; }
                if (importer.animationType != ModelImporterAnimationType.Human)
                    errors.Add(path + ": Rig > Animation Type must be Humanoid.");
                if (importer.avatarSetup != ModelImporterAvatarSetup.CopyFromOther || importer.sourceAvatar != baseAvatar)
                    errors.Add(path + ": Rig > Avatar Definition must reference the exact UCENO base Avatar.");

                // Importer clip definitions alone are not proof that Unity has
                // produced usable AnimationClip sub-assets. Validate the actual
                // imported clips that an Animator can reference.
                AnimationClip[] importedClips = AssetDatabase.LoadAllAssetsAtPath(path)
                    .OfType<AnimationClip>()
                    .Where(clip => clip != null && !clip.name.StartsWith("__preview__", StringComparison.OrdinalIgnoreCase))
                    .ToArray();

                if (importedClips.Length == 0)
                {
                    errors.Add(path + ": no usable imported AnimationClip sub-assets were found.");
                    continue;
                }

                foreach (AnimationClip clip in importedClips)
                {
                    string clipName = clip.name == null ? string.Empty : clip.name.Trim();
                    if (clipName.Length == 0) continue;
                    clips.Add(clipName);
                    if (clip.length <= 0f)
                        errors.Add(path + ": " + clipName + " has no playable duration.");
                    if (IsLoopingClip(clipName) && !clip.isLooping)
                        errors.Add(path + ": " + clipName + " is not imported as a looping clip.");
                }
            }

            foreach (string required in RequiredClips)
                if (!clips.Any(name => name.IndexOf(required, StringComparison.OrdinalIgnoreCase) >= 0))
                    errors.Add("Missing imported clip: " + required);

            if (errors.Count > 0)
                throw new InvalidOperationException("Humanoid animation library is not release-ready:\n- " +
                    string.Join("\n- ", errors));
            Debug.Log("UCENO imported Humanoid animation library validated: " +
                modelGuids.Length + " FBX files, " + clips.Count +
                " actual imported AnimationClip sub-assets. Retargeting points to the UCENO base Avatar.");
        }

        private static bool IsLoopingClip(string clipName)
        {
            string name = clipName.ToLowerInvariant();
            return name.Contains("idle") || name.Contains("walk") || name.Contains("run");
        }
    }
}
#endif
