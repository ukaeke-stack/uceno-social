using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using NativeWebSocket;
using UnityEngine;

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
        public bool voiceActive;
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

    [Serializable] internal sealed class GatewayPacket
    {
        public string type;
        public string userId;
        public string code;
        public string contextType;
        public string contextId;
        public string activityType;
        public string locationLabel;
        public string homeId;
        public string eventId;
        public string objectId;
        public string objectState;
        public string actorId;
        public string occupantId;
        public GatewayVectorState state;
        public GatewaySnapshotPlayer[] players;
        public GatewayActivitySessionState session;
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
            public bool voiceActive;
            public bool voiceNearby;
        }

        private readonly Dictionary<string, RemotePlayer> remotePlayers = new Dictionary<string, RemotePlayer>();
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

        public string ConnectionStatus { get; private set; } = "WAITING";
        public int PeerCount => remotePlayers.Count;
        public string LocalUserId => localUserId;
        public event Action<string, string, Vector3, float> SpatialLocationEntered;
        public event Action SpatialLocationExited;
        public event Action<string> SpatialLocationRejected;
        public event Action<GatewayActivitySessionState> ActivityStateChanged;
        public event Action<string> ActivityRejected;
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
            if (!connected || socket == null ||
                (type != "home_enter" && type != "home_exit" &&
                 type != "event_join" && type != "event_exit") ||
                ((type == "home_enter" || type == "event_join") && string.IsNullOrWhiteSpace(id)))
                return false;
            _ = SendSpatialContextAsync(type, id);
            return true;
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

        public bool RequestActivityJoin(string activityId) =>
            SendActivityRequest(new GatewayActivityRequest { type = "activity_join", id = activityId });

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
            try { endpoint = BuildWebSocketUrl(session.InstanceEndpoint); }
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
                { "Authorization", "Bearer " + session.AccessToken }
            });
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
                    ConnectionStatus = "DISCONNECTED";
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
                if (packet.state != null)
                {
                    localPlayer.ApplyServerState(
                        new Vector3(packet.state.x, packet.state.y, packet.state.z),
                        packet.state.yaw);
                    localPlayer.SetServerAuthority(true);
                }
                ConnectionStatus = "ONLINE";
                return;
            }

            if (packet.type == "spatial_location_entered")
            {
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
                Debug.LogWarning("UCENO spatial location request rejected: " + packet.code);
                SpatialLocationRejected?.Invoke(packet.code ?? "request_rejected");
                return;
            }

            if (packet.type == "activity_state" && packet.session != null)
            {
                int existingIndex = activitySessions.FindIndex(item => item.id == packet.session.id);
                if (existingIndex >= 0) activitySessions[existingIndex] = packet.session;
                else activitySessions.Insert(0, packet.session);
                if (activitySessions.Count > 64) activitySessions.RemoveRange(64, activitySessions.Count - 64);
                ActivityStateChanged?.Invoke(packet.session);
                return;
            }

            if (packet.type == "activity_rejected")
            {
                ActivityRejected?.Invoke(packet.code ?? "activity_rejected");
                return;
            }

            if (packet.type == "voice_presence")
            {
                VoicePeerPresenceChanged?.Invoke(packet.userId, packet.voiceActive);
                return;
            }

            if (packet.type == "voice_signal")
            {
                VoiceSignalReceived?.Invoke(packet.userId, packet.signalType, packet.sdp,
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
                ConnectionStatus = packet.code == "access_revoked" ? "ACCESS REVOKED" : "GATEWAY ERROR";
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
                remote.voiceActive = state.voiceActive;
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
                bool nearbyVoice = remote.voiceActive && localPlayer != null &&
                    Vector3.Distance(localPlayer.transform.position, remote.root.position) <= 24f;
                if (nearbyVoice != remote.voiceNearby)
                {
                    remote.voiceNearby = nearbyVoice;
                    VoicePeerPresenceChanged?.Invoke(remote.root.name.Replace("Remote Player ", ""), nearbyVoice);
                }
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
            if (remote.voiceNearby) VoicePeerPresenceChanged?.Invoke(id, false);
            if (remote.root != null) Destroy(remote.root.gameObject);
            remotePlayers.Remove(id);
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
            destroying = true;
            _ = CloseSocket();
            foreach (RemotePlayer remote in remotePlayers.Values)
                if (remote.root != null) Destroy(remote.root.gameObject);
            remotePlayers.Clear();
        }
    }
}
