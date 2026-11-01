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
        [SerializeField] private float walkCycleSpeed = 6.4f;
        [SerializeField] private float runCycleSpeed = 9.2f;
        [SerializeField] private float walkLegSwing = 19f;
        [SerializeField] private float runLegSwing = 34f;
        [SerializeField] private float relaxedArmDrop = 58f;
        [SerializeField] private float armSwingFactor = 0.42f;

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
        private float gestureUntil;
        private int activeGesture;
        private bool wasSeated;
        private bool networkDriven;
        private float networkSpeed;
        private bool networkSeated;
        private bool networkSprinting;
        private int receivedGestureSequence;
        public int GestureSequence { get; private set; }
        public string GestureName { get; private set; } = "none";

        public void ApplyRemoteState(float speed, bool seated, bool sprinting, string gesture, int sequence)
        {
            networkDriven = true;
            networkSpeed = Mathf.Clamp01(speed);
            networkSeated = seated;
            networkSprinting = sprinting;
            string nextGesture = gesture ?? "none";
            if (sequence > receivedGestureSequence)
            {
                receivedGestureSequence = sequence;
                if (UsesImportedController)
                {
                    string trigger = nextGesture == "wave" ? "Wave" : nextGesture == "cheer" ? "Cheer" : null;
                    if (!string.IsNullOrEmpty(trigger))
                    {
                        foreach (AnimatorControllerParameter parameter in animator.parameters)
                            if (parameter.type == AnimatorControllerParameterType.Trigger && parameter.name == trigger)
                                animator.SetTrigger(trigger);
                    }
                }
                activeGesture = nextGesture == "wave" ? 1 : nextGesture == "cheer" ? 2 : 0;
                gestureUntil = Time.time + (activeGesture == 1 ? 1.8f : 1.6f);
            }
            GestureName = nextGesture;
            if (nextGesture == "none")
            {
                activeGesture = 0;
                gestureUntil = 0f;
            }
        }

        public void TriggerWave() { activeGesture = 1; GestureName = "wave"; GestureSequence++; gestureUntil = Time.time + 1.8f; }
        public void TriggerCheer() { activeGesture = 2; GestureName = "cheer"; GestureSequence++; gestureUntil = Time.time + 1.6f; }

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

            // Imported avatar is authored in a T-pose. Bring both arms down
            // into a relaxed stance before applying the walking swing.
            if (leftUpperArm != null)
                leftUpperArm.localRotation = leftUpperArmBase * Quaternion.Euler(0f, 0f, -relaxedArmDrop);
            if (rightUpperArm != null)
                rightUpperArm.localRotation = rightUpperArmBase * Quaternion.Euler(0f, 0f, relaxedArmDrop);
            if (leftLowerArm != null)
                leftLowerArm.localRotation = leftLowerArmBase * Quaternion.Euler(-8f, 0f, 0f);
            if (rightLowerArm != null)
                rightLowerArm.localRotation = rightLowerArmBase * Quaternion.Euler(-8f, 0f, 0f);

            if (hips != null) hipsPositionBase = hips.localPosition;
            ApplyNaturalAvatarColors();
        }

        private void Update()
        {
            if (animator == null)
                return;

            if (UsesImportedController)
            {
                float speed = motor != null ? motor.AnimationSpeed : networkSpeed;
                animator.SetFloat(MoveSpeedHash, speed, dampTime, Time.deltaTime);
                if (motor == null && networkDriven)
                {
                    foreach (AnimatorControllerParameter parameter in animator.parameters)
                        if (parameter.name == "IsSeated" && parameter.type == AnimatorControllerParameterType.Bool)
                            animator.SetBool(parameter.name, networkSeated);
                }
            }
        }

        private void LateUpdate()
        {
            if (UsesImportedController || animator == null || (motor == null && !networkDriven))
                return;

            bool seated = motor != null ? motor.IsSeated : networkSeated;
            float speed = motor != null ? motor.AnimationSpeed : networkSpeed;
            bool sprinting = motor != null ? motor.IsSprinting : networkSprinting;
            if (seated != wasSeated)
            {
                wasSeated = seated;
                if (wasSeated) { activeGesture = 0; gestureUntil = 0f; }
            }

            float sprint = sprinting ? 1f : 0f;
            float amplitude = Mathf.Lerp(walkLegSwing, runLegSwing, sprint) * speed;
            float frequency = Mathf.Lerp(walkCycleSpeed, runCycleSpeed, sprint);
            cycle += Time.deltaTime * frequency * Mathf.Lerp(0.15f, 1f, speed);

            float swing = Mathf.Sin(cycle) * amplitude;
            float opposite = -swing;
            float kneeLeft = Mathf.Max(0f, -Mathf.Sin(cycle)) * amplitude * 0.65f;
            float kneeRight = Mathf.Max(0f, Mathf.Sin(cycle)) * amplitude * 0.65f;
            float armSwing = swing * armSwingFactor;
            // Keep the root/hips stable; exaggerated vertical bob causes a floating look.
            float idleBreath = Mathf.Sin(Time.time * 1.35f) * 1.1f * (1f - speed);

            SetRotation(hips, hipsBase, new Vector3(0f, 0f, idleBreath));
            SetRotation(chest, chestBase, new Vector3(0f, 0f, -idleBreath));
            SetRotation(head, headBase, new Vector3(0f, 0f, idleBreath * -0.35f));
            SetRotation(leftUpperLeg, leftUpperLegBase, new Vector3(swing, 0f, 0f));
            SetRotation(rightUpperLeg, rightUpperLegBase, new Vector3(opposite, 0f, 0f));
            SetRotation(leftLowerLeg, leftLowerLegBase, new Vector3(kneeLeft, 0f, 0f));
            SetRotation(rightLowerLeg, rightLowerLegBase, new Vector3(kneeRight, 0f, 0f));
            if (leftUpperArm != null)
                leftUpperArm.localRotation = leftUpperArmBase *
                    Quaternion.Euler(-armSwing, 0f, -relaxedArmDrop);
            if (rightUpperArm != null)
                rightUpperArm.localRotation = rightUpperArmBase *
                    Quaternion.Euler(armSwing, 0f, relaxedArmDrop);
            SetRotation(leftLowerArm, leftLowerArmBase, new Vector3(-8f + Mathf.Abs(armSwing) * 0.12f, 0f, 0f));
            SetRotation(rightLowerArm, rightLowerArmBase, new Vector3(-8f + Mathf.Abs(armSwing) * 0.12f, 0f, 0f));

            if (seated)
            {
                // Procedural seated/rest pose for the imported humanoid.
                // This is a ground-rest pose; chair-specific IK is a later system.
                SetRotation(hips, hipsBase, new Vector3(-8f, 0f, 0f));
                SetRotation(chest, chestBase, new Vector3(8f, 0f, 0f));
                SetRotation(leftUpperLeg, leftUpperLegBase, new Vector3(-82f, 0f, -8f));
                SetRotation(rightUpperLeg, rightUpperLegBase, new Vector3(-82f, 0f, 8f));
                SetRotation(leftLowerLeg, leftLowerLegBase, new Vector3(92f, 0f, 0f));
                SetRotation(rightLowerLeg, rightLowerLegBase, new Vector3(92f, 0f, 0f));
                SetRotation(leftUpperArm, leftUpperArmBase, new Vector3(-18f, 0f, -relaxedArmDrop));
                SetRotation(rightUpperArm, rightUpperArmBase, new Vector3(-18f, 0f, relaxedArmDrop));
                SetRotation(leftLowerArm, leftLowerArmBase, new Vector3(-35f, 0f, 0f));
                SetRotation(rightLowerArm, rightLowerArmBase, new Vector3(-35f, 0f, 0f));
            }

            if (!seated && Time.time < gestureUntil)
            {
                float pulse = Mathf.Sin(Mathf.Clamp01((gestureUntil - Time.time) / 1.8f) * Mathf.PI);
                if (activeGesture == 1 && rightUpperArm != null)
                {
                    float wave = Mathf.Sin(Time.time * 13f) * 22f;
                    rightUpperArm.localRotation = rightUpperArmBase * Quaternion.Euler(-75f, wave, 15f);
                    SetRotation(rightLowerArm, rightLowerArmBase, new Vector3(-95f + wave * 0.25f, 0f, 0f));
                }
                else if (activeGesture == 2)
                {
                    if (leftUpperArm != null) leftUpperArm.localRotation = leftUpperArmBase * Quaternion.Euler(-105f, 0f, -18f);
                    if (rightUpperArm != null) rightUpperArm.localRotation = rightUpperArmBase * Quaternion.Euler(-105f, 0f, 18f);
                    SetRotation(chest, chestBase, new Vector3(-5f * pulse, 0f, 0f));
                }
            }
            else { activeGesture = 0; GestureName = "none"; }

            if (hips != null)
                hips.localPosition = hipsPositionBase;
        }


        private void ApplyNaturalAvatarColors()
        {
            if (animator == null) return;

            Color skin = new Color(0.58f, 0.34f, 0.21f, 1f);
            Color hair = new Color(0.09f, 0.055f, 0.035f, 1f);
            Color shirt = new Color(0.12f, 0.28f, 0.48f, 1f);
            Color trousers = new Color(0.12f, 0.14f, 0.18f, 1f);
            Color shoes = new Color(0.075f, 0.06f, 0.05f, 1f);

            foreach (Renderer renderer in animator.GetComponentsInChildren<Renderer>(true))
            {
                Material[] materials = renderer.sharedMaterials;
                if (materials == null || materials.Length == 0) continue;
                bool hasSemanticNames = false;
                foreach (Material candidate in materials)
                {
                    if (candidate == null) continue;
                    string candidateName = candidate.name.ToLowerInvariant();
                    if (candidateName.Contains("skin") || candidateName.Contains("body") ||
                        candidateName.Contains("face") || candidateName.Contains("head") ||
                        candidateName.Contains("hair") || candidateName.Contains("brow") ||
                        candidateName.Contains("shirt") || candidateName.Contains("cloth") ||
                        candidateName.Contains("pant") || candidateName.Contains("shoe"))
                    {
                        hasSemanticNames = true;
                        break;
                    }
                }

                for (int i = 0; i < materials.Length; i++)
                {
                    Material material = materials[i];
                    if (material == null) continue;
                    string materialName = material.name.ToLowerInvariant();
                    Color tint;

                    if (materialName.Contains("skin") || materialName.Contains("body") ||
                        materialName.Contains("face") || materialName.Contains("head"))
                        tint = skin;
                    else if (materialName.Contains("hair") || materialName.Contains("brow"))
                        tint = hair;
                    else if (materialName.Contains("shirt") || materialName.Contains("top") ||
                             materialName.Contains("cloth") || materialName.Contains("jacket"))
                        tint = shirt;
                    else if (materialName.Contains("pant") || materialName.Contains("trouser"))
                        tint = trousers;
                    else if (materialName.Contains("shoe"))
                        tint = shoes;
                    else if (hasSemanticNames)
                        continue;
                    else
                    {
                        // Some generated FBX files use generic material names.
                        // Give those slots a restrained human palette instead of
                        // leaving the entire character pure white.
                        switch (i)
                        {
                            case 0: tint = skin; break;
                            case 1: tint = shirt; break;
                            case 2: tint = trousers; break;
                            default: tint = i % 2 == 0 ? shoes : hair; break;
                        }
                    }

                    MaterialPropertyBlock block = new MaterialPropertyBlock();
                    renderer.GetPropertyBlock(block, i);
                    block.SetColor("_Color", tint);
                    block.SetColor("_BaseColor", tint);
                    renderer.SetPropertyBlock(block, i);
                }
            }
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
