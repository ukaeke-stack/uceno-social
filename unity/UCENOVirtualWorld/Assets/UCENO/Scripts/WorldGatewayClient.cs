using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using NativeWebSocket;
using UnityEngine;
using UnityEngine.Networking;

namespace UCENO.VirtualWorld
{
    [Serializable] internal sealed class GatewayInputPacket
    {
        public string type = "input";
        public int sequence;
        public float moveX;
        public float moveZ;
        public float yaw;
        public bool sprint;
        public bool jump;
        public bool seated;
        public string gesture = "none";
        public int gestureSequence;
    }

    [Serializable] internal sealed class GatewayVectorState
    {
        public float x;
        public float y;
        public float z;
        public float yaw;
        public bool grounded;
    }

    [Serializable] internal sealed class GatewayWardrobeItemState
    {
        public string slot;
        public string itemId;
    }

    [Serializable] internal sealed class GatewaySnapshotPlayer
    {
        public string userId;
        public float x;
        public float y;
        public float z;
        public float yaw;
        public bool grounded;
        public bool seated;
        public bool sprint;
        public string gesture;
        public int gestureSequence;
        public GatewayWardrobeItemState[] wardrobe;
    }

    [Serializable] internal sealed class GatewayInteractionPacket
    {
        public string type = "interact";
        public string objectId;
        public string action;
    }

    [Serializable] internal sealed class GatewayWardrobeRefreshRequest
    {
        public string type = "wardrobe_refresh";
    }

    [Serializable] internal sealed class GatewayVoiceControlRequest
    {
        public string type;
    }

    [Serializable] internal sealed class GatewayVoiceSignalRequest
    {
        public string type = "voice_signal";
        public string targetUserId;
        public string signalType;
        public string sdp;
        public string candidate;
        public string sdpMid;
        public int sdpMLineIndex;
    }

    [Serializable] internal sealed class GatewayContextRequest
    {
        public string type;
        public string id;
    }
    [Serializable] internal sealed class GatewayDistrictContentReadyRequest
    {
        public string type = "district_content_ready";
        public string districtId;
        public string nonce;
    }

    [Serializable] internal sealed class GatewayActivityRequest
    {
        public string type;
        public string id;
        public string kind;
        public string raceId;
        public int maxParticipants;
    }

    [Serializable] public sealed class GatewayActivityParticipantState
    {
        public string userId;
        public string status;
        public double joinedAt;
        public int checkpointIndex;
        public double finishTime;
    }

    [Serializable] public sealed class GatewayActivitySessionState
    {
        public string id;
        public string hostUserId;
        public string raceId;
        public string worldId;
        public string instanceId;
        public string kind;
        public string phase;
        public double createdAt;
        public double startedAt;
        public double completedAt;
        public int version;
        public int maxParticipants;
        public int checkpointCount;
        public GatewayActivityParticipantState[] participants;
    }

    [Serializable] internal sealed class GatewayActivityDiscoverySession
    {
        public string id;
        public string instanceId;
        public string endpoint;
        public string kind;
        public string phase;
        public string hostUserId;
        public string raceId;
        public double createdAt;
        public double startedAt;
        public double completedAt;
        public int version;
        public int maxParticipants;
        public int checkpointCount;
        public GatewayActivityParticipantState[] participants;
    }

    [Serializable] internal sealed class GatewayActivityTransferRequest { public string sessionId; }
    [Serializable] internal sealed class GatewayActivityTransferResponse { public string ticket; public string endpoint; public string instanceId; public string sessionId; public string error; }

    [Serializable] internal sealed class GatewayPacket
    {
        public string type;
        public string userId;
        public string accessToken;
        public string instanceId;
        public int expiresInSeconds;
        public long sessionGeneration;
        public long stateVersion;
        public string fromUserId;
        public string code;
        public bool active;
        public string signalType;
        public string sdp;
        public string candidate;
        public string sdpMid;
        public int sdpMLineIndex;
        public string contextType;
        public string contextId;
        public string activityType;
        public string locationLabel;
        public string homeId;
        public string eventId;
        public string districtId;
        public string districtName;
        public string contentLabel;
        public string nonce;
        public string objectId;
        public string objectState;
        public string actorId;
        public string occupantId;
        public long version;
        public GatewayVectorState state;
        public GatewaySnapshotPlayer[] players;
        public GatewayActivitySessionState session;
        public GatewayActivityDiscoverySession[] sessions;
        public string instanceId;
        public string endpoint;
        public string sessionId;
    }

    /// <summary>
    /// Unity transport for the authoritative instance gateway. The client sends
    /// input only; position and rotation are applied exclusively from server snapshots.
    /// </summary>
    public sealed class WorldGatewayClient : MonoBehaviour
    {
        [SerializeField] private WorldSessionClient session;
        [SerializeField] private PlayerMotor localPlayer;
        [SerializeField] private GameObject remoteAvatarPrefab;
        [SerializeField] private float inputRate = 20f;
        [SerializeField] private float interpolation = 14f;
        [SerializeField] private float peerTimeout = 12f;
        [SerializeField] private float maxVisiblePeerDistance = 150f;
        [SerializeField] private int maxRemoteAvatars = 32;

        private sealed class RemotePlayer
        {
            public Transform root;
            public Vector3 targetPosition;
            public Quaternion targetRotation;
            public float lastReceived;
            public Vector3 lastSamplePosition;
            public float lastSampleTime;
            public AvatarLocomotionDriver locomotion;
            public bool hasSample;
            public AvatarWardrobeController wardrobe;
            public string wardrobeSignature;
        }

