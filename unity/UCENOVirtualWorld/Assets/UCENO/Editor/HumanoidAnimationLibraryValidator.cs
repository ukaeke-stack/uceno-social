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

                foreach (var clip in importer.defaultClipAnimations)
                {
                    if (string.IsNullOrWhiteSpace(clip.name)) continue;
                    clips.Add(clip.name.Trim());
                    if (IsLoopingClip(clip.name) && !clip.loopTime)
                        errors.Add(path + ": " + clip.name + " must have Loop Time enabled.");
                }
            }

            foreach (string required in RequiredClips)
                if (!clips.Any(name => name.IndexOf(required, StringComparison.OrdinalIgnoreCase) >= 0))
                    errors.Add("Missing imported clip: " + required);

            if (errors.Count > 0)
                throw new InvalidOperationException("Humanoid animation library is not release-ready:\n- " +
                    string.Join("\n- ", errors));
            Debug.Log("UCENO imported Humanoid animation library validated: " +
                modelGuids.Length + " FBX files, " + clips.Count + " clips.");
        }

        private static bool IsLoopingClip(string clipName)
        {
            string name = clipName.ToLowerInvariant();
            return name.Contains("idle") || name.Contains("walk") || name.Contains("run");
        }
    }
}
#endif
