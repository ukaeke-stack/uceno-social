#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace UCENO.VirtualWorld.Editor
{
    /// <summary>
    /// Audits imported Humanoid avatar compatibility before animation/wardrobe
    /// assets are accepted. Facial blendshapes are reported as capabilities,
    /// not fabricated when an authored face rig does not provide them.
    /// </summary>
    public static class AvatarRigCompatibilityValidator
    {
        private const string AvatarPath = "Assets/UCENO/Characters/Imported/UCENO_Default_Avatar.fbx";
        private static readonly HumanBodyBones[] RequiredBones =
        {
            HumanBodyBones.Hips, HumanBodyBones.Spine, HumanBodyBones.Head,
            HumanBodyBones.LeftUpperArm, HumanBodyBones.RightUpperArm,
            HumanBodyBones.LeftUpperLeg, HumanBodyBones.RightUpperLeg
        };

        [MenuItem("UCENO/Validate Avatar Rig and Face Compatibility")]
        public static void Validate()
        {
            GameObject model = AssetDatabase.LoadAssetAtPath<GameObject>(AvatarPath);
            Require(model != null, "Imported base avatar model is missing: " + AvatarPath);

            Avatar avatar = AssetDatabase.LoadAllAssetsAtPath(AvatarPath)
                .OfType<Avatar>().FirstOrDefault(candidate => candidate != null);
            Require(avatar != null && avatar.isValid && avatar.isHuman,
                "Base avatar must import as a valid Humanoid Avatar.");

            var animator = model.GetComponentInChildren<Animator>(true);
            Require(animator != null, "Base avatar has no Animator component.");
            Require(animator.avatar != null && animator.avatar.isValid && animator.avatar.isHuman,
                "Base avatar Animator is not bound to a valid Humanoid Avatar.");

            var missingBones = RequiredBones.Where(bone => animator.avatar.GetBoneTransform(bone) == null)
                .Select(bone => bone.ToString()).ToArray();
            Require(missingBones.Length == 0,
                "Base avatar is missing required Humanoid bones: " + string.Join(", ", missingBones));

            var renderers = model.GetComponentsInChildren<SkinnedMeshRenderer>(true);
            Require(renderers.Length > 0, "Base avatar contains no skinned mesh renderers.");

            var errors = new List<string>();
            var faceCapabilities = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            int totalBlendShapes = 0;
            foreach (SkinnedMeshRenderer renderer in renderers)
            {
                if (renderer.sharedMesh == null)
                {
                    errors.Add(renderer.name + " has no skinned mesh.");
                    continue;
                }
                if (renderer.bones == null || renderer.bones.Length == 0)
                    errors.Add(renderer.name + " has no skinning bone references.");
                else
                {
                    foreach (Transform bone in renderer.bones)
                        if (bone == null)
                            errors.Add(renderer.name + " contains a null skinning bone reference.");
                    if (renderer.rootBone == null)
                        errors.Add(renderer.name + " has no root bone.");
                }

                Mesh mesh = renderer.sharedMesh;
                totalBlendShapes += mesh.blendShapeCount;
                for (int i = 0; i < mesh.blendShapeCount; i++)
                {
                    string shape = mesh.GetBlendShapeName(i);
                    if (shape.IndexOf("blink", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        shape.IndexOf("eye_close", StringComparison.OrdinalIgnoreCase) >= 0)
                        faceCapabilities.Add("blink");
                    if (shape.IndexOf("smile", StringComparison.OrdinalIgnoreCase) >= 0)
                        faceCapabilities.Add("smile");
                    if (shape.IndexOf("jaw", StringComparison.OrdinalIgnoreCase) >= 0 ||
                        shape.IndexOf("mouth", StringComparison.OrdinalIgnoreCase) >= 0)
                        faceCapabilities.Add("mouth");
                }
            }

            Require(errors.Count == 0, string.Join("\n- ", errors));
            string faceReport = faceCapabilities.Count == 0
                ? "no authored facial blendshape channels detected"
                : "facial channels: " + string.Join(", ", faceCapabilities.OrderBy(x => x));
            Debug.Log("UCENO avatar rig compatibility passed: valid Humanoid skeleton, " +
                renderers.Length + " skinned renderers, " + totalBlendShapes +
                " blendshapes; " + faceReport + ". Facial capability reporting does not replace visual review.");
        }

        private static void Require(bool condition, string message)
        {
            if (!condition) throw new InvalidOperationException("Avatar rig compatibility failed: " + message);
        }
    }
}
#endif
