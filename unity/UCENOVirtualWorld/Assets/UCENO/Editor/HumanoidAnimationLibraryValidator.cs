#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace UCENO.VirtualWorld.Editor
{
    /// <summary>
    /// Release gate for imported, retargeted Humanoid motion clips.
    /// Procedural posing, static imagery and generic non-humanoid clips do not qualify.
    /// </summary>
    public static class HumanoidAnimationLibraryValidator
    {
        private const string AnimationRoot = "Assets/UCENO/Animations/Imported";
        private const string BaseAvatarPath = "Assets/UCENO/Characters/Imported/UCENO_Default_Avatar.fbx";
        private const string ProvenancePath = AnimationRoot + "/animation-source-manifest.json";
        private static readonly string[] RequiredClips =
        {
            "idle", "walk", "run", "talk", "turn", "wave", "cheer", "dance", "interact", "sit"
        };

        [Serializable] private sealed class SourceManifest { public SourceRecord[] assets; }
        [Serializable] private sealed class SourceRecord
        {
            public string sourceFbx, sourceName, sourceUrl, license, attribution;
        }

        [MenuItem("UCENO/Validate Imported Humanoid Animation Library")]
        public static void Validate()
        {
            string[] modelGuids = AssetDatabase.FindAssets("t:Model", new[] { AnimationRoot });
            if (modelGuids.Length == 0)
                throw new InvalidOperationException("No imported animation FBXs found. Add licensed Humanoid FBXs under " + AnimationRoot + ".");

            Avatar baseAvatar = AssetDatabase.LoadAllAssetsAtPath(BaseAvatarPath).OfType<Avatar>()
                .FirstOrDefault(candidate => candidate != null && candidate.isHuman);
            if (baseAvatar == null)
                throw new InvalidOperationException("The UCENO base Humanoid Avatar is missing: " + BaseAvatarPath);

            if (!File.Exists(ProvenancePath))
                throw new InvalidOperationException("Animation source/licence manifest is missing: " + ProvenancePath);
            SourceManifest manifest = JsonUtility.FromJson<SourceManifest>(File.ReadAllText(ProvenancePath));
            if (manifest?.assets == null || manifest.assets.Length != modelGuids.Length)
                throw new InvalidOperationException("Animation source manifest must contain exactly one record per imported FBX.");

            var provenance = new Dictionary<string, SourceRecord>(StringComparer.Ordinal);
            foreach (SourceRecord record in manifest.assets)
            {
                if (record == null || string.IsNullOrWhiteSpace(record.sourceFbx) ||
                    string.IsNullOrWhiteSpace(record.sourceName) ||
                    !Uri.TryCreate(record.sourceUrl, UriKind.Absolute, out Uri sourceUri) ||
                    sourceUri.Scheme != Uri.UriSchemeHttps ||
                    string.IsNullOrWhiteSpace(record.license) || string.IsNullOrWhiteSpace(record.attribution))
                    throw new InvalidOperationException("Animation source manifest contains an incomplete or non-HTTPS provenance record.");
                if (!record.sourceFbx.StartsWith(AnimationRoot + "/", StringComparison.Ordinal) ||
                    !record.sourceFbx.EndsWith(".fbx", StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("Animation provenance path must point to an FBX under the imported animation folder: " + record.sourceFbx);
                if (provenance.ContainsKey(record.sourceFbx))
                    throw new InvalidOperationException("Duplicate animation provenance record: " + record.sourceFbx);
                provenance.Add(record.sourceFbx, record);
            }

            var importedPaths = new HashSet<string>(
                modelGuids.Select(AssetDatabase.GUIDToAssetPath), StringComparer.Ordinal);
            if (!new HashSet<string>(provenance.Keys, StringComparer.Ordinal).SetEquals(importedPaths))
                throw new InvalidOperationException("Animation provenance manifest must cover exactly the imported FBX files, with no missing or extra records.");

            var clips = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var errors = new List<string>();
            foreach (string guid in modelGuids)
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                if (!provenance.ContainsKey(path))
                    errors.Add(path + ": source URL, licence and attribution are not recorded.");

                var importer = AssetImporter.GetAtPath(path) as ModelImporter;
                if (importer == null) { errors.Add(path + ": not a ModelImporter asset."); continue; }
                if (importer.animationType != ModelImporterAnimationType.Human)
                    errors.Add(path + ": Rig > Animation Type must be Humanoid.");
                if (importer.avatarSetup != ModelImporterAvatarSetup.CopyFromOther || importer.sourceAvatar != baseAvatar)
                    errors.Add(path + ": Rig > Avatar Definition must reference the exact UCENO base Avatar.");

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
                    if (clipName.Length == 0) { errors.Add(path + ": an imported clip has an empty name."); continue; }
                    clips.Add(clipName);
                    if (clip.length <= 0f)
                        errors.Add(path + ": " + clipName + " has no playable duration.");
                    if (!clip.humanMotion)
                        errors.Add(path + ": " + clipName + " does not contain imported Humanoid motion.");
                    if (AnimationUtility.GetCurveBindings(clip).Length == 0 &&
                        AnimationUtility.GetObjectReferenceCurveBindings(clip).Length == 0)
                        errors.Add(path + ": " + clipName + " has no animation curves.");
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
                modelGuids.Length + " licensed FBX files, " + clips.Count +
                " actual clips with Humanoid motion, curves and exact base-Avatar retargeting.");
        }

        private static bool IsLoopingClip(string clipName)
        {
            string name = clipName.ToLowerInvariant();
            return name.Contains("idle") || name.Contains("walk") ||
                name.Contains("run") || name.Contains("talk") || name.Contains("dance");
        }
    }
}
#endif
