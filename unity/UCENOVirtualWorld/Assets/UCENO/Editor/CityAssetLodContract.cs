#if UNITY_EDITOR
using System.Collections.Generic;
using UnityEngine;

namespace UCENO.VirtualWorld.Editor
{
    /// <summary>
    /// One authoritative contract for imported city prefab LODs. Each prefab
    /// must contain at least three genuinely distinct, authored LOD levels.
    /// Every level must have valid mesh renderers and descending screen thresholds.
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

            LOD[] candidate = group.GetLODs();
            if (candidate == null || candidate.Length < MinimumLodCount) return false;

            var assignedRenderers = new HashSet<Renderer>();
            float previousThreshold = float.PositiveInfinity;

            foreach (LOD lod in candidate)
            {
                float threshold = lod.screenRelativeTransitionHeight;
                if (float.IsNaN(threshold) || float.IsInfinity(threshold) ||
                    threshold <= 0f || threshold >= previousThreshold)
                    return false;

                if (lod.renderers == null || lod.renderers.Length == 0)
                    return false;

                foreach (Renderer renderer in lod.renderers)
                {
                    if (renderer == null || !assignedRenderers.Add(renderer))
                        return false;
                    if (renderer.transform != prefab.transform &&
                        !renderer.transform.IsChildOf(prefab.transform))
                        return false;

                    Mesh mesh = renderer is SkinnedMeshRenderer skinned
                        ? skinned.sharedMesh
                        : renderer.GetComponent<MeshFilter>()?.sharedMesh;
                    if (mesh == null || mesh.vertexCount == 0 || mesh.subMeshCount == 0)
                        return false;
                }

                previousThreshold = threshold;
            }

            lods = candidate;
            return true;
        }
    }
}
#endif
