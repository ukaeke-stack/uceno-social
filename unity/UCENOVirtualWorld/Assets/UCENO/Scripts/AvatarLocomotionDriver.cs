using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>
    /// Drives imported Humanoid locomotion. Uses authored Animator clips when
    /// present; otherwise animates the imported avatar's real skeleton so an
    /// FBX without embedded takes remains fully playable.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class AvatarLocomotionDriver : MonoBehaviour
    {
        private static readonly int MoveSpeedHash = Animator.StringToHash("MoveSpeed");

        [SerializeField] private float dampTime = 0.12f;
        [SerializeField] private float walkCycleSpeed = 7.2f;
        [SerializeField] private float runCycleSpeed = 10.5f;
        [SerializeField] private float walkLegSwing = 25f;
        [SerializeField] private float runLegSwing = 42f;

        private Animator animator;
        private PlayerMotor motor;
        private Transform hips;
        private Transform chest;
        private Transform head;
        private Transform leftUpperLeg;
        private Transform rightUpperLeg;
        private Transform leftLowerLeg;
        private Transform rightLowerLeg;
        private Transform leftUpperArm;
        private Transform rightUpperArm;
        private Transform leftLowerArm;
        private Transform rightLowerArm;

        private Quaternion hipsBase;
        private Quaternion chestBase;
        private Quaternion headBase;
        private Quaternion leftUpperLegBase;
        private Quaternion rightUpperLegBase;
        private Quaternion leftLowerLegBase;
        private Quaternion rightLowerLegBase;
        private Quaternion leftUpperArmBase;
        private Quaternion rightUpperArmBase;
        private Quaternion leftLowerArmBase;
        private Quaternion rightLowerArmBase;
        private Vector3 hipsPositionBase;
        private float cycle;

        private bool UsesImportedController =>
            animator != null && animator.runtimeAnimatorController != null;

        private void Awake()
        {
            animator = GetComponent<Animator>();
            if (animator == null)
                animator = GetComponentInChildren<Animator>();

            motor = GetComponentInParent<PlayerMotor>();
            if (animator == null || animator.avatar == null || !animator.avatar.isHuman)
                return;

            hips = Bone(HumanBodyBones.Hips);
            chest = Bone(HumanBodyBones.Chest);
            if (chest == null) chest = Bone(HumanBodyBones.UpperChest);
            head = Bone(HumanBodyBones.Head);
            leftUpperLeg = Bone(HumanBodyBones.LeftUpperLeg);
            rightUpperLeg = Bone(HumanBodyBones.RightUpperLeg);
            leftLowerLeg = Bone(HumanBodyBones.LeftLowerLeg);
            rightLowerLeg = Bone(HumanBodyBones.RightLowerLeg);
            leftUpperArm = Bone(HumanBodyBones.LeftUpperArm);
            rightUpperArm = Bone(HumanBodyBones.RightUpperArm);
            leftLowerArm = Bone(HumanBodyBones.LeftLowerArm);
            rightLowerArm = Bone(HumanBodyBones.RightLowerArm);

            hipsBase = BaseRotation(hips);
            chestBase = BaseRotation(chest);
            headBase = BaseRotation(head);
            leftUpperLegBase = BaseRotation(leftUpperLeg);
            rightUpperLegBase = BaseRotation(rightUpperLeg);
            leftLowerLegBase = BaseRotation(leftLowerLeg);
            rightLowerLegBase = BaseRotation(rightLowerLeg);
            leftUpperArmBase = BaseRotation(leftUpperArm);
            rightUpperArmBase = BaseRotation(rightUpperArm);
            leftLowerArmBase = BaseRotation(leftLowerArm);
            rightLowerArmBase = BaseRotation(rightLowerArm);
            if (hips != null) hipsPositionBase = hips.localPosition;
        }

        private void Update()
        {
            if (animator == null || motor == null)
                return;

            if (UsesImportedController)
                animator.SetFloat(MoveSpeedHash, motor.AnimationSpeed, dampTime, Time.deltaTime);
        }

        private void LateUpdate()
        {
            if (UsesImportedController || animator == null || motor == null)
                return;

            float speed = motor.AnimationSpeed;
            float sprint = motor.IsSprinting ? 1f : 0f;
            float amplitude = Mathf.Lerp(walkLegSwing, runLegSwing, sprint) * speed;
            float frequency = Mathf.Lerp(walkCycleSpeed, runCycleSpeed, sprint);
            cycle += Time.deltaTime * frequency * Mathf.Lerp(0.15f, 1f, speed);

            float swing = Mathf.Sin(cycle) * amplitude;
            float opposite = -swing;
            float kneeLeft = Mathf.Max(0f, -Mathf.Sin(cycle)) * amplitude * 0.65f;
            float kneeRight = Mathf.Max(0f, Mathf.Sin(cycle)) * amplitude * 0.65f;
            float armSwing = swing * 0.58f;
            float bob = Mathf.Abs(Mathf.Sin(cycle * 2f)) * 0.025f * speed;
            float idleBreath = Mathf.Sin(Time.time * 1.35f) * 1.1f * (1f - speed);

            SetRotation(hips, hipsBase, new Vector3(0f, 0f, idleBreath));
            SetRotation(chest, chestBase, new Vector3(0f, 0f, -idleBreath));
            SetRotation(head, headBase, new Vector3(0f, 0f, idleBreath * -0.35f));
            SetRotation(leftUpperLeg, leftUpperLegBase, new Vector3(swing, 0f, 0f));
            SetRotation(rightUpperLeg, rightUpperLegBase, new Vector3(opposite, 0f, 0f));
            SetRotation(leftLowerLeg, leftLowerLegBase, new Vector3(kneeLeft, 0f, 0f));
            SetRotation(rightLowerLeg, rightLowerLegBase, new Vector3(kneeRight, 0f, 0f));
            SetRotation(leftUpperArm, leftUpperArmBase, new Vector3(-armSwing, 0f, 0f));
            SetRotation(rightUpperArm, rightUpperArmBase, new Vector3(armSwing, 0f, 0f));
            SetRotation(leftLowerArm, leftLowerArmBase, new Vector3(8f + Mathf.Abs(armSwing) * 0.18f, 0f, 0f));
            SetRotation(rightLowerArm, rightLowerArmBase, new Vector3(8f + Mathf.Abs(armSwing) * 0.18f, 0f, 0f));

            if (hips != null)
                hips.localPosition = hipsPositionBase + Vector3.up * bob;
        }

        private Transform Bone(HumanBodyBones bone)
        {
            return animator != null ? animator.GetBoneTransform(bone) : null;
        }

        private static Quaternion BaseRotation(Transform bone)
        {
            return bone != null ? bone.localRotation : Quaternion.identity;
        }

        private static void SetRotation(Transform bone, Quaternion baseRotation, Vector3 eulerOffset)
        {
            if (bone != null)
                bone.localRotation = baseRotation * Quaternion.Euler(eulerOffset);
        }
    }
}
