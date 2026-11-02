using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using LiveKit;
using UnityEngine;
using UnityEngine.Networking;
#if UNITY_ANDROID
using UnityEngine.Android;
#endif

namespace UCENO.VirtualWorld
{
    [Serializable]
    internal sealed class SpatialVoiceTokenResponse
    {
        public string token;
        public string url;
        public string room;
        public string identity;
        public string peerUserId;
        public int expiresIn;
        public string error;
    }

    /// <summary>
    /// Pair-scoped LiveKit client. A separate room is opened for each peer
    /// announced by the authoritative gateway; no client-selected room names
    /// or credentials are accepted. Voice is opt-in and defaults to muted.
    /// </summary>
    public sealed class WorldSpatialVoiceClient : MonoBehaviour
    {
        [SerializeField] private WorldSessionClient session;
        [SerializeField] private WorldGatewayClient gateway;
        [SerializeField] private PlayerMotor localPlayer;
        [SerializeField] private float maxDistance = 24f;
        [SerializeField] private float minDistance = 1.5f;
        [SerializeField] private int microphoneBitrate = 32000;

        private sealed class PeerAudio
        {
            public string userId;
            public Room room;
            public GameObject microphoneObject;
            public MicrophoneSource microphone;
            public LocalAudioTrack localTrack;
            public readonly List<GameObject> outputObjects = new List<GameObject>();
            public readonly List<AudioStream> streams = new List<AudioStream>();
            public bool connected;
            public bool remoteMuted;
        }

        private readonly Dictionary<string, PeerAudio> peers = new Dictionary<string, PeerAudio>();
        private bool voiceEnabled;
        private bool pushToTalkMode = true;
        private bool pushToTalkHeld;
        private bool localMuted = true;
        private bool speakerEnabled = true;
        private string audioRoute = "speaker";
        private bool appPaused;
        private bool voicePresenceRequested;
        private string status = "VOICE OFF";

        public bool VoiceEnabled => voiceEnabled;
        public bool IsMuted => localMuted || (pushToTalkMode && !pushToTalkHeld);
        public string Status => status;
        public string AudioRoute => audioRoute;

        private void Start()
        {
            if (session == null) session = FindObjectOfType<WorldSessionClient>();
            if (gateway == null) gateway = FindObjectOfType<WorldGatewayClient>();
            if (localPlayer == null) localPlayer = FindObjectOfType<PlayerMotor>();
        }

        public void EnableVoice()
        {
            if (voiceEnabled || appPaused) return;
            if (session == null || gateway == null || !session.IsAuthenticated)
            {
                status = "WORLD SESSION UNAVAILABLE";
                return;
            }
#if UNITY_ANDROID && !UNITY_EDITOR
            if (!Permission.HasUserAuthorizedPermission(Permission.Microphone))
            {
                Permission.RequestUserPermission(Permission.Microphone);
                status = "MICROPHONE PERMISSION REQUIRED";
                return;
            }
#endif
            if (Microphone.devices == null || Microphone.devices.Length == 0)
            {
                status = "NO MICROPHONE FOUND";
                return;
            }
            if (!SetAudioRoute(audioRoute)) status = "AUDIO ROUTE UNAVAILABLE — USING SYSTEM DEFAULT";
            voiceEnabled = true;
            localMuted = false;
            pushToTalkHeld = false;
            voicePresenceRequested = gateway.SetVoiceActive(true);
            status = "VOICE READY — HOLD TO TALK";
        }

        public void DisableVoice()
        {
            voiceEnabled = false;
            pushToTalkHeld = false;
            localMuted = true;
            if (gateway != null) gateway.SetVoiceActive(false);
            voicePresenceRequested = false;
            StopAllPeerRooms();
            ClearAudioRoute();
            status = "VOICE OFF";
        }

        public void SetPushToTalkMode(bool enabled)
        {
            pushToTalkMode = enabled;
            pushToTalkHeld = false;
            ApplyMicrophoneGate();
        }

        public void SetPushToTalkHeld(bool held)
        {
            if (!voiceEnabled || !pushToTalkMode) return;
            pushToTalkHeld = held;
            ApplyMicrophoneGate();
        }

        public void SetLocalMuted(bool muted)
        {
            localMuted = muted;
            if (muted) pushToTalkHeld = false;
            ApplyMicrophoneGate();
        }

