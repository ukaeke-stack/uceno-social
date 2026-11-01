using System.Linq;
using UnityEngine;

namespace UCENO.VirtualWorld
{
    public enum WorldInteractableKind
    {
        Door,
        Seat,
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
        public string Kind => kind == WorldInteractableKind.Door ? "door" : kind == WorldInteractableKind.Seat ? "seat" : "object";
        public string CurrentState { get; private set; } = "closed";
        public string OccupantId { get; private set; } = "";

        private void Awake()
        {
            closedRotation = doorPivot != null ? doorPivot.localRotation : Quaternion.identity;
            targetRotation = closedRotation;
            initialized = true;
        }

        private void Update()
        {
            if (!initialized || kind != WorldInteractableKind.Door || doorPivot == null) return;
            doorPivot.localRotation = Quaternion.RotateTowards(
                doorPivot.localRotation, targetRotation, animationSpeed * Time.deltaTime);
        }

        public void ApplyServerState(string state, string occupantId = "")
        {
            if (string.IsNullOrWhiteSpace(state)) return;
            CurrentState = state;
            OccupantId = occupantId ?? "";
            if (kind != WorldInteractableKind.Door || doorPivot == null) return;
            if (!initialized) Awake();
            targetRotation = state == "open"
                ? closedRotation * Quaternion.Euler(0f, openAngle, 0f)
                : closedRotation;
        }

#if UNITY_EDITOR
        private void OnValidate()
        {
            if (string.IsNullOrWhiteSpace(objectId))
                objectId = new string(gameObject.name.ToLowerInvariant()
                    .Select(character => char.IsLetterOrDigit(character) || "._:-".IndexOf(character) >= 0
                        ? character : '-').ToArray());
            openAngle = Mathf.Clamp(openAngle, 15f, 150f);
            animationSpeed = Mathf.Clamp(animationSpeed, 30f, 720f);
        }
#endif
    }
}
