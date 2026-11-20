using System;
using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>
    /// Per-avatar, runtime-safe appearance tinting. Uses MaterialPropertyBlock
    /// so player customization never instantiates materials or changes other avatars.
    /// Only semantically named material slots are recoloured; unknown slots are preserved.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class AvatarAppearanceProfile : MonoBehaviour
    {
        [Serializable]
        public struct Palette
        {
            public Color skin;
            public Color hair;
            public Color top;
            public Color trousers;
            public Color shoes;

            public static Palette Default => new Palette
            {
                skin = new Color(0.58f, 0.34f, 0.21f, 1f),
                hair = new Color(0.09f, 0.055f, 0.035f, 1f),
                top = new Color(0.12f, 0.28f, 0.48f, 1f),
                trousers = new Color(0.12f, 0.14f, 0.18f, 1f),
                shoes = new Color(0.075f, 0.06f, 0.05f, 1f)
            };
        }

        [SerializeField] private Palette palette = new Palette
        {
            skin = new Color(0.58f, 0.34f, 0.21f, 1f),
            hair = new Color(0.09f, 0.055f, 0.035f, 1f),
            top = new Color(0.12f, 0.28f, 0.48f, 1f),
            trousers = new Color(0.12f, 0.14f, 0.18f, 1f),
            shoes = new Color(0.075f, 0.06f, 0.05f, 1f)
        };

        public Palette CurrentPalette => palette;

        private void Awake()
        {
            Apply(palette);
        }

        public void Apply(Palette next)
        {
            palette = next;
            Renderer[] renderers = GetComponentsInChildren<Renderer>(true);
            foreach (Renderer renderer in renderers)
            {
                Material[] materials = renderer.sharedMaterials;
                for (int slot = 0; slot < materials.Length; slot++)
                {
                    Material material = materials[slot];
                    if (material == null) continue;
                    if (!TryResolveColor(material.name, palette, out Color tint)) continue;

                    MaterialPropertyBlock block = new MaterialPropertyBlock();
                    renderer.GetPropertyBlock(block, slot);
                    bool wroteColor = false;
                    if (material.HasProperty("_BaseColor"))
                    {
                        block.SetColor("_BaseColor", tint);
                        wroteColor = true;
                    }
                    if (material.HasProperty("_Color"))
                    {
                        block.SetColor("_Color", tint);
                        wroteColor = true;
                    }
                    if (wroteColor) renderer.SetPropertyBlock(block, slot);
                }
            }
        }

        private static bool TryResolveColor(string sourceName, Palette colors, out Color tint)
        {
            string name = sourceName.ToLowerInvariant();
            if (name.Contains("skin") || name.Contains("body") ||
                name.Contains("face") || name.Contains("head"))
                tint = colors.skin;
            else if (name.Contains("hair") || name.Contains("brow"))
                tint = colors.hair;
            else if (name.Contains("shirt") || name.Contains("top") ||
                     name.Contains("cloth") || name.Contains("jacket"))
                tint = colors.top;
            else if (name.Contains("pant") || name.Contains("trouser"))
                tint = colors.trousers;
            else if (name.Contains("shoe"))
                tint = colors.shoes;
            else
            {
                tint = Color.white;
                return false;
            }
            return true;
        }
    }
}
