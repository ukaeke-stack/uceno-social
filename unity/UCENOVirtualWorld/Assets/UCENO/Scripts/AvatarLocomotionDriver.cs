using System;
using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>
    /// Drives a retargeted imported Humanoid Animator. No procedural bone posing
    /// or fallback gait is permitted: missing imported animation controllers are
    /// an asset/build error, not a reason to synthesize walking motion.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class AvatarLocomotionDriver : MonoBehaviour
    {
        private static readonly int MoveSpeedHash = Animator.StringToHash("MoveSpeed");
        private static readonly int IsSeatedHash = Animator.StringToHash("IsSeated");
        private static readonly int IsTalkingHash = Animator.StringToHash("IsTalking");

        [SerializeField, Min(0.01f)] private float dampTime = 0.12f;

        private Animator animator;
        private PlayerMotor motor;
        private float networkSpeed;
        private bool networkSeated;
        private int receivedGestureSequence;
        private float gestureUntil;
        private float lastYaw;
        private float accumulatedTurn;
        private float nextTurnAt;

        public int GestureSequence { get; private set; }
        public string GestureName { get; private set; } = "none";

        private void OnEnable()
        {
            // Only the local player has a PlayerMotor. Remote humanoids receive
            // their replicated talking state through ApplyRemoteState and must
            // never mirror this device's microphone activity.
            if (motor != null) WorldSpatialVoiceClient.LocalTransmitChanged += SetTalking;
        }

        private void OnDisable()
        {
            if (motor != null) WorldSpatialVoiceClient.LocalTransmitChanged -= SetTalking;
        }

        private void Awake()
        {
            animator = GetComponent<Animator>();
            if (animator == null) animator = GetComponentInChildren<Animator>();
            motor = GetComponentInParent<PlayerMotor>();

            if (animator == null || animator.avatar == null || !animator.avatar.isHuman)
            {
                Debug.LogError("UCENO avatar requires a valid Humanoid Animator.", this);
                enabled = false;
                return;
            }
            if (animator.runtimeAnimatorController == null)
            {
                Debug.LogError("UCENO avatar has no imported Humanoid Animator Controller. Procedural locomotion is disabled.", this);
                enabled = false;
                return;
            }

            animator.applyRootMotion = false;
            animator.cullingMode = AnimatorCullingMode.CullUpdateTransforms;
            lastYaw = motor != null ? motor.transform.eulerAngles.y : transform.eulerAngles.y;
            RequireParameter("MoveSpeed", AnimatorControllerParameterType.Float);
            RequireParameter("IsSeated", AnimatorControllerParameterType.Bool);
            RequireParameter("IsTalking", AnimatorControllerParameterType.Bool);
            foreach (string trigger in new[] { "Turn", "Wave", "Cheer", "Dance", "Interact" })
                RequireParameter(trigger, AnimatorControllerParameterType.Trigger);
        }

        private void Update()
        {
            if (!enabled || animator == null || animator.runtimeAnimatorController == null) return;
            float speed = motor != null ? motor.AnimationSpeed : networkSpeed;
            bool seated = motor != null ? motor.IsSeated : networkSeated;
            animator.SetFloat(MoveSpeedHash, Mathf.Clamp01(speed), dampTime, Time.deltaTime);
            animator.SetBool(IsSeatedHash, seated);
            if (motor != null) DetectTurn(speed);
        }

        private void LateUpdate()
        {
            if (Time.time >= gestureUntil && GestureName != "none")
            {
                if (GestureName == "talk") SetTalking(false);
                GestureName = "none";
            }
        }

        public void ApplyRemoteState(float speed, bool seated, bool sprinting, string gesture, int sequence)
        {
            networkSpeed = Mathf.Clamp01(speed);
            networkSeated = seated;
            if (sequence <= receivedGestureSequence) return;
            receivedGestureSequence = sequence;
            PlayGesture(gesture, false);
        }

        public void TriggerWave() { PlayGesture("wave", true); }
        public void TriggerCheer() { PlayGesture("cheer", true); }
        public void TriggerDance() { PlayGesture("dance", true); }
        public void TriggerTalk() { SetTalking(true); }
        public void TriggerTurn() { PlayGesture("turn", true); }
        public void TriggerInteract() { PlayGesture("interact", true); }

        public void SetTalking(bool talking)
        {
            if (animator == null || animator.runtimeAnimatorController == null) return;
            bool previous = HasParameter("IsTalking", AnimatorControllerParameterType.Bool) &&
                animator.GetBool(IsTalkingHash);
            if (previous == talking) return;
            animator.SetBool(IsTalkingHash, talking);
            GestureName = talking ? "talk" : "none";
            gestureUntil = talking ? float.PositiveInfinity : 0f;
            GestureSequence++;
        }

        private void DetectTurn(float speed)
        {
            float yaw = motor.transform.eulerAngles.y;
            float delta = Mathf.DeltaAngle(lastYaw, yaw);
            lastYaw = yaw;
            if (Mathf.Abs(delta) < 0.15f) return;
            accumulatedTurn += delta;
            if (Mathf.Abs(accumulatedTurn) >= 70f && speed < 0.7f && Time.time >= nextTurnAt)
            {
                PlayGesture("turn", true);
                accumulatedTurn = 0f;
                nextTurnAt = Time.time + 1.25f;
            }
        }

        private void PlayGesture(string gesture, bool local)
        {
            if (animator == null || animator.runtimeAnimatorController == null) return;
            string normalizedGesture = (gesture ?? string.Empty).Trim().ToLowerInvariant();
            if (normalizedGesture == "talk")
            {
                if (local) SetTalking(true);
                else { animator.SetBool(IsTalkingHash, true); GestureName = "talk"; gestureUntil = float.PositiveInfinity; }
                return;
            }
            if (normalizedGesture == "none")
            {
                if (local) SetTalking(false);
                else { animator.SetBool(IsTalkingHash, false); GestureName = "none"; gestureUntil = 0f; }
                return;
            }
            string trigger = normalizedGesture switch
            {
                "turn" => "Turn",
                "wave" => "Wave",
                "cheer" => "Cheer",
                "dance" => "Dance",
                "interact" => "Interact",
                _ => null
            };
            if (string.IsNullOrEmpty(trigger)) return;
            if (!HasParameter(trigger, AnimatorControllerParameterType.Trigger))
            {
                Debug.LogError("UCENO imported Animator Controller is missing trigger " + trigger, this);
                return;
            }
            animator.ResetTrigger(trigger);
            animator.SetTrigger(trigger);
            GestureName = gesture.ToLowerInvariant();
            gestureUntil = Time.time + (trigger == "Dance" ? 8f : trigger == "Interact" ? 2.5f : 1.8f);
            if (local) GestureSequence++;
        }

        private void RequireParameter(string parameterName, AnimatorControllerParameterType type)
        {
            if (!HasParameter(parameterName, type))
                Debug.LogError("UCENO imported Animator Controller is missing " + type + " parameter " + parameterName, this);
        }

        private bool HasParameter(string parameterName, AnimatorControllerParameterType type)
        {
            foreach (AnimatorControllerParameter parameter in animator.parameters)
                if (parameter.name == parameterName && parameter.type == type) return true;
            return false;
        }
    }
}
