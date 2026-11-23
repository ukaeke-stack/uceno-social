using System;
using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>
    /// Responsive, scrollable UCENO navigation overlay. The menu routes users
    /// to authenticated destination selection and existing social surfaces; it
    /// never fabricates a city or bypasses server-side destination admission.
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
            {
                Icon = icon; Label = label; Action = action; Tint = tint;
            }
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
        {
            "WORLD NAVIGATION", "SOCIAL", "ACTIVITIES & ECONOMY", "ACCOUNT & SUPPORT"
        };

        [SerializeField] private WorldSessionClient session;
        [SerializeField] private WorldHomeClient homeClient;
        [SerializeField] private WorldEventsClient eventsClient;
        [SerializeField] private string accountLabel = "UCENO MEMBER";
        [SerializeField] private bool startOpen;

        public event Action<string> NavigationRequested;

        private bool open;
        private bool profileExpanded;
        private Vector2 scroll;
        private GUIStyle panel;
        private GUIStyle heading;
        private GUIStyle item;
        private GUIStyle close;
        private GUIStyle launcher;
        private GUIStyle account;

        private void Awake()
        {
            if (session == null) session = FindObjectOfType<WorldSessionClient>();
            if (homeClient == null) homeClient = FindObjectOfType<WorldHomeClient>();
            if (eventsClient == null) eventsClient = FindObjectOfType<WorldEventsClient>();
            open = startOpen;
        }

        private void Update()
        {
            // Android Back closes the topmost menu before any world-level action.
            if (open && Input.GetKeyDown(KeyCode.Escape))
            {
                if (profileExpanded) profileExpanded = false;
                else open = false;
            }
        }

        private void EnsureStyles()
        {
            if (panel != null) return;
            panel = new GUIStyle(GUI.skin.box)
            {
                padding = new RectOffset(14, 14, 12, 12),
                normal = { background = Texture2D.grayTexture, textColor = Color.white }
            };
            heading = new GUIStyle(GUI.skin.label)
            {
                fontSize = 12, fontStyle = FontStyle.Bold,
                normal = { textColor = new Color(.55f, .82f, 1f) },
                margin = new RectOffset(2, 2, 15, 7)
            };
            item = new GUIStyle(GUI.skin.button)
            {
                fontSize = 12, alignment = TextAnchor.MiddleCenter,
                wordWrap = true, padding = new RectOffset(3, 3, 5, 5),
                fixedHeight = 76
            };
            close = new GUIStyle(GUI.skin.button) { fontSize = 20, fixedWidth = 42, fixedHeight = 40 };
            launcher = new GUIStyle(GUI.skin.button) { fontSize = 14, fontStyle = FontStyle.Bold, fixedHeight = 44 };
            account = new GUIStyle(GUI.skin.button)
            {
                fontSize = 13, alignment = TextAnchor.MiddleLeft,
                padding = new RectOffset(12, 8, 8, 8), fixedHeight = 42
            };
        }

        private void OnGUI()
        {
            EnsureStyles();
            float scale = Mathf.Clamp(Screen.width / 480f, .82f, 1.45f);
            float margin = 10f * scale;
            if (!open)
            {
                if (GUI.Button(new Rect(Screen.width - 116f * scale - margin, margin,
                    116f * scale, 44f * scale), "☰  UCENO MENU", launcher))
                    open = true;
                return;
            }

            float width = Mathf.Min(Screen.width - margin * 2f, 410f * scale);
            float height = Mathf.Min(Screen.height - margin * 2f, 820f * scale);
            Rect rect = new Rect(margin, margin, width, height);
            Color previous = GUI.color;
            GUI.color = new Color(.025f, .045f, .085f, .97f);
            GUI.Box(rect, GUIContent.none, panel);
            GUI.color = previous;

            GUILayout.BeginArea(new Rect(rect.x + 12f, rect.y + 10f, rect.width - 24f, rect.height - 20f));
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("◉  " + accountLabel + "  ▾", account, GUILayout.ExpandWidth(true)))
                profileExpanded = !profileExpanded;
            if (GUILayout.Button("×", close)) { open = false; profileExpanded = false; }
            GUILayout.EndHorizontal();

            if (profileExpanded)
            {
                GUILayout.BeginVertical(GUI.skin.box);
                if (GUILayout.Button("Open UCENO Social profile", item))
                    Activate("profile");
                if (GUILayout.Button("Sign out", item))
                    Activate("signout");
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
                    DrawItem(group[i]);
                    if (i + 1 < group.Length) DrawItem(group[i + 1]);
                    if (i + 2 < group.Length) DrawItem(group[i + 2]);
                    GUILayout.EndHorizontal();
                }
            }
            GUILayout.EndScrollView();
            GUILayout.EndArea();
        }

        private void DrawItem(MenuItem entry)
        {
            Color old = GUI.backgroundColor;
            GUI.backgroundColor = entry.Tint;
            if (GUILayout.Button(entry.Icon + "\n" + entry.Label, item, GUILayout.ExpandWidth(true)))
                Activate(entry.Action);
            GUI.backgroundColor = old;
        }

        private void Activate(string action)
        {
            open = false;
            profileExpanded = false;
            if (action == "home" && homeClient != null) { homeClient.OpenMenu(); return; }
            if (action == "events" && eventsClient != null) { eventsClient.OpenMenu(); return; }
            if (action == "cities" || action == "explore")
            {
                OpenSocialPage("/world-entry", action);
                return;
            }
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
    }
}
