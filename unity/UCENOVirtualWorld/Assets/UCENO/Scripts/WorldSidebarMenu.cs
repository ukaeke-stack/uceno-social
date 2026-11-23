using System;
using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>
    /// UCENO's responsive glass-style world sidebar. Mobile navigation uses
    /// three icon columns, grouped destinations and a vertically scrollable body. The panel keeps enough transparency to preserve the live world behind it.
    /// Destination admission remains server-authorized by the existing gateway.
    /// </summary>
    public sealed class WorldSidebarMenu : MonoBehaviour
    {
        private sealed class MenuItem
        {
            public readonly string Icon;
            public readonly string Label;
            public readonly string Action;
            public readonly Color Tint;
            public MenuItem(string icon, string label, string action, Color tint)
            { Icon = icon; Label = label; Action = action; Tint = tint; }
        }

        private static readonly MenuItem[][] Groups =
        {
            new[]
            {
                new MenuItem("◎", "Cities", "cities", new Color(.05f,.55f,.88f)),
                new MenuItem("⌂", "My Home", "home", new Color(.02f,.58f,.49f)),
                new MenuItem("◫", "Maps", "maps", new Color(.05f,.55f,.88f)),
                new MenuItem("♙", "People", "people", new Color(.91f,.61f,.08f)),
                new MenuItem("♟", "Avatar", "avatar", new Color(.65f,.08f,.72f)),
                new MenuItem("⌖", "Explore", "explore", new Color(.88f,.31f,.12f))
            },
            new[]
            {
                new MenuItem("▣", "Chat", "chat", new Color(.94f,.32f,.13f)),
                new MenuItem("●", "Notifications", "notifications", new Color(.83f,.18f,.31f)),
                new MenuItem("▦", "Events", "events", new Color(.80f,.08f,.58f)),
                new MenuItem("♧", "Friends", "friends", new Color(.91f,.61f,.08f)),
                new MenuItem("☎", "Calls", "calls", new Color(.10f,.57f,.78f)),
                new MenuItem("✦", "Streaks", "streaks", new Color(.43f,.68f,.08f))
            },
            new[]
            {
                new MenuItem("◇", "Marketplace", "marketplace", new Color(.08f,.61f,.55f)),
                new MenuItem("▱", "Treasure Hunt", "treasure", new Color(.84f,.55f,.08f)),
                new MenuItem("★", "Rewards", "rewards", new Color(.84f,.55f,.08f)),
                new MenuItem("▤", "Inventory", "inventory", new Color(.15f,.49f,.73f)),
                new MenuItem("⌂", "Businesses", "businesses", new Color(.13f,.57f,.43f)),
                new MenuItem("▣", "Tickets", "tickets", new Color(.65f,.28f,.66f))
            },
            new[]
            {
                new MenuItem("⚙", "Settings", "settings", new Color(.35f,.38f,.43f)),
                new MenuItem("?", "Help", "help", new Color(.08f,.59f,.78f)),
                new MenuItem("i", "About", "about", new Color(.08f,.34f,.62f)),
                new MenuItem("⇥", "Sign Out", "signout", new Color(.72f,.08f,.28f))
            }
        };

        private static readonly string[] GroupTitles =
            { "WORLD NAVIGATION", "SOCIAL", "ACTIVITIES & ECONOMY", "ACCOUNT & SUPPORT" };

        [SerializeField] private WorldSessionClient session;
        [SerializeField] private WorldHomeClient homeClient;
        [SerializeField] private WorldEventsClient eventsClient;
        [SerializeField] private string accountLabel = "UCENO MEMBER";
        [SerializeField] private bool startOpen;

        public event Action<string> NavigationRequested;

        private bool open;
        private bool profileExpanded;
        private Vector2 scroll;
        private Texture2D glassTexture;
        private Texture2D tileTexture;
        private Texture2D iconDiscTexture;
        private Texture2D borderTexture;
        private GUIStyle heading;
        private GUIStyle label;
        private GUIStyle smallButton;
        private GUIStyle accountButton;
        private GUIStyle closeButton;

        private void Awake()
        {
            if (session == null) session = FindObjectOfType<WorldSessionClient>();
            if (homeClient == null) homeClient = FindObjectOfType<WorldHomeClient>();
            if (eventsClient == null) eventsClient = FindObjectOfType<WorldEventsClient>();
            open = startOpen;
            BuildTextures();
            BuildStyles();
        }

        private void BuildTextures()
        {
            glassTexture = MakeRoundedTexture(128, new Color32(12, 25, 48, 190), true);
            tileTexture = MakeRoundedTexture(64, new Color32(255, 255, 255, 34), true);
            iconDiscTexture = MakeCircleTexture(64);
            borderTexture = new Texture2D(1, 1, TextureFormat.RGBA32, false);
            borderTexture.SetPixel(0, 0, new Color(1f, 1f, 1f, .28f));
            borderTexture.Apply();
        }

        private static Texture2D MakeRoundedTexture(int size, Color32 fill, bool gradient)
        {
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false);
            texture.wrapMode = TextureWrapMode.Clamp;
            texture.filterMode = FilterMode.Bilinear;
            var pixels = new Color32[size * size];
            float radius = size * .12f;
            for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                float dx = Mathf.Max(radius - x, 0f, x - (size - 1 - radius));
                float dy = Mathf.Max(radius - y, 0f, y - (size - 1 - radius));
                float distance = Mathf.Sqrt(dx * dx + dy * dy);
                byte alpha = (byte)(distance > radius ? 0 :
                    distance > radius - 1.5f ? fill.a * Mathf.Clamp01(radius - distance) / 1.5f : fill.a);
                float blend = gradient ? Mathf.Lerp(.72f, 1.08f, (float)y / (size - 1)) : 1f;
                pixels[y * size + x] = new Color32(
                    (byte)Mathf.Clamp(fill.r * blend, 0, 255),
                    (byte)Mathf.Clamp(fill.g * blend, 0, 255),
                    (byte)Mathf.Clamp(fill.b * blend, 0, 255), alpha);
            }
            texture.SetPixels32(pixels);
            texture.Apply(false, true);
            return texture;
        }

        private static Texture2D MakeCircleTexture(int size)
        {
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false);
            texture.wrapMode = TextureWrapMode.Clamp;
            texture.filterMode = FilterMode.Bilinear;
            var pixels = new Color32[size * size];
            float center = (size - 1) * .5f;
            float radius = size * .47f;
            for (int y = 0; y < size; y++)
            for (int x = 0; x < size; x++)
            {
                float distance = Vector2.Distance(new Vector2(x, y), new Vector2(center, center));
                byte alpha = (byte)(distance <= radius - 1f ? 255 :
                    distance <= radius ? 255 * Mathf.Clamp01(radius - distance) : 0);
                pixels[y * size + x] = new Color32(255, 255, 255, alpha);
            }
            texture.SetPixels32(pixels);
            texture.Apply(false, true);
            return texture;
        }

        private void BuildStyles()
        {
            heading = new GUIStyle(GUI.skin.label)
            {
                fontSize = 11, fontStyle = FontStyle.Bold,
                normal = { textColor = new Color(.62f, .84f, 1f) },
                margin = new RectOffset(4, 2, 13, 5)
            };
            label = new GUIStyle(GUI.skin.label)
            {
                fontSize = 12, alignment = TextAnchor.MiddleCenter,
                wordWrap = true, normal = { textColor = Color.white }
            };
            smallButton = new GUIStyle(GUIStyle.none);
            accountButton = new GUIStyle(GUI.skin.button)
            {
                fontSize = 13, alignment = TextAnchor.MiddleLeft,
                padding = new RectOffset(12, 8, 8, 8), fixedHeight = 42,
                normal = { textColor = Color.white }
            };
            closeButton = new GUIStyle(GUI.skin.button)
            {
                fontSize = 20, fixedWidth = 42, fixedHeight = 40,
                normal = { textColor = Color.white }
            };
        }

        private void Update()
        {
            // Android Back closes the topmost menu before world-level navigation.
            if (open && Input.GetKeyDown(KeyCode.Escape))
            {
                if (profileExpanded) profileExpanded = false;
                else open = false;
            }
        }

        private void OnGUI()
        {
            if (glassTexture == null) BuildTextures();
            if (heading == null) BuildStyles();

            float scale = Mathf.Clamp(Screen.width / 480f, .82f, 1.45f);
            float margin = 10f * scale;
            if (!open)
            {
                if (GUI.Button(new Rect(Screen.width - 132f * scale - margin, margin,
                    132f * scale, 44f * scale), "☰  UCENO MENU"))
                    open = true;
                return;
            }

            float width = Mathf.Min(Screen.width - margin * 2f, 410f * scale);
            float height = Mathf.Min(Screen.height - margin * 2f, 820f * scale);
            Rect rect = new Rect(margin, margin, width, height);
            GUI.DrawTexture(rect, glassTexture, ScaleMode.StretchToFill, true);
            DrawBorder(rect, 1.2f * scale);

            GUILayout.BeginArea(new Rect(rect.x + 12f * scale, rect.y + 10f * scale,
                rect.width - 24f * scale, rect.height - 20f * scale));
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("◉  " + accountLabel + "  ▾", accountButton, GUILayout.ExpandWidth(true)))
                profileExpanded = !profileExpanded;
            if (GUILayout.Button("×", closeButton)) { open = false; profileExpanded = false; }
            GUILayout.EndHorizontal();

            if (profileExpanded)
            {
                GUILayout.BeginVertical();
                if (GUILayout.Button("Open UCENO Social profile")) Activate("profile");
                if (GUILayout.Button("Sign out")) Activate("signout");
                GUILayout.EndVertical();
            }

            scroll = GUILayout.BeginScrollView(scroll, false, true);
            for (int groupIndex = 0; groupIndex < Groups.Length; groupIndex++)
            {
                GUILayout.Label(GroupTitles[groupIndex], heading);
                MenuItem[] group = Groups[groupIndex];
                for (int i = 0; i < group.Length; i += 3)
                {
                    GUILayout.BeginHorizontal();
                    DrawItem(group[i], scale);
                    if (i + 1 < group.Length) DrawItem(group[i + 1], scale);
                    if (i + 2 < group.Length) DrawItem(group[i + 2], scale);
                    GUILayout.EndHorizontal();
                }
            }
            GUILayout.EndScrollView();
            GUILayout.EndArea();
        }

        private void DrawItem(MenuItem entry, float scale)
        {
            Rect rect = GUILayoutUtility.GetRect(0, 88f * scale, GUILayout.ExpandWidth(true));
            GUI.DrawTexture(rect, tileTexture, ScaleMode.StretchToFill, true);
            Color previous = GUI.color;
            GUI.color = entry.Tint;
            Rect disc = new Rect(rect.center.x - 21f * scale, rect.y + 5f * scale,
                42f * scale, 42f * scale);
            GUI.DrawTexture(disc, iconDiscTexture, ScaleMode.StretchToFill, true);
            GUI.color = Color.white;
            GUIStyle glyph = new GUIStyle(GUI.skin.label)
            {
                fontSize = 25, alignment = TextAnchor.MiddleCenter,
                normal = { textColor = Color.white }
            };
            GUI.Label(disc, entry.Icon, glyph);
            Rect caption = new Rect(rect.x + 2f, rect.y + 49f * scale,
                rect.width - 4f, 34f * scale);
            GUI.Label(caption, entry.Label, label);
            GUI.color = previous;
            if (GUI.Button(rect, GUIContent.none, smallButton))
                Activate(entry.Action);
        }

        private void DrawBorder(Rect rect, float thickness)
        {
            GUI.DrawTexture(new Rect(rect.x, rect.y, rect.width, thickness), borderTexture);
            GUI.DrawTexture(new Rect(rect.x, rect.yMax - thickness, rect.width, thickness), borderTexture);
            GUI.DrawTexture(new Rect(rect.x, rect.y, thickness, rect.height), borderTexture);
            GUI.DrawTexture(new Rect(rect.xMax - thickness, rect.y, thickness, rect.height), borderTexture);
        }

        private void Activate(string action)
        {
            open = false;
            profileExpanded = false;
            if (action == "home" && homeClient != null) { homeClient.OpenMenu(); return; }
            if (action == "events" && eventsClient != null) { eventsClient.OpenMenu(); return; }
            if (action == "cities" || action == "explore")
            { OpenSocialPage("/world-entry", action); return; }
            if (action == "chat") { OpenSocialPage("/messages", action); return; }
            if (action == "people" || action == "friends") { OpenSocialPage("/mutuals", action); return; }
            if (action == "calls") { OpenSocialPage("/calls", action); return; }
            if (action == "profile") { OpenSocialPage("/profile", action); return; }
            if (action == "signout") { OpenSocialPage("/api/auth/logout", action); return; }
            NavigationRequested?.Invoke(action);
        }

        private void OpenSocialPage(string path, string fallbackAction)
        {
            if (session != null && !string.IsNullOrWhiteSpace(session.ApiBaseUrl))
                Application.OpenURL(session.ApiBaseUrl.TrimEnd('/') + path);
            else NavigationRequested?.Invoke(fallbackAction);
        }

        private void OnDestroy()
        {
            if (glassTexture != null) Destroy(glassTexture);
            if (tileTexture != null) Destroy(tileTexture);
            if (iconDiscTexture != null) Destroy(iconDiscTexture);
            if (borderTexture != null) Destroy(borderTexture);
        }
    }
}
