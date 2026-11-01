using System;
using UnityEngine;

namespace UCENO.VirtualWorld
{
    public enum AvatarWardrobeSlot
    {
        Hair, Top, Outerwear, Bottom, Shoes, Accessory
    }

    [Serializable]
    public sealed class AvatarWardrobeItemDefinition
    {
        public string itemId;
        public string displayName;
        public AvatarWardrobeSlot slot;
        [Tooltip("Resources-relative path to a prefab containing skinned mesh renderers.")]
        public string prefabResourcePath;
    }

    [CreateAssetMenu(menuName = "UCENO/Avatar Wardrobe Catalog", fileName = "AvatarWardrobeCatalog")]
    public sealed class AvatarWardrobeCatalog : ScriptableObject
    {
        public AvatarWardrobeItemDefinition[] items = Array.Empty<AvatarWardrobeItemDefinition>();

        public bool TryGet(string itemId, out AvatarWardrobeItemDefinition definition)
        {
            definition = null;
            if (string.IsNullOrWhiteSpace(itemId) || items == null) return false;
            foreach (AvatarWardrobeItemDefinition item in items)
            {
                if (item != null && string.Equals(item.itemId, itemId, StringComparison.Ordinal))
                {
                    definition = item;
                    return true;
                }
            }
            return false;
        }
    }
}
