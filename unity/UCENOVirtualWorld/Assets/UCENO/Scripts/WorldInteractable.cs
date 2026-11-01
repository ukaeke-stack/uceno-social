using UnityEngine;

namespace UCENO.VirtualWorld
{
    public enum WorldInteractableKind
    {
        Door,
        Object
    }

    /// <summary>
    /// Marker for a real scene object that can receive server-authoritative
    /// interactions. Door pivots must be assigned to the actual door mesh;
    /// this component never rotates an entire building as a substitute.
    /// </summary>
    public sealed class WorldInteractable : MonoBehaviour
    {
        [SerializeField] private string objectId;
        [SerializeField] private WorldInteractableKind kind = WorldInteractableKind.Object;
        [SerializeField] private Transform doorPivot;
        [SerializeField] private float openAngle = 90f;
        [SerializeField] private float animationSpeed = 240f;

        private Quaternion closedRotation;
        private Quaternion targetRotation;
        private bool initialized;
        public string ObjectId => objectId;
        public string Kind => kind == WorldInteractableKind.Door ? "door" : "object";
        public string CurrentState { get; private set; } = "closed";

        private void Awake()
        {
            Transform pivot = doorPivot != null ? doorPivot : transform;
            closedRotation = pivot.localRotation;
            targetRotation = closedRotation;
            initialized = true;
        }

        private void Update()
        {
            if (!initialized || kind != WorldInteractableKind.Door) return;
            Transform pivot = doorPivot != null ? doorPivot : transform;
            pivot.localRotation = Quaternion.RotateTowards(
                pivot.localRotation, targetRotation, animationSpeed * Time.deltaTime);
        }

        public void ApplyServerState(string state)
        {
            if (string.IsNullOrWhiteSpace(state)) return;
            CurrentState = state;
            if (kind != WorldInteractableKind.Door) return;
            if (!initialized) Awake();
            targetRotation = state == "open"
                ? closedRotation * Quaternion.Euler(0f, openAngle, 0f)
                : closedRotation;
        }

#if UNITY_EDITOR
        private void OnValidate()
        {
            if (string.IsNullOrWhiteSpace(objectId))
                objectId = gameObject.name.ToLowerInvariant().Replace(" ", "-");
            openAngle = Mathf.Clamp(openAngle, 15f, 150f);
            animationSpeed = Mathf.Clamp(animationSpeed, 30f, 720f);
        }
#endif
    }
}
