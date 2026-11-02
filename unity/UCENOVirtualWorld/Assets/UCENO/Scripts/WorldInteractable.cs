using UnityEngine;

namespace UCENO.VirtualWorld
{
    public enum WorldInteractableKind
    {
        Door,
        Seat,
        Object,
        Furniture,
        Vehicle
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
        [SerializeField] private Animator stateAnimator;
        [SerializeField] private string stateBoolParameter = "Active";
        [SerializeField] private GameObject[] activeStateVisuals;
        [SerializeField] private GameObject[] inactiveStateVisuals;

        private Quaternion closedRotation;
        private Quaternion targetRotation;
        private bool initialized;
        public string ObjectId => objectId;
        public bool HasDoorPivot => doorPivot != null;
        public string Kind => kind == WorldInteractableKind.Door ? "door" :
            kind == WorldInteractableKind.Seat ? "seat" :
            kind == WorldInteractableKind.Furniture ? "furniture" :
            kind == WorldInteractableKind.Vehicle ? "vehicle" : "object";
        public string CurrentState { get; private set; } = "idle";
        public bool IsActive => CurrentState == "active";
        public bool IsVehicleEngineOn => kind == WorldInteractableKind.Vehicle && CurrentState == "engine_on";
        public string OccupantId { get; private set; } = "";

        private void Awake()
        {
            if (kind == WorldInteractableKind.Door) CurrentState = "closed";
            else if (kind == WorldInteractableKind.Vehicle) CurrentState = "engine_off";
            else if (kind == WorldInteractableKind.Seat) CurrentState = "available";
            else CurrentState = "idle";
            closedRotation = doorPivot != null ? doorPivot.localRotation : Quaternion.identity;
            targetRotation = closedRotation;
            initialized = true;
            ApplyStateVisuals();
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
            if (!initialized) Awake();
            if (kind == WorldInteractableKind.Door && doorPivot != null)
                targetRotation = state == "open"
                    ? closedRotation * Quaternion.Euler(0f, openAngle, 0f)
                    : closedRotation;
            ApplyStateVisuals();
        }

        private void ApplyStateVisuals()
        {
            bool active = CurrentState == "active" || CurrentState == "engine_on" ||
                CurrentState == "occupied" || CurrentState == "open";
            if (stateAnimator != null && !string.IsNullOrWhiteSpace(stateBoolParameter))
            {
                foreach (AnimatorControllerParameter parameter in stateAnimator.parameters)
                    if (parameter.name == stateBoolParameter &&
                        parameter.type == AnimatorControllerParameterType.Bool)
                    {
                        stateAnimator.SetBool(stateBoolParameter, active);
                        break;
                    }
            }
            if (activeStateVisuals != null)
                foreach (GameObject visual in activeStateVisuals)
                    if (visual != null && visual.activeSelf != active) visual.SetActive(active);
            if (inactiveStateVisuals != null)
                foreach (GameObject visual in inactiveStateVisuals)
                    if (visual != null && visual.activeSelf == active) visual.SetActive(!active);
        }

#if UNITY_EDITOR
        private void OnValidate()
        {
            // Identity is assigned explicitly by WorldInteractableAuthoring from
            // the saved scene object's GlobalObjectId. Never derive it from a
            // display name: duplicate prop names are common in imported assets.
            openAngle = Mathf.Clamp(openAngle, 15f, 150f);
            animationSpeed = Mathf.Clamp(animationSpeed, 30f, 720f);
        }
#endif
    }
}
