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
        private Vector2 moveTouchCurrent;
        private int moveFingerId = -1;
        private int lookFingerId = -1;

        public float Yaw => yaw;
        public float Pitch => pitch;

        private void Awake()
        {
            controller = GetComponent<CharacterController>();
            yaw = transform.eulerAngles.y;
        }

        private void Update()
        {
            Vector2 move = ReadMoveInput();
            Vector2 look = ReadLookInput();

            yaw += look.x * lookSensitivity;
            pitch = Mathf.Clamp(pitch - look.y * lookSensitivity, minimumPitch, maximumPitch);
            transform.rotation = Quaternion.Euler(0f, yaw, 0f);

            Vector3 direction = transform.right * move.x + transform.forward * move.y;
            if (direction.sqrMagnitude > 1f) direction.Normalize();

            if (controller.isGrounded && verticalVelocity < 0f)
                verticalVelocity = -2f;

            verticalVelocity += gravity * Time.deltaTime;
            Vector3 velocity = direction * moveSpeed;
            velocity.y = verticalVelocity;
            controller.Move(velocity * Time.deltaTime);
        }

        private Vector2 ReadMoveInput()
        {
            Vector2 keyboard = new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
            if (keyboard.sqrMagnitude > 0.01f) return Vector2.ClampMagnitude(keyboard, 1f);

            Vector2 result = Vector2.zero;
            for (int i = 0; i < Input.touchCount; i++)
            {
                Touch touch = Input.GetTouch(i);
                if (touch.phase == TouchPhase.Began && touch.position.x < Screen.width * 0.5f && moveFingerId == -1)
                {
                    moveFingerId = touch.fingerId;
                    moveTouchStart = touch.position;
                    moveTouchCurrent = touch.position;
                }

                if (touch.fingerId == moveFingerId)
                {
                    if (touch.phase == TouchPhase.Ended || touch.phase == TouchPhase.Canceled)
                    {
                        moveFingerId = -1;
                    }
                    else
                    {
                        moveTouchCurrent = touch.position;
                        Vector2 delta = (moveTouchCurrent - moveTouchStart) / Mathf.Max(70f, Screen.width * 0.16f);
                        result = Vector2.ClampMagnitude(delta, 1f);
                    }
                }
            }
            return result;
        }

        private Vector2 ReadLookInput()
        {
            Vector2 mouse = new Vector2(Input.GetAxis("Mouse X"), Input.GetAxis("Mouse Y")) * 4f;
            if (mouse.sqrMagnitude > 0.001f) return mouse;

            Vector2 result = Vector2.zero;
            for (int i = 0; i < Input.touchCount; i++)
            {
                Touch touch = Input.GetTouch(i);
                if (touch.phase == TouchPhase.Began && touch.position.x >= Screen.width * 0.5f && lookFingerId == -1)
                    lookFingerId = touch.fingerId;

                if (touch.fingerId == lookFingerId)
                {
                    if (touch.phase == TouchPhase.Ended || touch.phase == TouchPhase.Canceled)
                        lookFingerId = -1;
                    else if (touch.phase == TouchPhase.Moved)
                        result = touch.deltaPosition;
                }
            }
            return result;
        }
    }
}