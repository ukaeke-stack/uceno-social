using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>
    /// Bridges the existing PlayerMotor input to the imported Unity Humanoid
    /// Animator. The model and its bone hierarchy are not referenced here, so
    /// later professional Humanoid avatars can reuse the same controller.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class AvatarLocomotionDriver : MonoBehaviour
    {
        private static readonly int MoveSpeedHash = Animator.StringToHash("MoveSpeed");

        [SerializeField] private float dampTime = 0.12f;

        private Animator animator;
        private PlayerMotor motor;

        private void Awake()
        {
            animator = GetComponent<Animator>();
            if (animator == null)
                animator = GetComponentInChildren<Animator>();

            motor = GetComponentInParent<PlayerMotor>();
        }

        private void Update()
        {
            if (animator == null || motor == null || animator.runtimeAnimatorController == null)
                return;

            animator.SetFloat(MoveSpeedHash, motor.AnimationSpeed, dampTime, Time.deltaTime);
        }
    }
}
