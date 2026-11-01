using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>
    /// Finds nearby real interactable scene objects and sends requests to the
    /// authoritative world gateway. Local clients never change shared state.
    /// </summary>
    public sealed class WorldObjectInteractor : MonoBehaviour
    {
        [SerializeField] private Camera viewCamera;
        [SerializeField] private WorldGatewayClient gateway;
        [SerializeField] private float interactionDistance = 3.25f;
        [SerializeField] private LayerMask interactionMask = ~0;

        private WorldInteractable currentTarget;
        private GUIStyle buttonStyle;

        private void Awake()
        {
            if (viewCamera == null) viewCamera = Camera.main;
            if (gateway == null) gateway = GetComponent<WorldGatewayClient>();
        }

        private void Update()
        {
            if (gateway == null) gateway = GetComponent<WorldGatewayClient>();
            if (viewCamera == null) viewCamera = Camera.main;
            currentTarget = FindTarget();
            if (currentTarget != null && Input.GetKeyDown(KeyCode.E))
                Interact();
        }

        private WorldInteractable FindTarget()
        {
            if (viewCamera == null) return null;
            Ray ray = new Ray(viewCamera.transform.position, viewCamera.transform.forward);
            if (!Physics.Raycast(ray, out RaycastHit hit, interactionDistance, interactionMask,
                QueryTriggerInteraction.Ignore))
                return null;
            return hit.collider.GetComponentInParent<WorldInteractable>();
        }

        private void Interact()
        {
            if (gateway == null || currentTarget == null) return;
            if (currentTarget.Kind == "seat" && !string.IsNullOrEmpty(currentTarget.OccupantId) &&
                currentTarget.OccupantId != GetLocalUserId()) return;
            string action = currentTarget.Kind == "door" ? "toggle" :
                currentTarget.Kind == "seat" ? (currentTarget.OccupantId == "" || currentTarget.OccupantId == GetLocalUserId() ?
                    (currentTarget.OccupantId == "" ? "sit" : "stand") : "sit") : "use";
            gateway.RequestInteraction(currentTarget.ObjectId, action);
        }

        private string GetLocalUserId() => gateway != null ? gateway.LocalUserId : "";

        private void OnGUI()
        {
            if (currentTarget == null) return;
            if (buttonStyle == null)
            {
                buttonStyle = new GUIStyle(GUI.skin.button)
                {
                    fontSize = Mathf.Max(15, Screen.width / 40),
                    fontStyle = FontStyle.Bold
                };
            }

            string action = currentTarget.Kind == "door"
                ? (currentTarget.CurrentState == "open" ? "CLOSE" : "OPEN")
                : currentTarget.Kind == "seat"
                    ? (currentTarget.OccupantId == "" ? "SIT" : currentTarget.OccupantId == GetLocalUserId() ? "STAND" : "OCCUPIED")
                    : "INTERACT";
            float width = Mathf.Clamp(Screen.width * 0.30f, 130f, 220f);
            float height = 52f;
            Rect rect = new Rect((Screen.width - width) * 0.5f,
                Screen.height - height - 34f, width, height);
            bool seatHeldByOther = currentTarget.Kind == "seat" &&
                !string.IsNullOrEmpty(currentTarget.OccupantId) &&
                currentTarget.OccupantId != GetLocalUserId();
            GUI.enabled = !seatHeldByOther;
            if (GUI.Button(rect, action, buttonStyle)) Interact();
            GUI.enabled = true;
        }
    }
}
