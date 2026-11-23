using System;
using System.Collections.Generic;
using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>
    /// Scrollable, grouped UCENO navigation overlay for mobile and desktop.
    /// Destination selection remains in the authenticated UCENO Social gateway;
    /// this menu never invents or directly teleports to a city.
    /// </summary>
    public sealed class WorldSidebarMenu : MonoBehaviour
    {
        private sealed class MenuItem
        {
            public readonly string Label;
            public readonly string Action;
            public MenuItem(string label, string action) { Label = label; Action = action; }
        }

        private static readonly MenuItem[][] Groups =
        {
            new[] { new MenuItem("Cities", "cities"), new MenuItem("My Home", "home"),
                new MenuItem("Maps", "maps"), new MenuItem("People", "people"),
                new MenuItem("Avatar", "avatar"), new MenuItem("Explore", "explore") },
            new[] { new MenuItem("Chat", "chat"), new MenuItem("Notifications", "notifications"),
                new MenuItem("Events", "events"), new MenuItem("Friends", "friends"),
                new MenuItem("Calls", "calls"), new MenuItem("Streaks", "streaks") },
            new[] { new MenuItem("Marketplace", "marketplace"), new MenuItem("Treasure Hunt", "treasure"),
                new MenuItem("Rewards", "rewards"), new MenuItem("Inventory", "inventory"),
                new MenuItem("Businesses", "businesses"), new MenuItem("Tickets", "tickets") },
            new[] { new MenuItem("Settings", "settings"), new MenuItem("Help", "help"),
                new MenuItem("About", "about"), new MenuItem("Sign Out", "signout") }
        };

        private static readonly string[] GroupTitles =
        {
            "WORLD NAVIGATION", "SOCIAL", "ACTIVITIES & ECONOMY", "ACCOUNT & SUPPORT"
        };

        [SerializeField] private WorldSessionClient session;
        [SerializeField] private WorldHomeClient homeClient;
        [SerializeField] private WorldEventsClient eventsClient;
        [SerializeField] private bool startOpen;
        public event Action<string> NavigationRequested;

        private bool open;
        private Vector2 scroll;
        private GUIStyle panel;
        private GUIStyle heading;
        private GUIStyle item;
        private GUIStyle close;
        private GUIStyle launcher;

        private void Awake()
        {
            if (session == null) session = FindObjectOfType<WorldSessionClient>();
            if (homeClient == null) homeClient = FindObjectOfType<WorldHomeClient>();
            if (eventsClient == null) eventsClient = FindObjectOfType<WorldEventsClient>();
            open = startOpen;
        }

        private void Update()
        {
            // Android Back closes the overlay first; it does not exit the world.
            if (open && Input.GetKeyDown(KeyCode.Escape)) open = false;
        }

        private void EnsureStyles()
        {
            if (panel != null) return;
            panel = new GUIStyle(GUI.skin.box)
            {
                padding = new RectOffset(16, 16, 14, 14),
                normal = { background = Texture2D.grayTexture, textColor = Color.white }
            };
            heading = new GUIStyle(GUI.skin.label)
            {
                fontSize = 13, fontStyle = FontStyle.Bold,
                normal = { textColor = new Color(0.55f, 0.82f, 1f) },
                margin = new RectOffset(2, 2, 16, 8)
            };
            item = new GUIStyle(GUI.skin.button)
            {
                fontSize = 15, alignment = TextAnchor.MiddleLeft,
                padding = new RectOffset(14, 10, 11, 11),
                fixedHeight = 46
            };
            close = new GUIStyle(GUI.skin.button) { fontSize = 20, fixedWidth = 42, fixedHeight = 42 };
            launcher = new GUIStyle(GUI.skin.button) { fontSize = 14, fontStyle = FontStyle.Bold, fixedHeight = 44 };
        }

        private void OnGUI()
        {
            EnsureStyles();
            float scale = Mathf.Clamp(Screen.width / 480f, 1f, 1.65f);
            float margin = 12f * scale;
            if (!open)
            {
                if (GUI.Button(new Rect(Screen.width - 116f * scale - margin, margin,
                    116f * scale, 44f * scale), "☰  MENU", launcher))
                    open = true;
                return;
            }

            float width = Mathf.Min(Screen.width - margin * 2f, 360f * scale);
            float height = Mathf.Min(Screen.height - margin * 2f, 760f * scale);
            Rect rect = new Rect(margin, margin, width, height);
            Color old = GUI.color;
            GUI.color = new Color(0.035f, 0.065f, 0.12f, 0.96f);
            GUI.Box(rect, GUIContent.none, panel);
            GUI.color = old;

            GUILayout.BeginArea(new Rect(rect.x + 14f, rect.y + 12f, rect.width - 28f, rect.height - 24f));
            GUILayout.BeginHorizontal();
            GUILayout.Label("UCENO  /  WORLD", heading, GUILayout.ExpandWidth(true));
            if (GUILayout.Button("×", close)) open = false;
            GUILayout.EndHorizontal();

            scroll = GUILayout.BeginScrollView(scroll, false, true);
            foreach (int groupIndex in new[] { 0, 1, 2, 3 })
            {
                GUILayout.Label(GroupTitles[groupIndex], heading);
                MenuItem[] group = Groups[groupIndex];
                for (int i = 0; i < group.Length; i += 2)
                {
                    GUILayout.BeginHorizontal();
                    DrawItem(group[i]);
                    if (i + 1 < group.Length) DrawItem(group[i + 1]);
                    GUILayout.EndHorizontal();
                }
            }
            GUILayout.EndScrollView();
            GUILayout.EndArea();
        }

        private void DrawItem(MenuItem entry)
        {
            if (GUILayout.Button(entry.Label, item, GUILayout.ExpandWidth(true)))
                Activate(entry.Action);
        }

        private void Activate(string action)
        {
            open = false;
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
