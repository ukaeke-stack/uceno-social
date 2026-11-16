#if UNITY_EDITOR
using System.Linq;
using UnityEngine;

namespace UCENO.VirtualWorld.Editor
{
    /// <summary>
    /// Single authored-LOD contract for imported city assets. Three authored
    /// levels are required; no importer-generated or procedural LOD fallback
    /// is accepted as a substitute.
    /// </summary>
    public static class CityAssetLodContract
    {
        public const int MinimumLodCount = 3;

        public static bool TryGetValidLods(GameObject prefab, out LOD[] lods)
        {
            lods = System.Array.Empty<LOD>();
            if (prefab == null) return false;

            LODGroup group = prefab.GetComponentInChildren<LODGroup>(true);
            if (group == null) return false;

            lods = group.GetLODs();
            return lods.Length >= MinimumLodCount &&
                lods.All(lod => lod.renderers != null && lod.renderers.Length > 0 &&
                    lod.renderers.All(renderer => renderer != null));
        }
    }
}
#endif
