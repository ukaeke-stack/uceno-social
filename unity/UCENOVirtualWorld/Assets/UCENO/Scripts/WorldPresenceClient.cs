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
    [Serializable] public sealed class WorldPresencePeer
    {
        public string userId;
        public WorldPresenceVector position;
        public WorldPresenceRotation rotation;
    }
    [Serializable] internal sealed class WorldPresencePeerList { public WorldPresencePeer[] peers; }
    [Serializable] internal sealed class WorldPresenceWrite
    {
        public WorldPresenceVector position;
        public WorldPresenceRotation rotation;
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

        private sealed class RemotePlayer
        {
            public Transform root;
            public Vector3 targetPosition;
            public Quaternion targetRotation;
            public float lastReceived;
        }

        private readonly Dictionary<string, RemotePlayer> remotePlayers = new Dictionary<string, RemotePlayer>();
        private float tokenExpiresAt;
        private bool stopping;

        private void Start()
        {
            if (session == null) session = FindObjectOfType<WorldSessionClient>();
            if (localPlayer == null) localPlayer = FindObjectOfType<PlayerMotor>();
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
            if (string.IsNullOrWhiteSpace(worldId))
            {
                Debug.LogError("UCENO world token is missing its world scope. Request a new entry code.");
                yield break;
            }
            while (!stopping)
            {
                if (Time.time >= tokenExpiresAt - 45f)
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
                    Debug.LogWarning("UCENO world session renewal failed (" + request.responseCode + "). Re-enter the world.");
                    session.ClearSession();
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
            }
        }

        private IEnumerator SendPresence()
        {
            Vector3 p = localPlayer.transform.position;
            Quaternion q = localPlayer.transform.rotation;
            WorldPresenceWrite payload = new WorldPresenceWrite
            {
                position = new WorldPresenceVector { x = p.x, y = p.y, z = p.z },
                rotation = new WorldPresenceRotation { x = q.x, y = q.y, z = q.z, w = q.w }
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
                    session.ClearSession();
                }
                else if (request.result != UnityWebRequest.Result.Success && request.responseCode != 429)
                    Debug.LogWarning("UCENO presence update failed: " + request.responseCode);
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
                    if (request.responseCode == 401 || request.responseCode == 403) session.ClearSession();
                    yield break;
                }
                WorldPresencePeerList response = JsonUtility.FromJson<WorldPresencePeerList>(request.downloadHandler.text);
                if (response == null || response.peers == null) yield break;
                foreach (WorldPresencePeer peer in response.peers)
                {
                    if (peer == null || string.IsNullOrEmpty(peer.userId) || peer.position == null || peer.rotation == null)
                        continue;
                    if (!remotePlayers.TryGetValue(peer.userId, out RemotePlayer remote))
                    {
                        GameObject avatar = Instantiate(remoteAvatarPrefab);
                        avatar.name = "Remote Player " + peer.userId;
                        foreach (AvatarLocomotionDriver driver in avatar.GetComponentsInChildren<AvatarLocomotionDriver>())
                            driver.enabled = false;
                        remote = new RemotePlayer { root = avatar.transform };
                        remotePlayers.Add(peer.userId, remote);
                    }
                    remote.targetPosition = new Vector3(peer.position.x, peer.position.y, peer.position.z);
                    remote.targetRotation = new Quaternion(peer.rotation.x, peer.rotation.y, peer.rotation.z, peer.rotation.w);
                    remote.lastReceived = Time.time;
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
