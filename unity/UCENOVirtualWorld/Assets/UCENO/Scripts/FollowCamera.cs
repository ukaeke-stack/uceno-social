using UnityEngine;

namespace UCENO.VirtualWorld
{
    public sealed class FollowCamera : MonoBehaviour
    {
        [SerializeField] private Transform target;
        [SerializeField] private float distance = 5.5f;
        [SerializeField] private float targetHeight = 1.5f;
        [SerializeField] private float followSharpness = 10f;
        [SerializeField] private float fallbackPitch = 12f;
        [SerializeField] private float collisionRadius = 0.20f;
        [SerializeField] private float collisionPadding = 0.12f;
        [SerializeField] private float minimumDistance = 0.85f;

        private PlayerMotor playerMotor;

        public void SetTarget(Transform value)
        {
            target = value;
            playerMotor = value != null ? value.GetComponent<PlayerMotor>() : null;
        }

        private void LateUpdate()
        {
            if (target == null) return;

            float pitch = playerMotor != null ? playerMotor.Pitch : fallbackPitch;
            Quaternion orbit = Quaternion.Euler(pitch, target.eulerAngles.y, 0f);
            Vector3 lookPoint = target.position + Vector3.up * targetHeight;
            Vector3 direction = -(orbit * Vector3.forward);
            float desiredDistance = distance;

            if (Physics.SphereCast(
                lookPoint,
                collisionRadius,
                direction,
                out RaycastHit hit,
                distance,
                Physics.DefaultRaycastLayers,
                QueryTriggerInteraction.Ignore))
            {
                if (hit.transform != target && !hit.transform.IsChildOf(target))
                    desiredDistance = Mathf.Max(minimumDistance, hit.distance - collisionPadding);
            }

            Vector3 desiredPosition = lookPoint + direction * desiredDistance;
            float blend = 1f - Mathf.Exp(-followSharpness * Time.deltaTime);

            transform.position = Vector3.Lerp(transform.position, desiredPosition, blend);
            transform.LookAt(lookPoint);
        }
    }
}
