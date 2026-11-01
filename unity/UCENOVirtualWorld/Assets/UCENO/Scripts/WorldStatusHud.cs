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

        private GUIStyle panelStyle;
        private GUIStyle labelStyle;
        private GUIStyle sprintStyle;

        private void Awake()
        {
            if (player == null)
                player = GetComponentInParent<PlayerMotor>();

            if (Application.isMobilePlatform)
                Application.targetFrameRate = 60;
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

            if (Application.isMobilePlatform && showSprintControl)
            {
                bool held = GUI.RepeatButton(GetSprintControlRect(), "RUN", sprintStyle);
                player.SetSprinting(held);
            }
            else
            {
                player.SetSprinting(false);
            }
        }

        public static bool IsPointerOnSprintControl(Vector2 screenPosition)
        {
            if (!Application.isMobilePlatform)
                return false;

            Vector2 guiPosition = new Vector2(screenPosition.x, Screen.height - screenPosition.y);
            return GetSprintControlRect().Contains(guiPosition);
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
        }
    }
}
