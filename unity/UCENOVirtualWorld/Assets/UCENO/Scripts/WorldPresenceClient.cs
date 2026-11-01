using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace UCENO.VirtualWorld
{
    [Serializable] internal sealed class WorldTokenWorldScope { public string world_id; }
    [Serializable] public sealed class WorldPresenceVector { public float x; public float y; public float z; }
    [Serializable] public sealed class WorldPresenceRotation { public float x; public float y; public float z; public float w = 1f; }
    [Serializable] public sealed class WorldAnimationState
    {
        public string locomotion = "idle";
        public bool seated;
        public string gesture = "none";
        public int gestureSequence;
    }
    [Serializable] public sealed class WorldPresencePeer
    {
        public string userId;
        public WorldPresenceVector position;
        public WorldPresenceRotation rotation;
        public WorldAnimationState animationState;
        public long sequence;
    }
    [Serializable] internal sealed class WorldPresencePeerList { public WorldPresencePeer[] peers; }
    [Serializable] internal sealed class WorldPresenceWrite
    {
        public WorldPresenceVector position;
        public WorldPresenceRotation rotation;
        public WorldAnimationState animationState;
        public long sequence;
    }
    [Serializable] internal sealed class WorldSessionRefreshResponse
    {
        public string accessToken;
        public string error;
        public int expiresInSeconds;
    }

    /// <summary>
    /// Sends low-frequency player presence and renders other players using the
    /// imported humanoid prefab. This is best-effort polling, not authoritative
    /// physics or anti-cheat movement replication.
    /// </summary>
    public sealed class WorldPresenceClient : MonoBehaviour
    {
        [SerializeField] private string apiBaseUrl;
        [SerializeField] private string worldId;
        [SerializeField] private WorldSessionClient session;
        [SerializeField] private PlayerMotor localPlayer;
        [SerializeField] private GameObject remoteAvatarPrefab;
        [SerializeField] private float sendInterval = 1.1f;
        [SerializeField] private float pollInterval = 1.5f;
        [SerializeField] private float interpolation = 12f;
        [SerializeField] private float peerTimeout = 35f;
        [SerializeField] private float maxVisiblePeerDistance = 110f;
        [SerializeField] private int maxRemoteAvatars = 12;

        private sealed class RemotePlayer
        {
            public Transform root;
            public Vector3 targetPosition;
            public Quaternion targetRotation;
            public float lastReceived;
            public Vector3 lastSamplePosition;
            public float lastSampleTime;
            public Animator animator;
            public AvatarLocomotionDriver locomotion;
            public bool hasMovementSample;
            public int lastGestureSequence;
        }

        private readonly Dictionary<string, RemotePlayer> remotePlayers = new Dictionary<string, RemotePlayer>();
        private float tokenExpiresAt;
        private float refreshRetryAt;
        private bool stopping;
        private long presenceSequence;
        private AvatarLocomotionDriver localAvatar;

        public int PeerCount => remotePlayers.Count;
        public string ConnectionStatus { get; private set; } = "WAITING";

        private void Start()
        {
            if (session == null) session = FindObjectOfType<WorldSessionClient>();
            if (localPlayer == null) localPlayer = FindObjectOfType<PlayerMotor>();
            localAvatar = FindObjectOfType<AvatarLocomotionDriver>();
            if (session != null && string.IsNullOrWhiteSpace(apiBaseUrl)) apiBaseUrl = session.ApiBaseUrl;
            if (session != null && string.IsNullOrWhiteSpace(worldId)) worldId = ReadWorldId(session.AccessToken);
            if (session == null || localPlayer == null || remoteAvatarPrefab == null ||
                string.IsNullOrWhiteSpace(apiBaseUrl))
            {
                Debug.LogError("UCENO multiplayer is not configured: API URL, world ID, session, player and real avatar prefab are required.");
                enabled = false;
                return;
            }
            tokenExpiresAt = Time.time + Mathf.Max(1, session.ExpiresInSeconds);
            StartCoroutine(RuntimeLoop());
        }

        private IEnumerator RuntimeLoop()
        {
            yield return new WaitUntil(() => session != null && session.IsAuthenticated);
            if (string.IsNullOrWhiteSpace(worldId)) worldId = ReadWorldId(session.AccessToken);
            tokenExpiresAt = Time.time + Mathf.Max(1, session.ExpiresInSeconds);
            ConnectionStatus = "CONNECTING";
            if (string.IsNullOrWhiteSpace(worldId))
            {
                Debug.LogError("UCENO world token is missing its world scope. Request a new entry code.");
                yield break;
            }
            while (!stopping)
            {
                // Renew before expiry; the API requires a fresh presence record.
                if (Time.time >= tokenExpiresAt - 45f && Time.time >= refreshRetryAt)
                {
                    yield return RefreshSession();
                    if (!session.IsAuthenticated) { stopping = true; break; }
                }
                yield return SendPresence();
                yield return FetchPeers();
                RemoveExpiredPeers();
                yield return new WaitForSeconds(Mathf.Max(1f, Mathf.Min(sendInterval, pollInterval)));
            }
        }

        private IEnumerator RefreshSession()
        {
            ConnectionStatus = "RENEWING";
            using (UnityWebRequest request = new UnityWebRequest(Endpoint("/session/refresh"), "POST"))
            {
                request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes("{}"));
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.SetRequestHeader("Authorization", "Bearer " + session.AccessToken);
                request.timeout = 12;
                yield return request.SendWebRequest();
                if (request.result != UnityWebRequest.Result.Success)
                {
                    if (request.responseCode == 401 || request.responseCode == 403)
                    {
                        Debug.LogWarning("UCENO world session renewal was rejected. Re-enter the world.");
                        ConnectionStatus = "SESSION EXPIRED";
                        session.ClearSession();
                    }
                    else
                    {
                        // Preserve the current token during temporary outages and
                        // retry with a short delay while it remains valid.
                        refreshRetryAt = Time.time + 8f;
                        ConnectionStatus = "RETRYING";
                        Debug.LogWarning("UCENO world session renewal failed (" + request.responseCode + "); retrying shortly.");
                    }
                    yield break;
                }
                WorldSessionRefreshResponse response = JsonUtility.FromJson<WorldSessionRefreshResponse>(request.downloadHandler.text);
                if (response == null || string.IsNullOrEmpty(response.accessToken) || response.expiresInSeconds <= 0)
                {
                    session.ClearSession();
                    yield break;
                }
                session.SetRenewedSession(response.accessToken, response.expiresInSeconds);
                tokenExpiresAt = Time.time + response.expiresInSeconds;
                refreshRetryAt = 0f;
                ConnectionStatus = "ONLINE";
                Debug.Log("UCENO world session renewed.");
            }
        }

        private IEnumerator SendPresence()
        {
            Vector3 p = localPlayer.transform.position;
            Quaternion q = localPlayer.transform.rotation;
            WorldPresenceWrite payload = new WorldPresenceWrite
            {
                position = new WorldPresenceVector { x = p.x, y = p.y, z = p.z },
                rotation = new WorldPresenceRotation { x = q.x, y = q.y, z = q.z, w = q.w },
                sequence = ++presenceSequence,
                animationState = new WorldAnimationState
                {
                    locomotion = localPlayer.IsSeated ? "idle" : localPlayer.IsSprinting ? "run" : localPlayer.AnimationSpeed > 0.01f ? "walk" : "idle",
                    seated = localPlayer.IsSeated,
                    gesture = localAvatar != null ? localAvatar.GestureName : "none",
                    gestureSequence = localAvatar != null ? localAvatar.GestureSequence : 0
                }
            };
            byte[] bytes = Encoding.UTF8.GetBytes(JsonUtility.ToJson(payload));
            using (UnityWebRequest request = new UnityWebRequest(Endpoint("/presence"), "POST"))
            {
                request.uploadHandler = new UploadHandlerRaw(bytes);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.SetRequestHeader("Authorization", "Bearer " + session.AccessToken);
                request.timeout = 10;
                yield return request.SendWebRequest();
                if (request.responseCode == 401 || request.responseCode == 403)
                {
                    Debug.LogWarning("UCENO presence rejected. World access may have expired.");
                    ConnectionStatus = "SESSION EXPIRED";
                    session.ClearSession();
                }
                else if (request.result == UnityWebRequest.Result.Success)
                    ConnectionStatus = "ONLINE";
                else if (request.responseCode != 429)
                {
                    ConnectionStatus = "RETRYING";
                    Debug.LogWarning("UCENO presence update failed: " + request.responseCode);
                }
            }
        }

        private IEnumerator FetchPeers()
        {
            using (UnityWebRequest request = UnityWebRequest.Get(Endpoint("/presence")))
            {
                request.SetRequestHeader("Authorization", "Bearer " + session.AccessToken);
                request.SetRequestHeader("Accept", "application/json");
                request.timeout = 10;
                yield return request.SendWebRequest();
                if (request.result != UnityWebRequest.Result.Success)
                {
                    if (request.responseCode == 401 || request.responseCode == 403)
                    {
                        ConnectionStatus = "SESSION EXPIRED";
                        session.ClearSession();
                    }
                    else ConnectionStatus = "RETRYING";
                    yield break;
                }
                WorldPresencePeerList response = JsonUtility.FromJson<WorldPresencePeerList>(request.downloadHandler.text);
                if (response == null || response.peers == null) yield break;
                ConnectionStatus = "ONLINE";
                foreach (WorldPresencePeer peer in response.peers)
                {
                    if (peer == null || string.IsNullOrEmpty(peer.userId) || peer.position == null || peer.rotation == null)
                        continue;

                    Vector3 peerPosition = new Vector3(peer.position.x, peer.position.y, peer.position.z);
                    bool inRange = Vector3.Distance(localPlayer.transform.position, peerPosition) <= maxVisiblePeerDistance;
                    if (!inRange)
                    {
                        if (remotePlayers.TryGetValue(peer.userId, out RemotePlayer distant))
                        {
                            if (distant.root != null) Destroy(distant.root.gameObject);
                            remotePlayers.Remove(peer.userId);
                        }
                        continue;
                    }

                    if (!remotePlayers.TryGetValue(peer.userId, out RemotePlayer remote))
                    {
                        if (remotePlayers.Count >= Mathf.Max(1, maxRemoteAvatars))
                            continue;
                        GameObject avatar = Instantiate(remoteAvatarPrefab);
                        avatar.name = "Remote Player " + peer.userId;
                        AvatarLocomotionDriver remoteDriver = avatar.GetComponentInChildren<AvatarLocomotionDriver>();
                        if (remoteDriver != null) remoteDriver.enabled = true;
                        Animator remoteAnimator = avatar.GetComponentInChildren<Animator>();
                        remote = new RemotePlayer { root = avatar.transform, animator = remoteAnimator, locomotion = remoteDriver };
                        remotePlayers.Add(peer.userId, remote);
                    }
                    float sampleTime = Time.time;
                    float replicatedSpeed = 0f;
                    if (remote.hasMovementSample)
                    {
                        float elapsed = Mathf.Max(0.05f, sampleTime - remote.lastSampleTime);
                        replicatedSpeed = Vector3.Distance(peerPosition, remote.lastSamplePosition) / elapsed;
                    }
                    remote.lastSamplePosition = peerPosition;
                    remote.lastSampleTime = sampleTime;
                    remote.hasMovementSample = true;
                    remote.targetPosition = peerPosition;
                    remote.targetRotation = new Quaternion(peer.rotation.x, peer.rotation.y, peer.rotation.z, peer.rotation.w);
                    remote.lastReceived = sampleTime;

                    // Server-validated presence samples drive the remote humanoid.
                    // A local Animator Controller uses its MoveSpeed parameter;
                    // the procedural driver handles seated poses and gestures
                    // when the imported avatar has no controller.
                    float normalizedSpeed = peer.animationState != null
                        ? (peer.animationState.locomotion == "run" ? 1f :
                           peer.animationState.locomotion == "walk" ? 0.5f : 0f)
                        : Mathf.Clamp01(replicatedSpeed / 6.5f);
                    if (remote.animator != null && remote.animator.runtimeAnimatorController != null)
                    {
                        foreach (AnimatorControllerParameter parameter in remote.animator.parameters)
                        {
                            if (parameter.name == "MoveSpeed" && parameter.type == AnimatorControllerParameterType.Float)
                                remote.animator.SetFloat(parameter.name, normalizedSpeed, 0.15f, Time.deltaTime);
                            if (peer.animationState != null && parameter.name == "IsSeated" &&
                                parameter.type == AnimatorControllerParameterType.Bool)
                                remote.animator.SetBool(parameter.name, peer.animationState.seated);
                        }
                        if (peer.animationState != null &&
                            peer.animationState.gestureSequence > remote.lastGestureSequence)
                        {
                            string trigger = peer.animationState.gesture == "wave" ? "Wave" :
                                peer.animationState.gesture == "cheer" ? "Cheer" : null;
                            if (!string.IsNullOrEmpty(trigger))
                            {
                                foreach (AnimatorControllerParameter parameter in remote.animator.parameters)
                                    if (parameter.type == AnimatorControllerParameterType.Trigger && parameter.name == trigger)
                                        remote.animator.SetTrigger(trigger);
                            }
                            remote.lastGestureSequence = peer.animationState.gestureSequence;
                        }
                    }
                    if (remote.locomotion != null && peer.animationState != null)
                        remote.locomotion.ApplyRemoteState(normalizedSpeed, peer.animationState.seated,
                            peer.animationState.locomotion == "run", peer.animationState.gesture,
                            peer.animationState.gestureSequence);
                }
            }
        }

        private void Update()
        {
            foreach (RemotePlayer remote in remotePlayers.Values)
            {
                if (remote.root == null) continue;
                remote.root.position = Vector3.Lerp(remote.root.position, remote.targetPosition,
                    1f - Mathf.Exp(-interpolation * Time.deltaTime));
                remote.root.rotation = Quaternion.Slerp(remote.root.rotation, remote.targetRotation,
                    1f - Mathf.Exp(-interpolation * Time.deltaTime));
            }
        }

        private void RemoveExpiredPeers()
        {
            List<string> expired = new List<string>();
            foreach (KeyValuePair<string, RemotePlayer> entry in remotePlayers)
                if (Time.time - entry.Value.lastReceived > peerTimeout) expired.Add(entry.Key);
            foreach (string id in expired)
            {
                if (remotePlayers[id].root != null) Destroy(remotePlayers[id].root.gameObject);
                remotePlayers.Remove(id);
            }
        }


        private static string ReadWorldId(string token)
        {
            try
            {
                string[] parts = token.Split('.');
                if (parts.Length != 3) return null;
                string payload = parts[1].Replace('-', '+').Replace('_', '/');
                payload = payload.PadRight(payload.Length + (4 - payload.Length % 4) % 4, '=');
                byte[] bytes = Convert.FromBase64String(payload);
                WorldTokenWorldScope scope = JsonUtility.FromJson<WorldTokenWorldScope>(Encoding.UTF8.GetString(bytes));
                return scope != null ? scope.world_id : null;
            }
            catch { return null; }
        }

        private string Endpoint(string suffix) =>
            apiBaseUrl.TrimEnd('/') + "/api/worlds/" + worldId + suffix;

        private void OnApplicationQuit() { stopping = true; }

        private void OnDestroy()
        {
            stopping = true;
            if (session != null && session.IsAuthenticated && !string.IsNullOrWhiteSpace(apiBaseUrl))
                StartCoroutine(RemovePresence());
            foreach (RemotePlayer remote in remotePlayers.Values)
                if (remote.root != null) Destroy(remote.root.gameObject);
            remotePlayers.Clear();
        }

        private IEnumerator RemovePresence()
        {
            using (UnityWebRequest request = UnityWebRequest.Delete(Endpoint("/presence")))
            {
                request.SetRequestHeader("Authorization", "Bearer " + session.AccessToken);
                request.timeout = 5;
                yield return request.SendWebRequest();
            }
        }
    }
}