        private readonly Dictionary<string, RemotePlayer> remotePlayers = new Dictionary<string, RemotePlayer>();
        // Prevent delayed packets from an older gateway replica from rolling back a newer object state.
        private readonly Dictionary<string, long> objectStateVersions = new Dictionary<string, long>();
        private WebSocket socket;
        private bool connected;
        private bool connecting;
        private bool sendPending;
        private bool destroying;
        private int sequence;
        private float nextInputAt;
        private float nextReconnectAt;
        private int reconnectAttempts;
        private string localUserId;
        private AvatarLocomotionDriver localAvatar;
        private WorldContentDelivery contentDelivery;
        private bool spatialTransitionPending;
        private string spatialTransitionStatus = "";
        private string pendingDistrictId = "";
        private string pendingDistrictNonce = "";
        private string pendingDistrictLabel = "";
        private string pendingDistrictName = "";
        private string pendingDistrictResidentLabel = "";
        private string activeDistrictLabel = "";
        private bool districtDownloadRunning;
        private string transferEndpointOverride = "";
        private string transferTokenOverride = "";
        private string pendingTransferActivityId = "";
        private bool transferringGateway;

        public string ConnectionStatus { get; private set; } = "WAITING";
        public bool SetVoiceActive(bool active)
        {
            if (!connected || socket == null) return false;
            _ = SendVoiceControlAsync(active ? "voice_join" : "voice_leave");
            return true;
        }

        public bool TryGetRemotePlayerTransform(string userId, out Transform target)
        {
            target = null;
            if (string.IsNullOrWhiteSpace(userId) || !remotePlayers.TryGetValue(userId, out RemotePlayer remote))
                return false;
            target = remote.root;
            return target != null;
        }

        private async Task SendVoiceControlAsync(string type)
        {
            try { await socket.SendText(JsonUtility.ToJson(new GatewayVoiceControlRequest { type = type })); }
            catch (Exception error) { Debug.LogWarning("UCENO voice control failed: " + error.Message); }
        }

        public int PeerCount => remotePlayers.Count;
        public string LocalUserId => localUserId;
        public event Action<string, string, Vector3, float> SpatialLocationEntered;
        public event Action SpatialLocationExited;
        public event Action<string> SpatialLocationRejected;
        public event Action<GatewayActivitySessionState> ActivityStateChanged;
        public event Action<string> ActivityRejected;
        public event Action<string, string> ActivityRouteRequired;
        public event Action<string, bool> VoicePeerPresenceChanged;
        public event Action<string, string, string, string, string, int> VoiceSignalReceived;
        public event Action<string> VoiceSignalRejected;
        private readonly List<GatewayActivitySessionState> activitySessions = new List<GatewayActivitySessionState>();
        public IReadOnlyList<GatewayActivitySessionState> ActivitySessions => activitySessions;

        public void Configure(WorldSessionClient worldSession, PlayerMotor player, GameObject avatarPrefab)
        {
            session = worldSession;
            localPlayer = player;
            remoteAvatarPrefab = avatarPrefab;
        }

        private void Start()
        {
            if (session == null) session = FindObjectOfType<WorldSessionClient>();
            if (localPlayer == null) localPlayer = FindObjectOfType<PlayerMotor>();
            localAvatar = FindObjectOfType<AvatarLocomotionDriver>();
            contentDelivery = FindObjectOfType<WorldContentDelivery>();
            if (contentDelivery == null) contentDelivery = gameObject.AddComponent<WorldContentDelivery>();
            if (remoteAvatarPrefab == null || session == null || localPlayer == null)
            {
                ConnectionStatus = "NOT CONFIGURED";
                enabled = false;
                return;
            }
            Connect();
        }

        public bool RequestHomeEntry(string homeId) =>
            RequestSpatialContext("home_enter", homeId);

        public bool RequestHomeExit() =>
            RequestSpatialContext("home_exit", "");

        public bool RequestEventJoin(string eventId) =>
            RequestSpatialContext("event_join", eventId);

        public bool RequestEventExit() =>
            RequestSpatialContext("event_exit", "");

        private bool RequestSpatialContext(string type, string id)
        {
            if (!connected || socket == null || spatialTransitionPending ||
                (type != "home_enter" && type != "home_exit" &&
                 type != "event_join" && type != "event_exit") ||
                ((type == "home_enter" || type == "event_join") && string.IsNullOrWhiteSpace(id)))
                return false;

            if (type == "home_enter" || type == "event_join")
            {
                if (contentDelivery == null)
                {
                    spatialTransitionStatus = "World content service is unavailable. You remain in the current area.";
                    return false;
                }
                string label = type == "home_enter" ? "home-interiors" : "world-event-venues";
                StartCoroutine(PreloadBeforeSpatialTransition(type, id, label));
                return true;
            }

            _ = SendSpatialContextAsync(type, id);
            return true;
        }

        private IEnumerator PreloadBeforeSpatialTransition(string type, string id, string label)
        {
            spatialTransitionPending = true;
            spatialTransitionStatus = "Downloading " + label.Replace('-', ' ') + " before travel...";
            bool completed = false;
            bool succeeded = false;
            string error = null;
            contentDelivery.EnsureContent(label, (ok, message) =>
            {
                succeeded = ok;
                error = message;
                completed = true;
            });

            while (!completed && connected && !destroying)
                yield return null;

            if (!connected || destroying)
            {
                spatialTransitionStatus = "Connection lost. You remain in the current area; retry travel when reconnected.";
                spatialTransitionPending = false;
                yield break;
            }

            if (!succeeded)
            {
                spatialTransitionStatus = "Travel cancelled: required area content could not be downloaded. " +
                    (string.IsNullOrEmpty(error) ? "Check your connection and retry." : error);
                spatialTransitionPending = false;
                yield break;
            }

            spatialTransitionStatus = "Area content ready. Requesting server admission...";
            _ = SendSpatialContextAsync(type, id);
            spatialTransitionStatus = "Travel request sent. Waiting for server admission...";
            spatialTransitionPending = false;
        }

