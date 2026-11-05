using System.Collections.Generic;
using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>
    /// Lightweight social presence layer for imported Humanoid avatars.
    /// Supports optional head-look targets and mesh-authored blink blendshapes.
    /// It does not require a particular face rig or allocate materials.
    /// </summary>
    [DisallowMultipleComponent]
    [DefaultExecutionOrder(100)]
    public sealed class AvatarSocialExpressionDriver : MonoBehaviour
    {
        [SerializeField] private float headTurnSpeed = 5f;
        [SerializeField] private float maxYaw = 32f;
        [SerializeField] private float maxPitch = 18f;
        [SerializeField] private float blinkIntervalMin = 2.4f;
        [SerializeField] private float blinkIntervalMax = 5.8f;
        [SerializeField] private float blinkDuration = 0.14f;
        [SerializeField] private float idleHeadYaw = 2.2f;
        [SerializeField] private float idleHeadPitch = 1.1f;

        private Transform head;
        private Quaternion headBaseRotation;
        private Transform lookTarget;
        private readonly List<BlendShapeChannel> blinkChannels = new List<BlendShapeChannel>();
        private float nextBlinkAt;
        private float blinkStartedAt = -1f;
        private bool blinking;

        private sealed class BlendShapeChannel
        {
            public SkinnedMeshRenderer renderer;
            public int index;
            public float originalWeight;
        }

        public void SetLookTarget(Transform target)
        {
            lookTarget = target == transform ? null : target;
        }

        public void ClearLookTarget()
        {
            lookTarget = null;
        }

        private void Awake()
        {
            Animator animator = GetComponent<Animator>();
            if (animator == null) animator = GetComponentInChildren<Animator>();
            if (animator != null && animator.avatar != null && animator.avatar.isHuman)
                head = animator.GetBoneTransform(HumanBodyBones.Head);

            if (head != null) headBaseRotation = head.localRotation;
            CacheBlinkChannels();
            ScheduleNextBlink();
        }

        private void LateUpdate()
        {
            UpdateHeadLook();
            UpdateBlink();
        }

        private void UpdateHeadLook()
        {
            if (head == null) return;

            float yaw = Mathf.Sin(Time.time * 0.43f) * idleHeadYaw;
            float pitch = Mathf.Sin(Time.time * 0.61f + 0.8f) * idleHeadPitch;

            if (lookTarget != null)
            {
                Vector3 direction = lookTarget.position - head.position;
                if (direction.sqrMagnitude > 0.001f)
                {
                    Vector3 localDirection = transform.InverseTransformDirection(direction.normalized);
                    float targetYaw = Mathf.Atan2(localDirection.x, localDirection.z) * Mathf.Rad2Deg;
                    float targetPitch = -Mathf.Atan2(localDirection.y,
                        new Vector2(localDirection.x, localDirection.z).magnitude) * Mathf.Rad2Deg;
                    yaw = Mathf.Clamp(targetYaw, -maxYaw, maxYaw);
                    pitch = Mathf.Clamp(targetPitch, -maxPitch, maxPitch);
                }
            }

            Quaternion targetRotation = headBaseRotation * Quaternion.Euler(pitch, yaw, 0f);
            head.localRotation = Quaternion.Slerp(
                head.localRotation, targetRotation, 1f - Mathf.Exp(-headTurnSpeed * Time.deltaTime));
        }

        private void CacheBlinkChannels()
        {
            foreach (SkinnedMeshRenderer skin in GetComponentsInChildren<SkinnedMeshRenderer>(true))
            {
                if (skin.sharedMesh == null) continue;
                Mesh mesh = skin.sharedMesh;
                for (int i = 0; i < mesh.blendShapeCount; i++)
                {
                    string shapeName = mesh.GetBlendShapeName(i).ToLowerInvariant();
                    if (!shapeName.Contains("blink") && !shapeName.Contains("eyeclose") &&
                        !shapeName.Contains("eye_close")) continue;

                    blinkChannels.Add(new BlendShapeChannel
                    {
                        renderer = skin,
                        index = i,
                        originalWeight = skin.GetBlendShapeWeight(i)
                    });
                }
            }
        }

        private void UpdateBlink()
        {
            if (blinkChannels.Count == 0) return;

            if (!blinking && Time.time >= nextBlinkAt)
            {
                blinking = true;
                blinkStartedAt = Time.time;
            }

            if (!blinking) return;

            float progress = Mathf.Clamp01((Time.time - blinkStartedAt) / Mathf.Max(0.04f, blinkDuration));
            float weight = Mathf.Sin(progress * Mathf.PI) * 100f;
            foreach (BlendShapeChannel channel in blinkChannels)
            {
                if (channel.renderer != null)
                    channel.renderer.SetBlendShapeWeight(channel.index,
                        Mathf.Lerp(channel.originalWeight, 100f, weight / 100f));
            }

            if (progress >= 1f)
            {
                foreach (BlendShapeChannel channel in blinkChannels)
                {
                    if (channel.renderer != null)
                        channel.renderer.SetBlendShapeWeight(channel.index, channel.originalWeight);
                }
                blinking = false;
                ScheduleNextBlink();
            }
        }

        private void ScheduleNextBlink()
        {
            nextBlinkAt = Time.time + Random.Range(
                Mathf.Max(0.8f, blinkIntervalMin), Mathf.Max(blinkIntervalMin + 0.1f, blinkIntervalMax));
        }
    }
}