        public void SetPeerMuted(string userId, bool muted)
        {
            if (!peers.TryGetValue(userId, out PeerAudio peer)) return;
            peer.remoteMuted = muted;
            foreach (GameObject output in peer.outputObjects)
            {
                AudioSource source = output != null ? output.GetComponent<AudioSource>() : null;
                if (source != null) source.mute = !speakerEnabled || muted;
            }
        }

        public bool SetAudioRoute(string route)
        {
            if (route != "speaker" && route != "earpiece" && route != "bluetooth") return false;
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                using (var plugin = new AndroidJavaClass("com.uceno.virtualworld.UCENOAudioRoute"))
                {
                    bool applied = plugin.CallStatic<bool>("setRoute", route);
                    if (applied) audioRoute = route;
                    else status = "AUDIO ROUTE NOT AVAILABLE";
                    return applied;
                }
            }
            catch (Exception error)
            {
                Debug.LogWarning("UCENO Android audio routing unavailable: " + error.Message);
                status = "AUDIO ROUTE UNAVAILABLE";
                return false;
            }
#else
            audioRoute = route;
            return true;
#endif
        }

        private void ClearAudioRoute()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                using (var plugin = new AndroidJavaClass("com.uceno.virtualworld.UCENOAudioRoute"))
                    plugin.CallStatic("clearRoute");
            }
            catch (Exception error) { Debug.LogWarning("UCENO audio route cleanup failed: " + error.Message); }