        private void OnGUI()
        {
            if (string.IsNullOrEmpty(spatialTransitionStatus)) return;
            float scale = Mathf.Clamp(Screen.width / 900f, 0.75f, 1.25f);
            float width = Mathf.Min(Screen.width - 32f, 520f * scale);
            GUI.Box(new Rect(16f, 16f, width, 54f * scale), spatialTransitionStatus);
            if (!string.IsNullOrEmpty(pendingDistrictId) && !districtDownloadRunning &&
                (spatialTransitionStatus.StartsWith("Could not load", StringComparison.Ordinal) ||
                 spatialTransitionStatus.StartsWith("District content is ready but", StringComparison.Ordinal)))
            {
                if (GUI.Button(new Rect(24f, 48f * scale, 92f * scale, 24f * scale), "RETRY"))
                    RetryPendingDistrictContent();
            }
            if (!spatialTransitionPending && (spatialTransitionStatus.StartsWith("Travel cancelled", StringComparison.Ordinal) ||
                spatialTransitionStatus.StartsWith("Activity join cancelled", StringComparison.Ordinal)))
            {
                if (GUI.Button(new Rect(24f, 48f * scale, 92f * scale, 24f * scale), "DISMISS"))
                    spatialTransitionStatus = "";
            }
        }

        private void BeginDistrictContentDownload()
        {
            if (districtDownloadRunning || contentDelivery == null) return;
            districtDownloadRunning = true;
            spatialTransitionStatus = "Loading " + pendingDistrictName + " before entering...";
            string expectedDistrict = pendingDistrictId;
            string expectedNonce = pendingDistrictNonce;
            string label = pendingDistrictLabel;

            // A successful scene load may be waiting for a gateway acknowledgement.
            // Retry the acknowledgement without acquiring a second residency lease.
            if (pendingDistrictResidentLabel == label || activeDistrictLabel == label)
            {
                if (string.IsNullOrEmpty(pendingDistrictResidentLabel))
                    pendingDistrictResidentLabel = activeDistrictLabel;
                districtDownloadRunning = false;
                _ = SendDistrictContentReadyAsync(expectedDistrict, expectedNonce);
                return;
            }

            contentDelivery.AcquireContent(label, (ok, error) =>
            {
                districtDownloadRunning = false;
                if (pendingDistrictId != expectedDistrict || pendingDistrictNonce != expectedNonce)
                {
                    if (ok) contentDelivery.ReleaseContent(label);
                    // A newer transition may have arrived while this acquisition
                    // was in flight. Start it now rather than leaving the client
                    // stuck with districtDownloadRunning cleared and no retry.
                    if (!string.IsNullOrEmpty(pendingDistrictId))
                        BeginDistrictContentDownload();
                    return;
                }
                if (!ok)
                {
                    spatialTransitionStatus = "Could not load " + pendingDistrictName +
                        ". You are held at the district boundary. Tap RETRY when connected. " +
                        (string.IsNullOrEmpty(error) ? "" : error);
                    return;
                }
                pendingDistrictResidentLabel = label;
                spatialTransitionStatus = pendingDistrictName + " loaded. Entering district...";
                _ = SendDistrictContentReadyAsync(expectedDistrict, expectedNonce);
            });
        }

        public bool RetryPendingDistrictContent()
        {
            if (string.IsNullOrEmpty(pendingDistrictId) || districtDownloadRunning || !connected)
                return false;
            BeginDistrictContentDownload();
            return districtDownloadRunning;
        }

        private async Task SendDistrictContentReadyAsync(string districtId, string nonce)
        {
            try
            {
                if (!connected || socket == null)
                {
                    spatialTransitionStatus = "District content is loaded, but the gateway is disconnected. Reconnect and retry entry.";
                    return;
                }
                await socket.SendText(JsonUtility.ToJson(new GatewayDistrictContentReadyRequest
                {
                    districtId = districtId,
                    nonce = nonce
                }));
            }
            catch (Exception error)
            {
                Debug.LogWarning("UCENO district content acknowledgement failed: " + error.Message);
                spatialTransitionStatus = "District content is ready but the gateway acknowledgement failed. Reconnect to retry.";
            }
        }

        private async Task SendSpatialContextAsync(string type, string id)
        {
            try
            {
                await socket.SendText(JsonUtility.ToJson(new GatewayContextRequest
                {
                    type = type,
                    id = id
                }));
            }
            catch (Exception error)
            {
                Debug.LogWarning("UCENO spatial context request failed: " + error.Message);
            }
        }

        public bool RequestActivityDiscovery() =>
            SendActivityRequest(new GatewayActivityRequest { type = "activity_discover" });

        public bool RequestActivityCreate(string kind, string raceId = "", int maxParticipants = 16)
        {
            if (kind != "checkpoint_race" && kind != "dance" && kind != "sports" && kind != "adventure")
                return false;
            if (kind == "checkpoint_race" && string.IsNullOrWhiteSpace(raceId)) return false;
            if (maxParticipants < 2 || maxParticipants > 64) return false;
            return SendActivityRequest(new GatewayActivityRequest
            {
                type = "activity_create", kind = kind, raceId = raceId, maxParticipants = maxParticipants
            });
        }

        public bool RequestActivityJoin(string activityId)
        {
            if (!connected || socket == null || spatialTransitionPending || string.IsNullOrWhiteSpace(activityId))
                return false;

            GatewayActivitySessionState activity = activitySessions.Find(item => item != null && item.id == activityId);
            if (activity == null) return false;
            string label = ResolveActivityContentLabel(activity.kind);
            if (string.IsNullOrEmpty(label))
                return SendActivityRequest(new GatewayActivityRequest { type = "activity_join", id = activityId });
            if (contentDelivery == null) return false;

            StartCoroutine(PreloadBeforeActivityJoin(activityId, label));
            return true;
        }

