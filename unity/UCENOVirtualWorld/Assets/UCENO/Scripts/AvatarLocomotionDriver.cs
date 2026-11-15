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

        [SerializeField, Min(0.01f)] private float dampTime = 0.12f;

        private Animator animator;
        private PlayerMotor motor;
        private bool networkDriven;
        private float networkSpeed;
        private bool networkSeated;
        private int receivedGestureSequence;
        private float gestureUntil;

        public int GestureSequence { get; private set; }
        public string GestureName { get; private set; } = "none";

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
            RequireParameter("MoveSpeed", AnimatorControllerParameterType.Float);
            RequireParameter("IsSeated", AnimatorControllerParameterType.Bool);
            foreach (string trigger in new[] { "Talk", "Turn", "Wave", "Cheer", "Dance", "Interact" })
                RequireParameter(trigger, AnimatorControllerParameterType.Trigger);
        }

        private void Update()
        {
            if (!enabled || animator == null || animator.runtimeAnimatorController == null) return;
            float speed = motor != null ? motor.AnimationSpeed : networkSpeed;
            bool seated = motor != null ? motor.IsSeated : networkSeated;
            animator.SetFloat(MoveSpeedHash, Mathf.Clamp01(speed), dampTime, Time.deltaTime);
            animator.SetBool(IsSeatedHash, seated);
        }

        private void LateUpdate()
        {
            if (Time.time >= gestureUntil && GestureName != "none")
                GestureName = "none";
        }

        public void ApplyRemoteState(float speed, bool seated, bool sprinting, string gesture, int sequence)
        {
            networkDriven = true;
            networkSpeed = Mathf.Clamp01(speed);
            networkSeated = seated;
            if (sequence <= receivedGestureSequence) return;
            receivedGestureSequence = sequence;
            PlayGesture(gesture, false);
        }

        public void TriggerWave() { PlayGesture("wave", true); }
        public void TriggerCheer() { PlayGesture("cheer", true); }
        public void TriggerDance() { PlayGesture("dance", true); }
        public void TriggerTalk() { PlayGesture("talk", true); }
        public void TriggerTurn() { PlayGesture("turn", true); }
        public void TriggerInteract() { PlayGesture("interact", true); }

        private void PlayGesture(string gesture, bool local)
        {
            if (animator == null || animator.runtimeAnimatorController == null) return;
            string trigger = (gesture ?? string.Empty).Trim().ToLowerInvariant() switch
            {
                "talk" => "Talk",
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
            gestureUntil = Time.time + (trigger == "Dance" ? 8f :
                trigger == "Talk" ? 3.5f : trigger == "Interact" ? 2.5f : 1.8f);
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
