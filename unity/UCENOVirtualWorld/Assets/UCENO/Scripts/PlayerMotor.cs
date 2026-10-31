using UnityEngine;

namespace UCENO.VirtualWorld
{
    [RequireComponent(typeof(CharacterController))]
    public sealed class PlayerMotor : MonoBehaviour
    {
        [Header("Movement")]
        [SerializeField] private float moveSpeed = 4.5f;
        [SerializeField] private float gravity = -20f;

        [Header("Camera look")]
        [SerializeField] private float lookSensitivity = 0.12f;
        [SerializeField] private float minimumPitch = -10f;
        [SerializeField] private float maximumPitch = 55f;

        private CharacterController controller;
        private float verticalVelocity;
        private float yaw;
        private float pitch = 12f;
        private Vector2 moveTouchStart;
        private int moveFingerId = -1;
        private int lookFingerId = -1;

        public float Yaw => yaw;
        public float Pitch => pitch;

        private void Awake()
        {
            controller = GetComponent<CharacterController>();
            yaw = transform.eulerAngles.y;
        }

        private void OnDisable()
        {
            moveFingerId = -1;
            lookFingerId = -1;
        }

        private void Update()
        {
            Vector2 move = ReadMoveInput();
            Vector2 look = ReadLookInput();

            yaw += look.x * lookSensitivity;
            pitch = Mathf.Clamp(
                pitch - look.y * lookSensitivity,
                minimumPitch,
                maximumPitch
            );
            transform.rotation = Quaternion.Euler(0f, yaw, 0f);

            Vector3 direction =
                transform.right * move.x +
                transform.forward * move.y;

            if (direction.sqrMagnitude > 1f)
                direction.Normalize();

            if (controller.isGrounded && verticalVelocity < 0f)
                verticalVelocity = -2f;

            verticalVelocity += gravity * Time.deltaTime;

            Vector3 velocity = direction * moveSpeed;
            velocity.y = verticalVelocity;
            controller.Move(velocity * Time.deltaTime);
        }

        private Vector2 ReadMoveInput()
        {
            Vector2 result = new Vector2(
                Input.GetAxisRaw("Horizontal"),
                Input.GetAxisRaw("Vertical")
            );

            for (int i = 0; i < Input.touchCount; i++)
            {
                Touch touch = Input.GetTouch(i);

                if (touch.phase == TouchPhase.Began &&
                    touch.position.x < Screen.width * 0.5f &&
                    moveFingerId == -1)
                {
                    moveFingerId = touch.fingerId;
                    moveTouchStart = touch.position;
                }

                if (touch.fingerId != moveFingerId)
                    continue;

                if (touch.phase == TouchPhase.Ended ||
                    touch.phase == TouchPhase.Canceled)
                {
                    moveFingerId = -1;
                    continue;
                }

                float dragRange = Mathf.Max(70f, Screen.width * 0.16f);
                Vector2 drag = (touch.position - moveTouchStart) / dragRange;
                result += Vector2.ClampMagnitude(drag, 1f);
            }

            return Vector2.ClampMagnitude(result, 1f);
        }

        private Vector2 ReadLookInput()
        {
            Vector2 result = Vector2.zero;

            // Mouse look is used on desktop. Avoid processing it alongside
            // active touches so touch-emulated mouse events are not doubled.
            if (Input.touchCount == 0)
            {
                result.x += Input.GetAxis("Mouse X") * 4f;
                result.y += Input.GetAxis("Mouse Y") * 4f;
            }

            for (int i = 0; i < Input.touchCount; i++)
            {
                Touch touch = Input.GetTouch(i);

                if (touch.phase == TouchPhase.Began &&
                    touch.position.x >= Screen.width * 0.5f &&
                    lookFingerId == -1)
                {
                    lookFingerId = touch.fingerId;
                }

                if (touch.fingerId != lookFingerId)
                    continue;

                if (touch.phase == TouchPhase.Ended ||
                    touch.phase == TouchPhase.Canceled)
                {
                    lookFingerId = -1;
                    continue;
                }

                if (touch.phase == TouchPhase.Moved)
                    result += touch.deltaPosition;
            }

            return result;
        }
    }
}