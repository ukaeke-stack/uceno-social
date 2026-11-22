using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;

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
        private readonly Dictionary<string, GameObject> addressablePrefabs =
            new Dictionary<string, GameObject>(StringComparer.Ordinal);
        private readonly Dictionary<string, AsyncOperationHandle<GameObject>> addressableHandles =
            new Dictionary<string, AsyncOperationHandle<GameObject>>(StringComparer.Ordinal);
        private Dictionary<string, Transform> avatarBones;
        private readonly HashSet<string> ambiguousAvatarBones = new HashSet<string>(StringComparer.Ordinal);

        public event Action<AvatarWardrobeSlot, string> EquippedChanged;

        private void Awake()
        {
            if (avatarAnimator == null) avatarAnimator = GetComponentInChildren<Animator>();
            if (avatarAnimator == null) avatarAnimator = GetComponentInParent<Animator>();
            if (garmentRoot == null) garmentRoot = avatarAnimator != null ? avatarAnimator.transform : transform;
            if (catalog == null) catalog = Resources.Load<AvatarWardrobeCatalog>("UCENO/AvatarWardrobeCatalog");
            RebuildBoneMap();
        }

        public string GetEquippedId(AvatarWardrobeSlot slot) =>
            equippedIds.TryGetValue(slot, out string id) ? id : null;

        public bool TryEquip(string itemId, out string error) =>
            TryEquip(itemId, null, out error);

        public bool TryEquip(string itemId, string expectedPrefabKey, out string error)
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
            if (!string.IsNullOrEmpty(expectedPrefabKey) &&
                !string.Equals(item.addressableKey, expectedPrefabKey, StringComparison.Ordinal) &&
                !string.Equals(item.prefabResourcePath, expectedPrefabKey, StringComparison.Ordinal))
            {
                error = "The local wardrobe asset key does not match the server catalogue.";
                return false;
            }
            if (equippedIds.TryGetValue(item.slot, out string alreadyEquipped) &&
                alreadyEquipped == item.itemId &&
                equippedObjects.TryGetValue(item.slot, out GameObject existingObject) && existingObject != null)
                return true;
            GameObject prefab = null;
            if (!addressablePrefabs.TryGetValue(item.itemId, out prefab))
            {
                if (string.IsNullOrWhiteSpace(item.prefabResourcePath))
                {
                    error = "Wardrobe item has no loaded Addressables asset or legacy resource path.";
                    return false;
                }
                prefab = Resources.Load<GameObject>(item.prefabResourcePath);
            }
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
                if (renderer.sharedMesh == null || renderer.bones == null || renderer.bones.Length == 0 ||
                    renderer.sharedMesh.bindposes == null || renderer.sharedMesh.bindposes.Length != renderer.bones.Length ||
                    renderer.rootBone == null)
                {
                    Destroy(instance);
                    error = "Wardrobe mesh must have matching bind poses, bones and a root bone.";
                    return false;
                }

                Transform[] mappedBones = new Transform[renderer.bones.Length];
                HashSet<string> garmentBoneNames = new HashSet<string>(StringComparer.Ordinal);
                Matrix4x4[] bindposes = renderer.sharedMesh.bindposes;
                for (int poseIndex = 0; poseIndex < bindposes.Length; poseIndex++)
                {
                    Matrix4x4 pose = bindposes[poseIndex];
                    for (int element = 0; element < 16; element++)
                    {
                        float value = pose[element];
                        if (float.IsNaN(value) || float.IsInfinity(value))
                        {
                            Destroy(instance);
                            error = "Wardrobe mesh contains a non-finite bind pose.";
                            return false;
                        }
                    }
                }
                for (int i = 0; i < renderer.bones.Length; i++)
                {
                    Transform sourceBone = renderer.bones[i];
                    if (sourceBone == null || !garmentBoneNames.Add(sourceBone.name) ||
                        ambiguousAvatarBones.Contains(sourceBone.name) ||
                        !avatarBones.TryGetValue(sourceBone.name, out mappedBones[i]))
                    {
                        Destroy(instance);
                        error = "Garment or avatar rig has a duplicate, missing or ambiguous bone: " +
                            (sourceBone == null ? "(null)" : sourceBone.name);
                        return false;
                    }
                }

                Transform mappedRoot = null;
                if (renderer.rootBone != null && !ambiguousAvatarBones.Contains(renderer.rootBone.name))
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

            string previousItemId = equippedIds.TryGetValue(item.slot, out string previousId)
                ? previousId : null;
            if (equippedObjects.TryGetValue(item.slot, out GameObject previous) && previous != null)
                Destroy(previous);
            equippedObjects[item.slot] = instance;
            equippedIds[item.slot] = item.itemId;
            if (!string.IsNullOrEmpty(previousItemId) && previousItemId != item.itemId)
                StartCoroutine(ReleaseAddressableWhenUnused(previousItemId));
            EquippedChanged?.Invoke(item.slot, item.itemId);
            return true;
        }

        /// <summary>
        /// Loads a wardrobe prefab from the remote catalog using an immutable versioned key.
        /// The completed asset handle remains retained while any slot uses the item and is
        /// released one frame after its last instance is removed.
        /// </summary>
        public void EquipAddressable(string itemId, string expectedAddressableKey, int assetVersion,
            Action<bool, string> completed)
        {
            StartCoroutine(EquipAddressableRoutine(itemId, expectedAddressableKey, assetVersion, completed));
        }

        private IEnumerator EquipAddressableRoutine(string itemId, string expectedAddressableKey,
            int assetVersion, Action<bool, string> completed)
        {
            if (catalog == null || !catalog.TryGet(itemId, out AvatarWardrobeItemDefinition item) ||
                !Enum.IsDefined(typeof(AvatarWardrobeSlot), item.slot))
            {
                completed?.Invoke(false, "Wardrobe item is not in the local catalog.");
                yield break;
            }
            if (assetVersion < 1 || string.IsNullOrWhiteSpace(item.addressableKey) ||
                !string.Equals(item.addressableKey, expectedAddressableKey, StringComparison.Ordinal))
            {
                completed?.Invoke(false, "Wardrobe Addressables key or asset version is invalid.");
                yield break;
            }
            if (addressablePrefabs.TryGetValue(item.itemId, out GameObject cached) && cached != null)
            {
                bool equipped = TryEquip(itemId, expectedAddressableKey, out string cachedError);
                completed?.Invoke(equipped, cachedError);
                yield break;
            }

            string versionedKey = expectedAddressableKey + "@v" +
                assetVersion.ToString(System.Globalization.CultureInfo.InvariantCulture);
            AsyncOperationHandle<GameObject> handle = Addressables.LoadAssetAsync<GameObject>(versionedKey);
            yield return handle;
            if (handle.Status != AsyncOperationStatus.Succeeded || handle.Result == null)
            {
                if (handle.IsValid()) Addressables.Release(handle);
                completed?.Invoke(false, "Versioned wardrobe asset could not be loaded: " + versionedKey);
                yield break;
            }

            addressablePrefabs[item.itemId] = handle.Result;
            addressableHandles[item.itemId] = handle;
            if (!TryEquip(itemId, expectedAddressableKey, out string error))
            {
                addressablePrefabs.Remove(item.itemId);
                addressableHandles.Remove(item.itemId);
                if (handle.IsValid()) Addressables.Release(handle);
                completed?.Invoke(false, error);
                yield break;
            }
            completed?.Invoke(true, null);
        }

        private void OnDestroy()
        {
            foreach (AsyncOperationHandle<GameObject> handle in addressableHandles.Values)
                if (handle.IsValid()) Addressables.Release(handle);
            addressableHandles.Clear();
            addressablePrefabs.Clear();
        }

        public void Unequip(AvatarWardrobeSlot slot)
        {
            string previousItemId = equippedIds.TryGetValue(slot, out string previousId)
                ? previousId : null;
            if (equippedObjects.TryGetValue(slot, out GameObject previous) && previous != null)
                Destroy(previous);
            equippedObjects.Remove(slot);
            equippedIds.Remove(slot);
            if (!string.IsNullOrEmpty(previousItemId))
                StartCoroutine(ReleaseAddressableWhenUnused(previousItemId));
            EquippedChanged?.Invoke(slot, null);
        }

        private IEnumerator ReleaseAddressableWhenUnused(string itemId)
        {
            // Destroy is deferred until the end of the frame. Keep the prefab handle
            // alive through that boundary, then release it if no slot still uses it.
            yield return null;
            if (equippedIds.ContainsValue(itemId)) yield break;
            addressablePrefabs.Remove(itemId);
            if (addressableHandles.TryGetValue(itemId, out AsyncOperationHandle<GameObject> handle))
            {
                addressableHandles.Remove(itemId);
                if (handle.IsValid()) Addressables.Release(handle);
            }
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
            ambiguousAvatarBones.Clear();
            Transform root = avatarAnimator != null ? avatarAnimator.transform : transform;
            foreach (Transform bone in root.GetComponentsInChildren<Transform>(true))
            {
                if (string.IsNullOrEmpty(bone.name) || ambiguousAvatarBones.Contains(bone.name)) continue;
                if (avatarBones.ContainsKey(bone.name))
                {
                    avatarBones.Remove(bone.name);
                    ambiguousAvatarBones.Add(bone.name);
                }
                else avatarBones.Add(bone.name, bone);
            }
        }
    }
}
