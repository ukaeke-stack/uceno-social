using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>
    /// Small runtime status panel so the player can see position and movement
    /// state. On touch devices it also provides a hold-to-sprint control.
    /// </summary>
    public sealed class WorldStatusHud : MonoBehaviour
    {
        [SerializeField] private PlayerMotor player;
        [SerializeField] private bool showSprintControl = true;
        [SerializeField] private WorldSessionClient worldSession;
        [SerializeField] private WorldSpatialVoiceClient spatialVoice;
        private string entryCode = "";
        private string connectionMessage = "Paste a one-time world-entry code from UCENO Social.";

        private GUIStyle panelStyle;
        private GUIStyle labelStyle;
        private GUIStyle sprintStyle;
        private GUIStyle actionStyle;
        private GUIStyle seatStyle;
        private AvatarLocomotionDriver avatar;
        private WorldPresenceClient presence;
        private bool sprintToggle;
        private bool voicePanelOpen;
        private static bool voicePanelVisible;
        private GUIStyle voicePanelStyle;
        private GUIStyle voiceButtonStyle;
        private GUIStyle voiceLabelStyle;

        private void Awake()
        {
            if (player == null)
                player = GetComponentInParent<PlayerMotor>();
            avatar = GetComponentInChildren<AvatarLocomotionDriver>();
            presence = GetComponentInParent<WorldPresenceClient>();
            if (worldSession == null) worldSession = FindObjectOfType<WorldSessionClient>();
            if (spatialVoice == null) spatialVoice = FindObjectOfType<WorldSpatialVoiceClient>();

            if (Application.isMobilePlatform)
                Application.targetFrameRate = 60;
        }

        private void Update()
        {
            if (avatar == null) return;
            if (Input.GetKeyDown(KeyCode.H)) avatar.TriggerWave();
            if (Input.GetKeyDown(KeyCode.G)) avatar.TriggerCheer();
        }

        private void OnGUI()
        {
            if (player == null)
                return;

            EnsureStyles();
            float scale = Mathf.Clamp(Screen.width / 520f, 1f, 2.1f);
            float panelWidth = Mathf.Min(Screen.width - 20f, 360f * scale);
            float panelHeight = 76f * scale;
            string movement = player.MovementInput.sqrMagnitude > 0.01f ? "MOVING" : "STOPPED";
            string speed = player.IsSprinting ? "RUNNING" : movement == "MOVING" ? "WALKING" : "IDLE";
            string controls = Application.isMobilePlatform
                ? "Left side: move  |  Right side: look"
                : "WASD: move  |  Mouse: look  |  Shift: run";

            Color previousGuiColor = GUI.color;
            GUI.color = new Color(0f, 0f, 0f, 0.68f);
            GUI.Box(new Rect(10f, 10f, panelWidth, panelHeight), GUIContent.none, panelStyle);
            GUI.color = previousGuiColor;
            GUI.Label(
                new Rect(22f, 16f, panelWidth - 24f, 22f * scale),
                "UCENO VIRTUAL WORLD  •  " + speed,
                labelStyle
            );
            GUI.Label(
                new Rect(22f, 39f * scale, panelWidth - 24f, 18f * scale),
                "Position: " + player.transform.position.ToString("F1") + "   " + controls,
                labelStyle
            );

            if (worldSession != null && !worldSession.IsAuthenticated)
            {
                float connectY = 94f * scale;
                GUI.Label(new Rect(12f, connectY, panelWidth, 22f * scale), "WORLD ENTRY CODE", labelStyle);
                entryCode = GUI.TextField(new Rect(12f, connectY + 24f * scale, panelWidth * 0.62f, 38f * scale), entryCode);
                if (GUI.Button(new Rect(20f + panelWidth * 0.64f, connectY + 24f * scale, panelWidth * 0.34f - 20f, 38f * scale), "ENTER", actionStyle))
                {
                    worldSession.RedeemEntryCode(entryCode, (success, error) =>
                    {
                        connectionMessage = success ? "Connected. Multiplayer presence is starting." : error;
                        if (success) entryCode = "";
                    });
                }
                GUI.Label(new Rect(12f, connectY + 66f * scale, panelWidth, 36f * scale), connectionMessage, labelStyle);
            }
            else if (worldSession != null && worldSession.IsAuthenticated)
            {
                string network = presence == null
                    ? "WORLD SESSION ACTIVE"
                    : "WORLD " + presence.ConnectionStatus + "  |  " + presence.PeerCount + " nearby";
                GUI.Label(new Rect(12f, 94f * scale, panelWidth, 28f * scale), network, labelStyle);
            }

            DrawVoiceControls(scale);

            if (Application.isMobilePlatform && showSprintControl)
            {
                if (avatar != null)
                {
                    float actionWidth = 92f * scale;
                    float actionHeight = 46f * scale;
                    float actionY = Screen.height - 2f * actionHeight - 145f * scale;
                    if (GUI.Button(new Rect(Screen.width - actionWidth - 18f, actionY, actionWidth, actionHeight), "WAVE", actionStyle))
                        avatar.TriggerWave();
                    if (GUI.Button(new Rect(Screen.width - actionWidth - 18f, actionY - actionHeight - 8f, actionWidth, actionHeight), "CHEER", actionStyle))
                        avatar.TriggerCheer();
                }
                string seatLabel = player.IsSeated ? "STAND" : "SIT";
                Rect seatRect = GetSeatControlRect();
                if (GUI.Button(seatRect, seatLabel, seatStyle)) player.ToggleSeated();
                Rect jumpRect = GetJumpControlRect();
                if (GUI.Button(jumpRect, "JUMP", actionStyle))
                    player.RequestJump();
                // Toggle sprint on tap instead of requiring a continuous press.
                // This is more reliable on touch screens and allows the player
                // to keep steering with the other thumb.
                string sprintLabel = sprintToggle ? "RUN: ON" : "RUN";
                if (GUI.Button(GetSprintControlRect(), sprintLabel, sprintStyle))
                    sprintToggle = !sprintToggle;
                player.SetSprinting(sprintToggle);
            }
            else
            {
                sprintToggle = false;
                player.SetSprinting(false);
            }
        }


        private void DrawVoiceControls(float scale)
        {
            if (spatialVoice == null || worldSession == null || !worldSession.IsAuthenticated) return;
            EnsureVoiceStyles();
            float width = Mathf.Min(Screen.width - 24f, 310f * scale);
            float x = Screen.width - width - 12f;
            float y = 94f * scale;
            float rowHeight = 38f * scale;
            Rect toggleRect = new Rect(x, y, width, 42f * scale);
            string toggleText = spatialVoice.VoiceEnabled
                ? "VOICE ON  •  " + spatialVoice.ConnectedPeerCount + " nearby"
                : "VOICE OFF  •  TAP TO JOIN";
            if (GUI.Button(toggleRect, toggleText, voiceButtonStyle))
                voicePanelOpen = !voicePanelOpen;
            voicePanelVisible = voicePanelOpen;
            if (!voicePanelOpen) return;

            float innerWidth = width - 16f * scale;
            float left = x + 8f * scale;
            float panelHeight = (spatialVoice.VoiceEnabled ? 6f : 2f) * rowHeight + 12f * scale;
            Rect panel = new Rect(x, y + 46f * scale, width, panelHeight);
            GUI.Box(panel, GUIContent.none, voicePanelStyle);
            float currentY = panel.y + 6f * scale;
            GUI.Label(new Rect(left, currentY, innerWidth, rowHeight), spatialVoice.Status, voiceLabelStyle);
            currentY += rowHeight;

            if (!spatialVoice.VoiceEnabled)
            {
                if (GUI.Button(new Rect(left, currentY, innerWidth, rowHeight), "ENABLE PROXIMITY VOICE"))
                    spatialVoice.EnableVoice();
                return;
            }

            float half = (innerWidth - 6f * scale) * 0.5f;
            if (GUI.Button(new Rect(left, currentY, half, rowHeight),
                spatialVoice.LocalMicMuted ? "MIC MUTED" : "MIC ENABLED"))
                spatialVoice.SetLocalMuted(!spatialVoice.LocalMicMuted);
            if (GUI.Button(new Rect(left + half + 6f * scale, currentY, half, rowHeight),
                spatialVoice.PushToTalkMode ? "PTT: ON" : "OPEN MIC"))
                spatialVoice.SetPushToTalkMode(!spatialVoice.PushToTalkMode);
            currentY += rowHeight + 3f * scale;

            if (spatialVoice.PushToTalkMode)
            {
                Rect talk = new Rect(left, currentY, innerWidth, rowHeight);
                GUI.Box(talk, "HOLD TO TALK", voiceButtonStyle);
                Event e = Event.current;
                if (e.type == EventType.MouseDown && talk.Contains(e.mousePosition))
                {
                    spatialVoice.SetPushToTalkHeld(true);
                    e.Use();
                }
                else if (e.type == EventType.MouseUp && spatialVoice.PushToTalkHeld)
                {
                    spatialVoice.SetPushToTalkHeld(false);
                    e.Use();
                }
                currentY += rowHeight + 3f * scale;
            }

            string route = spatialVoice.AudioRoute.ToUpperInvariant();
            if (GUI.Button(new Rect(left, currentY, innerWidth, rowHeight),
                "OUTPUT: " + route + " (TAP TO CYCLE)"))
            {
                string next = route == "SPEAKER" ? "earpiece" :
                    route == "EARPIECE" ? "bluetooth" : "speaker";
                spatialVoice.SetAudioRoute(next);
            }
            currentY += rowHeight + 3f * scale;
            if (GUI.Button(new Rect(left, currentY, innerWidth, rowHeight),
                spatialVoice.SpeakerEnabled ? "REMOTE AUDIO: ON" : "REMOTE AUDIO: MUTED"))
                spatialVoice.SetSpeakerEnabled(!spatialVoice.SpeakerEnabled);
            currentY += rowHeight + 3f * scale;
            if (GUI.Button(new Rect(left, currentY, innerWidth, rowHeight), "LEAVE VOICE"))
                spatialVoice.DisableVoice();
        }

        private void EnsureVoiceStyles()
        {
            if (voicePanelStyle != null) return;
            voicePanelStyle = new GUIStyle(GUI.skin.box)
            {
                alignment = TextAnchor.UpperLeft,
                normal = { background = Texture2D.whiteTexture }
            };
            voiceButtonStyle = new GUIStyle(GUI.skin.button)
            {
                fontSize = Mathf.Max(12, Screen.width / 48),
                fontStyle = FontStyle.Bold,
                wordWrap = true
            };
            voiceLabelStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = Mathf.Max(11, Screen.width / 58),
                normal = { textColor = Color.white },
                wordWrap = true
            };
        }

        public static bool IsPointerOnHudControl(Vector2 screenPosition)
        {
            if (!Application.isMobilePlatform) return false;
            Vector2 guiPosition = new Vector2(screenPosition.x, Screen.height - screenPosition.y);
            if (GetSprintControlRect().Contains(guiPosition)) return true;
            float scale = Mathf.Clamp(Screen.width / 520f, 1f, 2.1f);
            float width = Mathf.Min(Screen.width - 24f, 310f * scale);
            float x = Screen.width - width - 12f;
            float y = 94f * scale;
            Rect voiceToggle = new Rect(x, y, width, 42f * scale);
            if (voiceToggle.Contains(guiPosition)) return true;
            if (voicePanelVisible)
            {
                float rowHeight = 38f * scale;
                float panelHeight = 6f * rowHeight + 12f * scale;
                Rect panel = new Rect(x, y + 46f * scale, width, panelHeight);
                if (panel.Contains(guiPosition)) return true;
            }
            return false;
        }

        public static bool IsPointerOnSprintControl(Vector2 screenPosition)
        {
            if (!Application.isMobilePlatform)
                return false;

            Vector2 guiPosition = new Vector2(screenPosition.x, Screen.height - screenPosition.y);
            return GetSprintControlRect().Contains(guiPosition);
        }

        private static Rect GetSeatControlRect()
        {
            float scale = Mathf.Clamp(Screen.width / 520f, 1f, 2.1f);
            float width = 92f * scale;
            float height = 46f * scale;
            return new Rect(Screen.width - width - 18f, Screen.height - height - 225f * scale, width, height);
        }

        private static Rect GetJumpControlRect()
        {
            float scale = Mathf.Clamp(Screen.width / 520f, 1f, 2.1f);
            float width = 118f * scale;
            float height = 58f * scale;
            return new Rect(Screen.width - width - 18f, Screen.height - height - 105f * scale, width, height);
        }

        private static Rect GetSprintControlRect()
        {
            float scale = Mathf.Clamp(Screen.width / 520f, 1f, 2.1f);
            float width = 118f * scale;
            float height = 58f * scale;
            return new Rect(Screen.width - width - 18f, Screen.height - height - 28f, width, height);
        }

        private void OnDisable()
        {
            sprintToggle = false;
            if (player != null)
                player.SetSprinting(false);
        }

        private void EnsureStyles()
        {
            if (panelStyle != null)
                return;

            panelStyle = new GUIStyle(GUI.skin.box)
            {
                alignment = TextAnchor.UpperLeft,
                normal = { background = Texture2D.whiteTexture }
            };
            labelStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = Mathf.Max(12, Screen.width / 52),
                normal = { textColor = Color.white },
                wordWrap = true
            };
            sprintStyle = new GUIStyle(GUI.skin.button)
            {
                fontSize = Mathf.Max(15, Screen.width / 38),
                fontStyle = FontStyle.Bold
            };
            actionStyle = new GUIStyle(sprintStyle);
            seatStyle = new GUIStyle(sprintStyle);
        }
    }
}
