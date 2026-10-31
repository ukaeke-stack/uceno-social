using UnityEngine;

/// <summary>
/// Minimal desktop-prototype movement controller.
/// Mobile touch controls and network-authoritative movement are intentionally separate follow-up tasks.
/// </summary>
[RequireComponent(typeof(CharacterController))]
public sealed class ThirdPersonPlayerController : MonoBehaviour
{
    [SerializeField] private Transform cameraTransform;
    [SerializeField, Min(0f)] private float moveSpeed = 4.5f;
    [SerializeField, Min(0f)] private float rotationSpeed = 12f;
    [SerializeField, Min(0f)] private float gravity = 20f;

    private CharacterController controller;
    private float verticalVelocity;

    private void Awake()
    {
        controller = GetComponent<CharacterController>();
        if (cameraTransform == null && Camera.main != null)
            cameraTransform = Camera.main.transform;
    }

    private void Update()
    {
        MoveFromDesktopInput();
    }

    private void MoveFromDesktopInput()
    {
        Vector2 input = Application.isMobilePlatform
            ? MobileTouchZone.MoveInput
            : new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
        float horizontal = input.x;
        float vertical = input.y;

        Vector3 forward = cameraTransform != null ? cameraTransform.forward : transform.forward;
        Vector3 right = cameraTransform != null ? cameraTransform.right : transform.right;
        forward.y = 0f;
        right.y = 0f;
        forward.Normalize();
        right.Normalize();

        Vector3 direction = Vector3.ClampMagnitude(forward * vertical + right * horizontal, 1f);

        if (direction.sqrMagnitude > 0.001f)
        {
            Quaternion targetRotation = Quaternion.LookRotation(direction, Vector3.up);
            transform.rotation = Quaternion.Slerp(
                transform.rotation,
                targetRotation,
                rotationSpeed * Time.deltaTime
            );
        }

        if (controller.isGrounded && verticalVelocity < 0f)
            verticalVelocity = -2f;

        verticalVelocity -= gravity * Time.deltaTime;
        Vector3 velocity = direction * moveSpeed;
        velocity.y = verticalVelocity;
        controller.Move(velocity * Time.deltaTime);
    }
}