        private static string ResolveActivityContentLabel(string kind)
        {
            switch ((kind ?? "").Trim().ToLowerInvariant())
            {
                case "sports": return "activity-sports";
                case "checkpoint_race": return "activity-racing";
                case "dance": return "activity-dance";
                case "adventure": return "activity-adventure";
                default: return "";
            }
        }

        private IEnumerator PreloadBeforeActivityJoin(string activityId, string label)
        {
            spatialTransitionPending = true;
            spatialTransitionStatus = "Preparing " + label.Replace('-', ' ') + " before joining...";
            bool completed = false;
            bool succeeded = false;
            string error = null;
            contentDelivery.EnsureContent(label, (ok, message) =>
            {
                succeeded = ok;
                error = message;
                completed = true;
            });

            while (!completed && connected && !destroying)
                yield return null;

            if (!connected || destroying)
            {
                spatialTransitionStatus = "Connection lost. Activity join was not sent.";
                spatialTransitionPending = false;
                yield break;
            }
            if (!succeeded)
            {
                spatialTransitionStatus = "Activity join cancelled: required content could not be downloaded. " +
                    (string.IsNullOrEmpty(error) ? "Check your connection and retry." : error);
                spatialTransitionPending = false;
                yield break;
            }

            spatialTransitionStatus = "Activity content ready. Requesting admission...";
            _ = SendActivityRequestAsync(new GatewayActivityRequest { type = "activity_join", id = activityId });
            spatialTransitionPending = false;
        }

        public bool RequestActivityStart(string activityId) =>
            SendActivityRequest(new GatewayActivityRequest { type = "activity_start", id = activityId });

        public bool RequestActivityLeave(string activityId) =>
            SendActivityRequest(new GatewayActivityRequest { type = "activity_leave", id = activityId });

        public bool RequestActivityCancel(string activityId) =>
            SendActivityRequest(new GatewayActivityRequest { type = "activity_cancel", id = activityId });

        private bool SendActivityRequest(GatewayActivityRequest request)
        {
            if (!connected || socket == null) return false;
            _ = SendActivityRequestAsync(request);
            return true;
        }

        private async Task SendActivityRequestAsync(GatewayActivityRequest request)
        {
            try { await socket.SendText(JsonUtility.ToJson(request)); }
            catch (Exception error)
            {
                Debug.LogWarning("UCENO activity request failed: " + error.Message);
            }
        }

        public bool RequestVoiceJoin() => SendVoiceControl("voice_join");
        public bool RequestVoiceLeave() => SendVoiceControl("voice_leave");

        private bool SendVoiceControl(string type)
        {
            if (!connected || socket == null) return false;
            _ = SendVoiceControlAsync(type);
            return true;
        }

        private async Task SendVoiceControlAsync(string type)
        {
            try { await socket.SendText(JsonUtility.ToJson(new GatewayVoiceControlRequest { type = type })); }
            catch (Exception error) { Debug.LogWarning("UCENO voice control send failed: " + error.Message); }
        }

        public bool SendVoiceSignal(string targetUserId, string signalType, string sdp,
            string candidate, string sdpMid, int sdpMLineIndex)
        {
            if (!connected || socket == null || string.IsNullOrWhiteSpace(targetUserId) ||
                (signalType != "offer" && signalType != "answer" && signalType != "candidate")) return false;
            _ = SendVoiceSignalAsync(new GatewayVoiceSignalRequest {
                targetUserId = targetUserId, signalType = signalType, sdp = sdp,
                candidate = candidate, sdpMid = sdpMid, sdpMLineIndex = sdpMLineIndex
            });
            return true;
        }

        private async Task SendVoiceSignalAsync(GatewayVoiceSignalRequest request)
        {
            try { await socket.SendText(JsonUtility.ToJson(request)); }
            catch (Exception error) { Debug.LogWarning("UCENO voice signaling send failed: " + error.Message); }
        }

        public bool RequestWardrobeRefresh()
        {
            if (!connected || socket == null) return false;
            _ = SendWardrobeRefreshAsync();
            return true;
        }

        private async Task SendWardrobeRefreshAsync()
        {
            try { await socket.SendText(JsonUtility.ToJson(new GatewayWardrobeRefreshRequest())); }
            catch (Exception error)
            {
                Debug.LogWarning("UCENO wardrobe refresh request failed: " + error.Message);
            }
        }

        public bool TriggerDance()
        {
            if (!connected || localAvatar == null) return false;
            localAvatar.TriggerDance();
            return true;
        }

        public bool RequestInteraction(string objectId, string action)
        {
            if (!connected || socket == null || string.IsNullOrWhiteSpace(objectId) ||
                (action != "toggle" && action != "use" && action != "sit" && action != "stand"))
                return false;
            _ = SendInteractionAsync(objectId, action);
            return true;
        }

        private async Task SendInteractionAsync(string objectId, string action)
        {
            try
            {
                await socket.SendText(JsonUtility.ToJson(new GatewayInteractionPacket
                {
                    objectId = objectId,
                    action = action
                }));
            }
            catch (Exception error)
            {
                Debug.LogWarning("UCENO interaction request failed: " + error.Message);
            }
        }

        public void Reconnect()
        {
            if (!destroying) _ = ReconnectAsync();
        }

        private async Task ReconnectAsync()
        {
            await CloseSocket();
            if (!destroying) Connect();
        }

