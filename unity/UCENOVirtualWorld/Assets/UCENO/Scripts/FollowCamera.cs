using UnityEngine;

namespace UCENO.VirtualWorld
{
    public sealed class FollowCamera : MonoBehaviour
    {
        [SerializeField] private Transform target;
        [SerializeField] private Vector3 offset = new Vector3(0f, 3.2f, -5.5f);
        [SerializeField] private float followSharpness = 10f;
        [SerializeField] private float pitch = 12f;

        public void SetTarget(Transform value) => target = value;

        private void LateUpdate()
        {
            if (target == null) return;
            Quaternion yaw = Quaternion.Euler(0f, target.eulerAngles.y, 0f);
            Vector3 desiredPosition = target.position + yaw * offset;
            float blend = 1f - Mathf.Exp(-followSharpness * Time.deltaTime);
            transform.position = Vector3.Lerp(transform.position, desiredPosition, blend);
            transform.rotation = Quaternion.LookRotation(target.position + Vector3.up * 1.5f - transform.position, Vector3.up);
            transform.rotation = Quaternion.Euler(transform.eulerAngles.x + pitch, transform.eulerAngles.y, 0f);
        }
    }
}