#endif
        }

        public void SetSpeakerEnabled(bool enabled)
        {
            speakerEnabled = enabled;
            foreach (PeerAudio peer in peers.Values)
                foreach (GameObject output in peer.outputObjects)
                {
                    AudioSource source = output != null ? output.GetComponent<AudioSource>() : null;
                    if (source != null) source.mute = !speakerEnabled || peer.remoteMuted;
                }
        }

        private void ApplyMicrophoneGate()
        {
            bool shouldTransmit = voiceEnabled && !appPaused && !localMuted &&
                (!pushToTalkMode || pushToTalkHeld);
            foreach (PeerAudio peer in peers.Values)
            {
                if (peer.microphone == null) continue;
                peer.microphone.SetMute(!shouldTransmit);
            }
        }

        private void OnEnable()
        {
            if (gateway == null) gateway = FindObjectOfType<WorldGatewayClient>();
            if (gateway == null) return;
            gateway.VoicePeerPresenceChanged += OnPeerPresenceChanged;
        }

        private void OnDisable()
        {
            if (gateway != null) gateway.VoicePeerPresenceChanged -= OnPeerPresenceChanged;
            DisableVoice();
        }

        private void OnPeerPresenceChanged(string userId, bool active)
        {
            if (!voiceEnabled || appPaused || string.IsNullOrWhiteSpace(userId)) return;
            if (active)
            {
                if (!peers.ContainsKey(userId)) StartCoroutine(ConnectPeer(userId));
            }
            else RemovePeer(userId);
        }

        private IEnumerator ConnectPeer(string userId)
        {
            if (peers.ContainsKey(userId) || !voiceEnabled || appPaused) yield break;
            var peer = new PeerAudio { userId = userId };
            peers.Add(userId, peer);

            string endpoint = session.ApiBaseUrl.TrimEnd('/') + "/api/worlds/" +
                UnityWebRequest.EscapeURL(ReadWorldId()) + "/voice-token";
            byte[] body = Encoding.UTF8.GetBytes("{\"peerUserId\":\"" + userId + "\"}");
            using (var request = new UnityWebRequest(endpoint, "POST"))
            {
                request.uploadHandler = new UploadHandlerRaw(body);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.SetRequestHeader("Authorization", "Bearer " + session.AccessToken);
                request.timeout = 8;
                yield return request.SendWebRequest();
                if (request.result != UnityWebRequest.Result.Success)
                {
                    status = "VOICE TOKEN FAILED (" + request.responseCode + ")";
                    RemovePeer(userId);
                    yield break;
                }
                SpatialVoiceTokenResponse token = JsonUtility.FromJson<SpatialVoiceTokenResponse>(request.downloadHandler.text);
                if (token == null || string.IsNullOrWhiteSpace(token.token) ||
                    string.IsNullOrWhiteSpace(token.url) || token.peerUserId != userId ||
                    token.identity != ReadUserId() || token.expiresIn <= 0 || token.expiresIn > 60 ||
                    string.IsNullOrWhiteSpace(token.room) ||
                    !token.room.StartsWith("uceno-pair-", StringComparison.Ordinal) ||
                    !Uri.TryCreate(token.url, UriKind.Absolute, out Uri voiceUri) ||
                    voiceUri.Scheme != "wss")
                {
                    status = "VOICE TOKEN INVALID";
                    RemovePeer(userId);
                    yield break;
                }
                peer.room = new Room();
                peer.room.TrackSubscribed += (track, publication, participant) => OnTrackSubscribed(peer, track, participant);
                peer.room.Disconnected += () => RemovePeer(userId);
                var connect = peer.room.Connect(token.url, token.token, new RoomOptions());
                yield return connect;
                if (connect.IsError)
                {
                    status = "VOICE CONNECTION FAILED";
                    RemovePeer(userId);
                    yield break;
                }
                peer.connected = true;
                CreateMicrophone(peer);
                status = "SPATIAL VOICE CONNECTED";
            }
        }

        private void CreateMicrophone(PeerAudio peer)
        {
            peer.microphoneObject = new GameObject("UCENO Voice Microphone " + peer.userId);
            var processing = new AudioProcessingOptions
            {
                EchoCancellation = true,
                NoiseSuppression = true,
                AutoGainControl = true
            };
            peer.microphone = new MicrophoneSource(Microphone.devices[0], peer.microphoneObject, processing);
            peer.localTrack = LocalAudioTrack.CreateAudioTrack("uceno-spatial-mic", peer.microphone, peer.room);
            var options = new TrackPublishOptions
            {
                AudioEncoding = new AudioEncoding { MaxBitrate = Mathf.Clamp(microphoneBitrate, 16000, 64000) },
                Source = TrackSource.SourceMicrophone
            };
            StartCoroutine(PublishMicrophone(peer, options));
        }

        private IEnumerator PublishMicrophone(PeerAudio peer, TrackPublishOptions options)
        {
            var publish = peer.room.LocalParticipant.PublishTrack(peer.localTrack, options);
            yield return publish;
            if (publish.IsError)
            {
                status = "MICROPHONE PUBLISH FAILED";
                RemovePeer(peer.userId);
                yield break;
            }
            peer.microphone.Start();
            peer.microphone.SetMute(IsMuted || appPaused);
            ApplyMicrophoneGate();
        }

        private void OnTrackSubscribed(PeerAudio peer, IRemoteTrack track, RemoteParticipant participant)
        {
            if (!(track is RemoteAudioTrack audioTrack) || participant.Identity != peer.userId) return;
            StartCoroutine(AttachRemoteAudioWhenAvatarExists(peer, audioTrack));
        }

        private IEnumerator AttachRemoteAudioWhenAvatarExists(PeerAudio peer, RemoteAudioTrack audioTrack)
        {
            Transform avatar = null;
            float deadline = Time.unscaledTime + 8f;
            while (Time.unscaledTime < deadline && peer != null && peers.ContainsKey(peer.userId) && voiceEnabled && !appPaused)
            {
                if (gateway != null && gateway.TryGetRemotePlayerTransform(peer.userId, out avatar)) break;
                yield return null;
            }
            if (avatar == null || peer == null || !peers.ContainsKey(peer.userId) || !peer.connected || !voiceEnabled) yield break;
            var output = new GameObject("UCENO Spatial Audio " + peer.userId);
            output.transform.SetParent(avatar, false);
            output.transform.localPosition = new Vector3(0f, 1.55f, 0f);
            var source = output.AddComponent<AudioSource>();
            source.spatialBlend = 1f;
            source.dopplerLevel = 0f;
            source.rolloffMode = AudioRolloffMode.Logarithmic;
            source.minDistance = Mathf.Max(0.1f, minDistance);
            source.maxDistance = Mathf.Clamp(maxDistance, 2f, 24f);
            source.playOnAwake = false;
            source.mute = !speakerEnabled || peer.remoteMuted;
            var stream = new AudioStream(audioTrack, source);
            peer.outputObjects.Add(output);
            peer.streams.Add(stream);
            StartCoroutine(stream.Update());
        }

        private void RemovePeer(string userId)
        {
            if (!peers.TryGetValue(userId, out PeerAudio peer)) return;
            peers.Remove(userId);
            peer.connected = false;
            if (peer.microphone != null) StopMicrophone(peer.microphone);
            if (peer.room != null)
            {
                try { _ = peer.room.Disconnect(); } catch { }
                try { peer.room.Dispose(); } catch { }
            }
            if (peer.microphoneObject != null) Destroy(peer.microphoneObject);
            foreach (GameObject output in peer.outputObjects)
                if (output != null) Destroy(output);
        }

        private void StopAllPeerRooms()
        {
            var ids = new List<string>(peers.Keys);
            foreach (string id in ids) RemovePeer(id);
        }

        private static void StopMicrophone(MicrophoneSource source)
        {
            if (source == null) return;
            source.Stop();
            source.Dispose();
        }

        private string ReadWorldId() => session != null ? session.WorldId : "";

        private string ReadUserId()
        {
            if (session == null || string.IsNullOrWhiteSpace(session.AccessToken)) return "";
            string[] parts = session.AccessToken.Split('.');
            if (parts.Length != 3) return "";
            try
            {
                string payload = parts[1].Replace('-', '+').Replace('_', '/');
                payload = payload.PadRight(payload.Length + (4 - payload.Length % 4) % 4, '=');
                string json = Encoding.UTF8.GetString(Convert.FromBase64String(payload));
                var match = System.Text.RegularExpressions.Regex.Match(json, "\"sub\"\\s*:\\s*\"([0-9a-fA-F-]{36})\"");
                return match.Success ? match.Groups[1].Value : "";
            }
            catch { return ""; }
        }

        private void Update()
        {
            if (!voiceEnabled || appPaused || gateway == null) return;
            if (gateway.ConnectionStatus != "ONLINE")
            {
                voicePresenceRequested = false;
                return;
            }
            if (!voicePresenceRequested)
                voicePresenceRequested = gateway.SetVoiceActive(true);
        }

        private void OnApplicationPause(bool paused)
        {
            appPaused = paused;
            if (paused)
            {
                pushToTalkHeld = false;
                StopAllPeerRooms();
                ClearAudioRoute();
                if (gateway != null) gateway.SetVoiceActive(false);
                voicePresenceRequested = false;
                status = "VOICE PAUSED IN BACKGROUND";
            }
            else if (voiceEnabled)
            {
                SetAudioRoute(audioRoute);
                voicePresenceRequested = gateway != null && gateway.SetVoiceActive(true);
                status = "VOICE RECONNECTING";
            }
        }

        private void OnApplicationQuit() => DisableVoice();

        private void OnGUI()
        {
            const int width = 250;
            const int height = 42;
            GUILayout.BeginArea(new Rect(12, Screen.height - 210, width, 198), GUI.skin.box);
            GUILayout.Label("UCENO SPATIAL VOICE — " + status);
            if (!voiceEnabled)
            {
                if (GUILayout.Button("Enable voice", GUILayout.Height(height))) EnableVoice();
            }
            else
            {
                if (GUILayout.Button(localMuted ? "Unmute microphone" : "Mute microphone", GUILayout.Height(34)))
                    SetLocalMuted(!localMuted);
                bool selectedPushToTalk = GUILayout.Toggle(pushToTalkMode, "Push-to-talk mode");
                if (selectedPushToTalk != pushToTalkMode) SetPushToTalkMode(selectedPushToTalk);
                if (pushToTalkMode)
                {
                    var e = Event.current;
                    Rect talkRect = GUILayoutUtility.GetRect(width - 16, height);
                    GUI.Box(talkRect, "HOLD TO TALK");
                    if (e.type == EventType.MouseDown && talkRect.Contains(e.mousePosition))
                    { SetPushToTalkHeld(true); e.Use(); }
                    if (e.type == EventType.MouseUp)
                    { SetPushToTalkHeld(false); e.Use(); }
                }
                GUILayout.Label("Output route: " + audioRoute);
                GUILayout.BeginHorizontal();
                if (GUILayout.Button("Speaker")) SetAudioRoute("speaker");
                if (GUILayout.Button("Earpiece")) SetAudioRoute("earpiece");
                if (GUILayout.Button("Bluetooth")) SetAudioRoute("bluetooth");
                GUILayout.EndHorizontal();
                if (GUILayout.Button(speakerEnabled ? "Remote audio: On" : "Remote audio: Muted", GUILayout.Height(30)))
                    SetSpeakerEnabled(!speakerEnabled);
                foreach (PeerAudio peer in peers.Values)
                {
                    bool muted = GUILayout.Toggle(peer.remoteMuted, "Mute " + peer.userId.Substring(0, Mathf.Min(8, peer.userId.Length)));
                    if (muted != peer.remoteMuted) SetPeerMuted(peer.userId, muted);
                }
                if (GUILayout.Button("Leave voice", GUILayout.Height(30))) DisableVoice();
            }
            GUILayout.EndArea();
        }
    }
}
