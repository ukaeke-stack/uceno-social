using System;
using System.Collections.Generic;
using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>
    /// Binds authoritative world-area transitions to Addressables content delivery.
    /// The server remains authoritative for admission; this component reacts only
    /// to confirmed location changes and requests the matching downloadable pack.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class WorldAreaContentBinding : MonoBehaviour
    {
        [SerializeField] private WorldGatewayClient gateway;
        [SerializeField] private WorldContentDelivery contentDelivery;
        [SerializeField] private bool showStatusOverlay = true;

        private string activeContextType = "";
        private string activeContextId = "";
        private string activeLabel = "";
        private string status = "World content ready.";
        private float progress = 1f;
        private bool downloading;
        private readonly HashSet<string> requestedLabels = new HashSet<string>(StringComparer.Ordinal);

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void InstallForLoadedWorld()
        {
            WorldGatewayClient activeGateway = FindObjectOfType<WorldGatewayClient>();
            if (activeGateway == null || activeGateway.GetComponent<WorldAreaContentBinding>() != null)
                return;
            activeGateway.gameObject.AddComponent<WorldAreaContentBinding>();
        }

        private void Awake()
        {
            if (gateway == null) gateway = GetComponent<WorldGatewayClient>();
            if (gateway == null) gateway = FindObjectOfType<WorldGatewayClient>();
            if (contentDelivery == null) contentDelivery = FindObjectOfType<WorldContentDelivery>();
            if (contentDelivery == null && gateway != null)
                contentDelivery = gateway.gameObject.AddComponent<WorldContentDelivery>();
        }

        private void OnEnable()
        {
            if (gateway != null)
            {
                gateway.SpatialLocationEntered += HandleLocationEntered;
                gateway.SpatialLocationExited += HandleLocationExited;
            }
            if (contentDelivery != null)
            {
                contentDelivery.ProgressChanged += HandleProgress;
                contentDelivery.StatusChanged += HandleStatus;
                contentDelivery.ContentReady += HandleReady;
                contentDelivery.ContentFailed += HandleFailed;
            }
        }

        private void OnDisable()
        {
            if (gateway != null)
            {
                gateway.SpatialLocationEntered -= HandleLocationEntered;
                gateway.SpatialLocationExited -= HandleLocationExited;
            }
            if (contentDelivery != null)
            {
                contentDelivery.ProgressChanged -= HandleProgress;
                contentDelivery.StatusChanged -= HandleStatus;
                contentDelivery.ContentReady -= HandleReady;
                contentDelivery.ContentFailed -= HandleFailed;
            }
        }

        private void HandleLocationEntered(string contextType, string contextId, Vector3 position, float yaw)
        {
            activeContextType = contextType ?? "";
            activeContextId = contextId ?? "";
            string label = ResolveLabel(activeContextType);
            if (string.IsNullOrEmpty(label) || contentDelivery == null)
            {
                status = "Entered " + activeContextType + ".";
                return;
            }

            activeLabel = label;
            progress = 0f;
            downloading = true;
            status = "Preparing " + FriendlyName(label) + "...";
            if (requestedLabels.Add(label))
            {
                contentDelivery.EnsureContent(label, (ok, error) =>
                {
                    if (activeLabel != label) return;
                    downloading = false;
                    if (!ok)
                    {
                        status = "Could not load " + FriendlyName(label) +
                            ". The area is available with its core fallback. Re-enter to retry. " +
                            (string.IsNullOrEmpty(error) ? "" : error);
                    }
                });
            }
            else
            {
                // Addressables' persistent cache makes repeat visits inexpensive.
                contentDelivery.EnsureContent(label, (ok, error) =>
                {
                    if (activeLabel != label) return;
                    downloading = false;
                    status = ok ? FriendlyName(label) + " ready." :
                        "Content unavailable: " + (error ?? "retry on a stable connection.");
                });
            }
        }

        private void HandleLocationExited()
        {
            activeContextType = "";
            activeContextId = "";
            activeLabel = "";
            downloading = false;
            progress = 1f;
            status = "Returned to the shared world.";
        }

        private static string ResolveLabel(string contextType)
        {
            switch ((contextType ?? "").Trim().ToLowerInvariant())
            {
                case "home": return "home-interiors";
                case "event": return "world-event-venues";
                default: return "";
            }
        }

        private static string FriendlyName(string label)
        {
            return label.Replace('-', ' ');
        }

        private void HandleProgress(string label, float value)
        {
            if (label != activeLabel) return;
            progress = Mathf.Clamp01(value);
            downloading = progress < 1f;
        }

        private void HandleStatus(string message)
        {
            if (!string.IsNullOrEmpty(message)) status = message;
        }

        private void HandleReady(string label)
        {
            if (label != activeLabel) return;
            downloading = false;
            progress = 1f;
            status = FriendlyName(label) + " ready (cached for the next visit).";
        }

        private void HandleFailed(string label)
        {
            if (label != activeLabel) return;
            downloading = false;
            status = "Download failed for " + FriendlyName(label) + ". Check connection and retry.";
        }

        private void OnGUI()
        {
            if (!showStatusOverlay || string.IsNullOrEmpty(status)) return;
            if (!downloading && progress >= 1f) return;
            float scale = Mathf.Clamp(Screen.width / 900f, 0.75f, 1.35f);
            float width = Mathf.Min(Screen.width - 32f, 460f * scale);
            Rect panel = new Rect(16f, 16f, width, 76f * scale);
            GUI.Box(panel, GUIContent.none);
            GUI.Label(new Rect(panel.x + 12f, panel.y + 8f, panel.width - 24f, 24f * scale),
                status, GUI.skin.label);
            GUI.Box(new Rect(panel.x + 12f, panel.y + 42f * scale,
                panel.width - 24f, 12f * scale), GUIContent.none);
            GUI.Box(new Rect(panel.x + 12f, panel.y + 42f * scale,
                (panel.width - 24f) * progress, 12f * scale), GUIContent.none);
        }
    }
}