        private void Connect()
        {
            if (connecting || connected || destroying) return;
            if (session == null || !session.IsAuthenticated ||
                string.IsNullOrWhiteSpace(session.InstanceEndpoint))
            {
                ConnectionStatus = "NO INSTANCE";
                return;
            }

            string endpoint;
            string selectedEndpoint = string.IsNullOrEmpty(transferEndpointOverride) ? session.InstanceEndpoint : transferEndpointOverride;
            string selectedToken = string.IsNullOrEmpty(transferTokenOverride) ? session.AccessToken : transferTokenOverride;
            try { endpoint = BuildWebSocketUrl(selectedEndpoint); }
            catch (Exception error)
            {
                ConnectionStatus = "BAD ENDPOINT";
                ScheduleReconnect();
                Debug.LogError("UCENO gateway endpoint rejected: " + error.Message);
                return;
            }

            connecting = true;
            ConnectionStatus = "CONNECTING";
            socket = new WebSocket(endpoint, new Dictionary<string, string>
            {
                { "Authorization", "Bearer " + selectedToken }
            });
            WebSocket connectionSocket = socket;
            socket.OnOpen += () =>
            {
                connecting = false;
                connected = true;
                reconnectAttempts = 0;
                ConnectionStatus = "AUTHENTICATING";
                Debug.Log("UCENO authoritative gateway transport opened.");
            };
            socket.OnMessage += HandleMessage;
            socket.OnError += error =>
            {
                Debug.LogWarning("UCENO gateway transport error: " + error);
                ConnectionStatus = "RETRYING";
            };
            socket.OnClose += code =>
            {
                if (socket != connectionSocket) return;
                connecting = false;
                connected = false;
                sendPending = false;
                if (localPlayer != null)
                {
                    localPlayer.SetServerAuthority(false);
                    localPlayer.SetSeated(false);
                }
                if (!destroying)
                {
                    if (transferringGateway)
                    {
                        transferringGateway = false;
                        pendingTransferActivityId = "";
                        transferEndpointOverride = "";
                        transferTokenOverride = "";
                        ConnectionStatus = "TRANSFER FAILED - RETRYING";
                    }
                    else ConnectionStatus = "DISCONNECTED";
                    ScheduleReconnect();
                }
                Debug.LogWarning("UCENO gateway closed: " + code);
            };
            _ = ConnectAsync(socket);
        }

        private async Task ConnectAsync(WebSocket target)
        {
            try { await target.Connect(); }
            catch (Exception error)
            {
                connecting = false;
                connected = false;
                if (transferringGateway)
                {
                    transferringGateway = false;
                    pendingTransferActivityId = "";
                    transferEndpointOverride = "";
                    transferTokenOverride = "";
                }
                ConnectionStatus = "RETRYING";
                ScheduleReconnect();
                Debug.LogWarning("UCENO gateway connection failed: " + error.Message);
            }
        }

