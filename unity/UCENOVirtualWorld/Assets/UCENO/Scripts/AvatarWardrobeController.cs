using System;
using System.Collections.Generic;
using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>
    /// Replaces modular skinned-mesh clothing while binding garment bones to the
    /// current avatar rig. Prefabs must be authored against the same Humanoid bone
    /// naming contract and registered in AvatarWardrobeCatalog.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class AvatarWardrobeController : MonoBehaviour
    {
        [SerializeField] private Animator avatarAnimator;
        [SerializeField] private Transform garmentRoot;
        [SerializeField] private AvatarWardrobeCatalog catalog;

        private readonly Dictionary<AvatarWardrobeSlot, GameObject> equippedObjects =
            new Dictionary<AvatarWardrobeSlot, GameObject>();
        private readonly Dictionary<AvatarWardrobeSlot, string> equippedIds =
            new Dictionary<AvatarWardrobeSlot, string>();
        private Dictionary<string, Transform> avatarBones;

        public event Action<AvatarWardrobeSlot, string> EquippedChanged;

        private void Awake()
        {
            if (avatarAnimator == null) avatarAnimator = GetComponentInChildren<Animator>();
            if (garmentRoot == null) garmentRoot = transform;
            if (catalog == null) catalog = Resources.Load<AvatarWardrobeCatalog>("UCENO/AvatarWardrobeCatalog");
            RebuildBoneMap();
        }

        public string GetEquippedId(AvatarWardrobeSlot slot) =>
            equippedIds.TryGetValue(slot, out string id) ? id : null;

        public bool TryEquip(string itemId, out string error)
        {
            error = null;
            if (catalog == null)
            {
                error = "Wardrobe catalog is not assigned.";
                return false;
            }
            if (!catalog.TryGet(itemId, out AvatarWardrobeItemDefinition item) ||
                !Enum.IsDefined(typeof(AvatarWardrobeSlot), item.slot))
            {
                error = "Wardrobe item is not in the local catalog.";
                return false;
            }
            if (equippedIds.TryGetValue(item.slot, out string alreadyEquipped) &&
                alreadyEquipped == item.itemId &&
                equippedObjects.TryGetValue(item.slot, out GameObject existingObject) && existingObject != null)
                return true;
            if (string.IsNullOrWhiteSpace(item.prefabResourcePath))
            {
                error = "Wardrobe item has no prefab resource path.";
                return false;
            }
            GameObject prefab = Resources.Load<GameObject>(item.prefabResourcePath);
            if (prefab == null)
            {
                error = "Wardrobe prefab is missing: " + item.prefabResourcePath;
                return false;
            }
            if (avatarAnimator == null || avatarAnimator.avatar == null || !avatarAnimator.avatar.isHuman)
            {
                error = "A valid Humanoid avatar rig is required.";
                return false;
            }

            GameObject instance = Instantiate(prefab, garmentRoot, false);
            instance.name = "Equipped_" + item.itemId;
            instance.transform.localPosition = Vector3.zero;
            instance.transform.localRotation = Quaternion.identity;
            instance.transform.localScale = Vector3.one;

            SkinnedMeshRenderer[] renderers = instance.GetComponentsInChildren<SkinnedMeshRenderer>(true);
            if (renderers.Length == 0)
            {
                Destroy(instance);
                error = "Wardrobe prefab must contain at least one SkinnedMeshRenderer.";
                return false;
            }

            if (avatarBones == null || avatarBones.Count == 0) RebuildBoneMap();
            foreach (SkinnedMeshRenderer renderer in renderers)
            {
                if (renderer.sharedMesh == null || renderer.bones == null || renderer.bones.Length == 0)
                {
                    Destroy(instance);
                    error = "Wardrobe mesh is missing its mesh or bone weights.";
                    return false;
                }

                Transform[] mappedBones = new Transform[renderer.bones.Length];
                for (int i = 0; i < renderer.bones.Length; i++)
                {
                    Transform sourceBone = renderer.bones[i];
                    if (sourceBone == null || !avatarBones.TryGetValue(sourceBone.name, out mappedBones[i]))
                    {
                        Destroy(instance);
                        error = "Avatar rig is missing garment bone: " +
                            (sourceBone == null ? "(null)" : sourceBone.name);
                        return false;
                    }
                }

                Transform mappedRoot = null;
                if (renderer.rootBone != null)
                    avatarBones.TryGetValue(renderer.rootBone.name, out mappedRoot);
                if (renderer.rootBone != null && mappedRoot == null)
                {
                    Destroy(instance);
                    error = "Avatar rig is missing the garment root bone.";
                    return false;
                }
                renderer.bones = mappedBones;
                renderer.rootBone = mappedRoot;
                renderer.updateWhenOffscreen = false;
            }

            if (equippedObjects.TryGetValue(item.slot, out GameObject previous) && previous != null)
                Destroy(previous);
            equippedObjects[item.slot] = instance;
            equippedIds[item.slot] = item.itemId;
            EquippedChanged?.Invoke(item.slot, item.itemId);
            return true;
        }

        public void Unequip(AvatarWardrobeSlot slot)
        {
            if (equippedObjects.TryGetValue(slot, out GameObject previous) && previous != null)
                Destroy(previous);
            equippedObjects.Remove(slot);
            equippedIds.Remove(slot);
            EquippedChanged?.Invoke(slot, null);
        }

        public void ApplyEquipped(IEnumerable<KeyValuePair<AvatarWardrobeSlot, string>> items)
        {
            if (items == null) return;
            Dictionary<AvatarWardrobeSlot, string> requested =
                new Dictionary<AvatarWardrobeSlot, string>();
            foreach (KeyValuePair<AvatarWardrobeSlot, string> item in items)
                requested[item.Key] = item.Value;

            foreach (AvatarWardrobeSlot slot in Enum.GetValues(typeof(AvatarWardrobeSlot)))
            {
                if (!requested.TryGetValue(slot, out string itemId) || string.IsNullOrEmpty(itemId))
                {
                    if (equippedIds.ContainsKey(slot)) Unequip(slot);
                    continue;
                }
                if (equippedIds.TryGetValue(slot, out string currentId) && currentId == itemId &&
                    equippedObjects.TryGetValue(slot, out GameObject current) && current != null)
                    continue;
                if (!TryEquip(itemId, out string error))
                    Debug.LogWarning("UCENO wardrobe item could not be applied (" + itemId + "): " + error);
            }
        }

        private void RebuildBoneMap()
        {
            avatarBones = new Dictionary<string, Transform>(StringComparer.Ordinal);
            Transform root = avatarAnimator != null ? avatarAnimator.transform : transform;
            foreach (Transform bone in root.GetComponentsInChildren<Transform>(true))
                if (!avatarBones.ContainsKey(bone.name)) avatarBones.Add(bone.name, bone);
        }
    }
}
