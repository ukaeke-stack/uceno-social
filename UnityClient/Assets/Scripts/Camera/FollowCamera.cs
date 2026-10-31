using UnityEngine;

/// <summary>
/// Simple orbit-follow camera for the first local prototype.
/// Production camera controls, touch gestures and accessibility settings are not included yet.
/// </summary>
public sealed class FollowCamera : MonoBehaviour
{
    [SerializeField] private Transform target;
    [SerializeField, Min(0.1f)] private float distance = 5f;
    [SerializeField, Min(0f)] private float height = 2f;
    [SerializeField, Min(0f)] private float followSmoothing = 10f;
    [SerializeField] private float mouseSensitivity = 3f;
    [SerializeField] private float minPitch = -20f;
    [SerializeField] private float maxPitch = 65f;

    private float yaw;
    private float pitch = 15f;

    private void LateUpdate()
    {
        if (target == null) return;

#if UNITY_EDITOR || UNITY_STANDALONE
        if (Input.GetMouseButton(1))
        {
            yaw += Input.GetAxis("Mouse X") * mouseSensitivity;
            pitch -= Input.GetAxis("Mouse Y") * mouseSensitivity;
            pitch = Mathf.Clamp(pitch, minPitch, maxPitch);
        }
#endif

        Quaternion orbit = Quaternion.Euler(pitch, yaw, 0f);
        Vector3 focus = target.position + Vector3.up * height;
        Vector3 desiredPosition = focus - orbit * Vector3.forward * distance;

        transform.position = Vector3.Lerp(
            transform.position,
            desiredPosition,
            1f - Mathf.Exp(-followSmoothing * Time.deltaTime)
        );
        transform.rotation = Quaternion.LookRotation(focus - transform.position, Vector3.up);
    }

    public void SetTarget(Transform newTarget)
    {
        target = newTarget;
    }
}