        private void HandleMessage(byte[] bytes)
        {
            GatewayPacket packet;
            try { packet = JsonUtility.FromJson<GatewayPacket>(Encoding.UTF8.GetString(bytes)); }
            catch
            {
                Debug.LogWarning("UCENO gateway sent an unreadable packet.");
                return;
            }
            if (packet == null) return;

            if (packet.type == "welcome")
            {
                localUserId = packet.userId;
                if (!string.IsNullOrEmpty(pendingTransferActivityId))
                {
                    string activityId = pendingTransferActivityId;
                    pendingTransferActivityId = "";
                    transferringGateway = false;
                    if (!string.IsNullOrEmpty(packet.accessToken) && !string.IsNullOrEmpty(transferEndpointOverride))
                        session.SetGatewayRoute(packet.accessToken, transferEndpointOverride, packet.instanceId, packet.expiresInSeconds);
                    transferEndpointOverride = "";
                    transferTokenOverride = "";
                    _ = SendActivityRequestAsync(new GatewayActivityRequest { type = "activity_join", id = activityId });
                }
                if (packet.state != null)
                {
                    localPlayer.ApplyServerState(
                        new Vector3(packet.state.x, packet.state.y, packet.state.z),
                        packet.state.yaw);
                    localPlayer.SetServerAuthority(true);
                }
                ConnectionStatus = "ONLINE";
                RequestActivityDiscovery();
                return;
            }

            if (packet.type == "district_content_required")
            {
                pendingDistrictId = packet.districtId ?? "";
                pendingDistrictNonce = packet.nonce ?? "";
                pendingDistrictLabel = packet.contentLabel ?? "";
                pendingDistrictName = packet.districtName ?? "new district";
                if (string.IsNullOrWhiteSpace(pendingDistrictId) ||
                    string.IsNullOrWhiteSpace(pendingDistrictNonce) ||
                    string.IsNullOrWhiteSpace(pendingDistrictLabel) || contentDelivery == null)
                {
                    spatialTransitionStatus = "District content configuration is incomplete. Movement is paused at the district boundary.";
                    return;
                }
                BeginDistrictContentDownload();
                return;
            }

            if (packet.type == "district_content_accepted")
            {
                if (packet.districtId == pendingDistrictId && packet.nonce == pendingDistrictNonce)
                {
                    if (!string.IsNullOrEmpty(activeDistrictLabel) &&
                        activeDistrictLabel != pendingDistrictResidentLabel)
                        contentDelivery?.ReleaseContent(activeDistrictLabel);
                    activeDistrictLabel = pendingDistrictResidentLabel;
                    pendingDistrictResidentLabel = "";
                    spatialTransitionStatus = "";
                    pendingDistrictId = "";
                    pendingDistrictNonce = "";
                    pendingDistrictLabel = "";
                    pendingDistrictName = "";
                    districtDownloadRunning = false;
                }
                return;
            }

            if (packet.type == "district_content_exited")
            {
                if (!string.IsNullOrEmpty(activeDistrictLabel))
                    contentDelivery?.ReleaseContent(activeDistrictLabel);
                activeDistrictLabel = "";
                return;
            }

            if (packet.type == "district_content_cancelled")
            {
                if (packet.districtId == pendingDistrictId && packet.nonce == pendingDistrictNonce)
                {
                    if (!string.IsNullOrEmpty(pendingDistrictResidentLabel))
                        contentDelivery?.ReleaseContent(pendingDistrictResidentLabel);
                    pendingDistrictResidentLabel = "";
                    pendingDistrictId = "";
                    pendingDistrictNonce = "";
                    pendingDistrictLabel = "";
                    pendingDistrictName = "";
                    districtDownloadRunning = false;
                    spatialTransitionStatus = "";
                }
                return;
            }

            if (packet.type == "spatial_location_entered")
            {
                spatialTransitionStatus = "";
                if (packet.state != null && localPlayer != null)
                {
                    Vector3 spawn = new Vector3(packet.state.x, packet.state.y, packet.state.z);
                    localPlayer.ApplyServerState(spawn, packet.state.yaw);
                    localPlayer.SetServerAuthority(true);
                    SpatialLocationEntered?.Invoke(packet.contextType, packet.contextId, spawn, packet.state.yaw);
                }
                return;
            }

            if (packet.type == "spatial_location_exited")
            {
                if (packet.state != null && localPlayer != null)
                {
                    localPlayer.ApplyServerState(
                        new Vector3(packet.state.x, packet.state.y, packet.state.z),
                        packet.state.yaw);
                    localPlayer.SetServerAuthority(true);
                }
                SpatialLocationExited?.Invoke();
                return;
            }

            if (packet.type == "spatial_location_rejected")
            {
                spatialTransitionStatus = "The server denied travel. You remain in the current area.";
                Debug.LogWarning("UCENO spatial location request rejected: " + packet.code);
                SpatialLocationRejected?.Invoke(packet.code ?? "request_rejected");
                return;
            }

            if (packet.type == "activity_state" && packet.session != null)
            {
                if (spatialTransitionStatus.StartsWith("Activity content ready", StringComparison.Ordinal))
                    spatialTransitionStatus = "";
                int existingIndex = activitySessions.FindIndex(item => item.id == packet.session.id);
                if (existingIndex >= 0) activitySessions[existingIndex] = packet.session;
                else activitySessions.Insert(0, packet.session);
                if (activitySessions.Count > 64) activitySessions.RemoveRange(64, activitySessions.Count - 64);
                ActivityStateChanged?.Invoke(packet.session);
                return;
            }

            if (packet.type == "activity_discovery" && packet.sessions != null)
            {
                foreach (GatewayActivityDiscoverySession discovered in packet.sessions)
                {
                    if (discovered == null || string.IsNullOrWhiteSpace(discovered.id)) continue;
                    int existingIndex = activitySessions.FindIndex(item => item.id == discovered.id);
                    GatewayActivitySessionState state = new GatewayActivitySessionState
                    {
                        id = discovered.id, hostUserId = discovered.hostUserId,
                        raceId = discovered.raceId, instanceId = discovered.instanceId,
                        kind = discovered.kind, phase = discovered.phase,
                        createdAt = discovered.createdAt, startedAt = discovered.startedAt,
                        completedAt = discovered.completedAt, version = discovered.version,
                        maxParticipants = discovered.maxParticipants,
                        checkpointCount = discovered.checkpointCount,
                        participants = discovered.participants
                    };
                    if (existingIndex >= 0) activitySessions[existingIndex] = state;
                    else activitySessions.Insert(0, state);
                    ActivityStateChanged?.Invoke(state);
                }
                return;
            }

            if (packet.type == "activity_route_required")
            {
                ActivityRouteRequired?.Invoke(packet.endpoint ?? "", packet.sessionId ?? "");
                if (!transferringGateway && !string.IsNullOrWhiteSpace(packet.endpoint) && !string.IsNullOrWhiteSpace(packet.sessionId))
                    StartCoroutine(RequestActivityGatewayTransfer(packet.endpoint, packet.sessionId));
                return;
            }

            if (packet.type == "activity_rejected")
            {
                ActivityRejected?.Invoke(packet.code ?? "activity_rejected");
                return;
            }

            if (packet.type == "voice_presence")
            {
                VoicePeerPresenceChanged?.Invoke(packet.userId, packet.active);
                return;
            }

            if (packet.type == "voice_signal")
            {
                VoiceSignalReceived?.Invoke(packet.fromUserId, packet.signalType, packet.sdp,
                    packet.candidate, packet.sdpMid, packet.sdpMLineIndex);
                return;
            }

            if (packet.type == "voice_signal_rejected")
            {
                VoiceSignalRejected?.Invoke(packet.code ?? "voice_signal_rejected");
                return;
            }

            if (packet.type == "object_state")
            {
                if (string.IsNullOrWhiteSpace(packet.objectId) || string.IsNullOrWhiteSpace(packet.objectState))
                    return;
                if (packet.version > 0)
                {
                    if (objectStateVersions.TryGetValue(packet.objectId, out long knownVersion) &&
                        packet.version < knownVersion)
                        return;
                    objectStateVersions[packet.objectId] = packet.version;
                }
                foreach (WorldInteractable item in FindObjectsOfType<WorldInteractable>())
                    if (item != null && item.ObjectId == packet.objectId)
                        item.ApplyServerState(packet.objectState, packet.occupantId);
                if (packet.actorId == localUserId && localPlayer != null && itemKindIsSeat(packet.objectId))
                    localPlayer.SetSeated(packet.objectState == "occupied");
                return;
            }

            if (packet.type == "interaction_rejected")
            {
                Debug.LogWarning("UCENO interaction rejected: " + packet.code);
                return;
            }

            if (packet.type == "error")
            {
                ConnectionStatus = packet.code == "access_revoked" ? "ACCESS REVOKED" :
                    packet.code == "session_superseded" ? "RECONNECTING" : "GATEWAY ERROR";
                Debug.LogWarning("UCENO gateway rejected the session: " + packet.code);
                if (packet.code == "access_revoked" && session != null) session.ClearSession();
                return;
            }

            if (packet.type != "snapshot" || packet.players == null) return;
            ConnectionStatus = "ONLINE";
            float now = Time.time;
            foreach (GatewaySnapshotPlayer state in packet.players)
            {
                if (state == null || string.IsNullOrEmpty(state.userId)) continue;
                Vector3 position = new Vector3(state.x, state.y, state.z);
                if (state.userId == localUserId)
                {
                    if (localPlayer != null && localPlayer.IsServerAuthoritative)
                        localPlayer.ApplyServerState(position, state.yaw);
                    continue;
                }
                if (localPlayer == null ||
                    Vector3.Distance(localPlayer.transform.position, position) > maxVisiblePeerDistance)
                {
                    RemoveRemote(state.userId);
                    continue;
                }

                if (!remotePlayers.TryGetValue(state.userId, out RemotePlayer remote))
                {
                    if (remotePlayers.Count >= Mathf.Max(1, maxRemoteAvatars)) continue;
                    GameObject avatar = Instantiate(remoteAvatarPrefab);
                    avatar.name = "Remote Player " + state.userId;
                    remote = new RemotePlayer
                    {
                        root = avatar.transform,
                        locomotion = avatar.GetComponentInChildren<AvatarLocomotionDriver>(),
                        wardrobe = avatar.GetComponentInChildren<AvatarWardrobeController>()
                    };
                    if (remote.wardrobe == null) remote.wardrobe = avatar.AddComponent<AvatarWardrobeController>();
                    if (remote.locomotion != null) remote.locomotion.enabled = true;
                    remotePlayers.Add(state.userId, remote);
                }

                float speed = 0f;
                if (remote.hasSample)
                {
                    float elapsed = Mathf.Max(0.05f, now - remote.lastSampleTime);
                    speed = Vector3.Distance(position, remote.lastSamplePosition) / elapsed;
                }
                remote.lastSamplePosition = position;
                remote.lastSampleTime = now;
                remote.hasSample = true;
                remote.targetPosition = position;
                remote.targetRotation = Quaternion.Euler(0f, state.yaw * Mathf.Rad2Deg, 0f);
                remote.lastReceived = now;
                if (remote.locomotion != null)
                    remote.locomotion.ApplyRemoteState(Mathf.Clamp01(speed / 8f), state.seated,
                        state.sprint || speed > 6f, state.gesture ?? "none", state.gestureSequence);
                if (remote.wardrobe != null && state.wardrobe != null)
                {
                    string signature = "";
                    List<KeyValuePair<AvatarWardrobeSlot, string>> selections =
                        new List<KeyValuePair<AvatarWardrobeSlot, string>>();
                    foreach (GatewayWardrobeItemState item in state.wardrobe)
                    {
                        if (item == null || !Enum.TryParse(item.slot, true, out AvatarWardrobeSlot slot)) continue;
                        signature += item.slot + ":" + item.itemId + ";";
                        selections.Add(new KeyValuePair<AvatarWardrobeSlot, string>(slot, item.itemId));
                    }
                    if (signature != remote.wardrobeSignature)
                    {
                        remote.wardrobe.ApplyEquipped(selections);
                        remote.wardrobeSignature = signature;
                    }
                }
            }
        }

