using System.Linq;
using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>
    /// Shared crowd-animation quality policy for player and AI humanoids.
    /// Authored three-level mesh LODGroups control geometry; this component controls animation and visibility tiers.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class AvatarCrowdLod : MonoBehaviour
    {
        [SerializeField] private float fullDetailDistance = 24f;
        [SerializeField] private float crowdDetailDistance = 90f;
        [SerializeField] private float renderDistance = 150f;
        [SerializeField] private float reevaluateInterval = 0.25f;

        private Animator animator;
        private AvatarLocomotionDriver locomotion;
        private AvatarSocialExpressionDriver expressions;
        private Renderer[] renderers;
        private LODGroup meshLodGroup;
        private Camera targetCamera;
        private float nextEvaluation;
        private int currentTier = -1;

        private void Awake()
        {
            animator = GetComponentInChildren<Animator>(true);
            locomotion = GetComponentInChildren<AvatarLocomotionDriver>(true);
            expressions = GetComponentInChildren<AvatarSocialExpressionDriver>(true);
            renderers = GetComponentsInChildren<Renderer>(true);
            meshLodGroup = GetComponentInChildren<LODGroup>(true);
            if (meshLodGroup == null || meshLodGroup.GetLODs().Length < 3 ||
                meshLodGroup.GetLODs().Any(lod => lod.renderers == null || lod.renderers.Length == 0))
                Debug.LogError("UCENO human/AI avatar is missing its authored three-level mesh LODGroup.", this);
            targetCamera = Camera.main;
            ApplyTier(0);
        }

        private void LateUpdate()
        {
            if (Time.unscaledTime < nextEvaluation) return;
            nextEvaluation = Time.unscaledTime + Mathf.Max(0.1f, reevaluateInterval);

            if (targetCamera == null || !targetCamera.isActiveAndEnabled)
                targetCamera = Camera.main;
            if (targetCamera == null) return;

            float distance = Vector3.Distance(targetCamera.transform.position, transform.position);
            int tier = distance <= fullDetailDistance ? 0 :
                distance <= crowdDetailDistance ? 1 :
                distance <= renderDistance ? 2 : 3;
            if (tier != currentTier) ApplyTier(tier);
        }

        private void ApplyTier(int tier)
        {
            currentTier = tier;
            bool visible = tier < 3;
            bool animate = visible;
            bool facial = tier == 0;

            if (animator != null)
            {
                // Do not keep invisible distant crowds evaluating full Animator
                // graphs. Re-enable immediately when they return inside the
                // render horizon so both human and AI avatars recover normally.
                animator.enabled = visible;
                if (visible)
                {
                    animator.cullingMode = tier == 0
                        ? AnimatorCullingMode.AlwaysAnimate
                        : AnimatorCullingMode.CullUpdateTransforms;
                }
            }
            if (locomotion != null) locomotion.enabled = animate;
            if (expressions != null) expressions.enabled = facial;

            // Beyond the authored crowd horizon, hide the full skinned model.
            // Nearer tiers keep all renderers; an authored LODGroup takes
            // precedence naturally when low-poly mesh levels are supplied.
            foreach (Renderer renderer in renderers)
                if (renderer != null) renderer.enabled = visible;
        }
    }
}
