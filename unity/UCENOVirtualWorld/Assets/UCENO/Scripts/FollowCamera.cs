using UnityEngine;

namespace UCENO.VirtualWorld
{
    public sealed class FollowCamera : MonoBehaviour
    {
        [SerializeField] private Transform target;
        [SerializeField] private float distance = 5.5f;
        [SerializeField] private float targetHeight = 1.5f;
        [SerializeField] private float followSharpness = 10f;
        [SerializeField] private float pitch = 12f;

        public void SetTarget(Transform value) => target = value;

        private void LateUpdate()
        {
            if (target == null) return;

            // Derive both position and rotation from one orbit rotation. This avoids
            // applying pitch twice and keeps the camera stable as the player turns.
            Quaternion orbit = Quaternion.Euler(pitch, target.eulerAngles.y, 0f);
            Vector3 lookPoint = target.position + Vector3.up * targetHeight;
            Vector3 desiredPosition = lookPoint - orbit * Vector3.forward * distance;
            float blend = 1f - Mathf.Exp(-followSharpness * Time.deltaTime);

            transform.position = Vector3.Lerp(transform.position, desiredPosition, blend);
            transform.rotation = orbit;
        }
    }
}