        private bool itemKindIsSeat(string objectId)
        {
            foreach (WorldInteractable item in FindObjectsOfType<WorldInteractable>())
                if (item != null && item.ObjectId == objectId) return item.Kind == "seat";
            return false;
        }

        private void Update()
        {
            socket?.DispatchMessageQueue();
            if (!connected && !connecting && !destroying && session != null &&
                session.IsAuthenticated && !string.IsNullOrWhiteSpace(session.InstanceEndpoint) &&
                Time.unscaledTime >= nextReconnectAt)
                Connect();
            if (connected && socket != null && localPlayer != null &&
                Time.unscaledTime >= nextInputAt && !sendPending)
            {
                nextInputAt = Time.unscaledTime + 1f / Mathf.Clamp(inputRate, 5f, 30f);
                SendInput();
            }

            foreach (RemotePlayer remote in remotePlayers.Values)
            {
                if (remote.root == null) continue;
                remote.root.position = Vector3.Lerp(remote.root.position, remote.targetPosition,
                    1f - Mathf.Exp(-interpolation * Time.deltaTime));
                remote.root.rotation = Quaternion.Slerp(remote.root.rotation, remote.targetRotation,
                    1f - Mathf.Exp(-interpolation * Time.deltaTime));

            }

            List<string> expired = new List<string>();
            foreach (KeyValuePair<string, RemotePlayer> entry in remotePlayers)
                if (Time.time - entry.Value.lastReceived > peerTimeout) expired.Add(entry.Key);
            foreach (string id in expired) RemoveRemote(id);
        }

        private async void SendInput()
        {
            if (sendPending || socket == null || !connected || localPlayer == null) return;
            sendPending = true;
            GatewayInputPacket input = new GatewayInputPacket
            {
                sequence = ++sequence,
                moveX = localPlayer.MovementInput.x,
                moveZ = localPlayer.MovementInput.y,
                yaw = localPlayer.Yaw * Mathf.Deg2Rad,
                sprint = localPlayer.IsSprinting,
                jump = localPlayer.ConsumeJumpRequest(),
                seated = localPlayer.IsSeated,
                gesture = localAvatar != null ? localAvatar.GestureName : "none",
                gestureSequence = localAvatar != null ? localAvatar.GestureSequence : 0
            };
            try { await socket.SendText(JsonUtility.ToJson(input)); }
            catch (Exception error) { Debug.LogWarning("UCENO gateway input send failed: " + error.Message); }
            finally { sendPending = false; }
        }

        private void ScheduleReconnect()
        {
            reconnectAttempts = Mathf.Min(reconnectAttempts + 1, 5);
            float delay = Mathf.Min(30f, 2f * Mathf.Pow(2f, reconnectAttempts - 1));
            nextReconnectAt = Time.unscaledTime + delay;
        }

        private void RemoveRemote(string id)
        {
            if (!remotePlayers.TryGetValue(id, out RemotePlayer remote)) return;
            if (remote.root != null) Destroy(remote.root.gameObject);
            remotePlayers.Remove(id);
        }

        private async Task CloseSocketAndReconnectAsync()
        {
            await CloseSocket();
            if (!destroying) Connect();
        }

        private IEnumerator RequestActivityGatewayTransfer(string targetEndpoint, string activityId)
        {
            if (!session.IsAuthenticated || string.IsNullOrWhiteSpace(session.InstanceEndpoint) ||
                string.IsNullOrWhiteSpace(targetEndpoint) || string.IsNullOrWhiteSpace(activityId)) yield break;
            Uri sourceUri;
            if (!Uri.TryCreate(session.InstanceEndpoint, UriKind.Absolute, out sourceUri) ||
                (sourceUri.Scheme != "https" && sourceUri.Scheme != "http"))
            {
                spatialTransitionStatus = "Cannot securely contact the current gateway for activity transfer.";
                yield break;
            }
            string sourceBase = new UriBuilder(sourceUri.Scheme, sourceUri.Host,
                sourceUri.IsDefaultPort ? -1 : sourceUri.Port).Uri.ToString().TrimEnd('/');
            byte[] body = Encoding.UTF8.GetBytes(JsonUtility.ToJson(
                new GatewayActivityTransferRequest { sessionId = activityId }));
            using (UnityWebRequest request = new UnityWebRequest(sourceBase + "/activity/transfer-ticket", "POST"))
            {
                request.uploadHandler = new UploadHandlerRaw(body);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.SetRequestHeader("Authorization", "Bearer " + session.AccessToken);
                request.timeout = 12;
                yield return request.SendWebRequest();
                if (request.result != UnityWebRequest.Result.Success)
                {
                    spatialTransitionStatus = "Activity gateway transfer failed. Your current world connection remains available.";
                    Debug.LogWarning("UCENO activity transfer ticket request failed: " + request.responseCode);
                    yield break;
                }
                GatewayActivityTransferResponse response =
                    JsonUtility.FromJson<GatewayActivityTransferResponse>(request.downloadHandler.text);
                if (response == null || string.IsNullOrWhiteSpace(response.ticket) ||
                    string.IsNullOrWhiteSpace(response.endpoint) || response.sessionId != activityId || response.endpoint.TrimEnd('/') != targetEndpoint.TrimEnd('/'))
                {
                    spatialTransitionStatus = "The activity gateway returned an invalid transfer ticket.";
                    yield break;
                }
                transferringGateway = true;
                pendingTransferActivityId = activityId;
                transferEndpointOverride = response.endpoint;
                transferTokenOverride = response.ticket;
                spatialTransitionStatus = "Moving to the activity instance...";
                _ = CloseSocketAndReconnectAsync();
                yield break;
            }
        }

        private static string BuildWebSocketUrl(string endpoint)
        {
            if (!Uri.TryCreate(endpoint, UriKind.Absolute, out Uri uri) ||
                !string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Query) ||
                !string.IsNullOrEmpty(uri.Fragment))
                throw new FormatException("Instance endpoint must be an absolute URL without credentials, query or fragment.");

            string scheme = uri.Scheme == "https" ? "wss" : uri.Scheme;
            if (scheme != "wss")
                throw new FormatException("Instance endpoint must use HTTPS/WSS; plaintext WebSockets are rejected.");
            string path = uri.AbsolutePath.TrimEnd('/');
            if (!path.EndsWith("/world", StringComparison.OrdinalIgnoreCase))
                path += "/world";
            return new UriBuilder(scheme, uri.Host, uri.IsDefaultPort ? -1 : uri.Port, path).Uri.ToString();
        }

        private async Task CloseSocket()
        {
            WebSocket old = socket;
            socket = null;
            connected = false;
            connecting = false;
            sendPending = false;
            if (localPlayer != null)
            {
                localPlayer.SetServerAuthority(false);
                localPlayer.SetSeated(false);
            }
            if (old == null) return;
            try { await old.Close(); } catch { }
        }

        private void OnApplicationQuit()
        {
            destroying = true;
            _ = CloseSocket();
        }

        private void OnDestroy()
        {
            if (!string.IsNullOrEmpty(activeDistrictLabel)) contentDelivery?.ReleaseContent(activeDistrictLabel);
            if (!string.IsNullOrEmpty(pendingDistrictResidentLabel)) contentDelivery?.ReleaseContent(pendingDistrictResidentLabel);
            activeDistrictLabel = "";
            pendingDistrictResidentLabel = "";
            destroying = true;
            _ = CloseSocket();
            foreach (RemotePlayer remote in remotePlayers.Values)
                if (remote.root != null) Destroy(remote.root.gameObject);
            remotePlayers.Clear();
        }
    }
}
