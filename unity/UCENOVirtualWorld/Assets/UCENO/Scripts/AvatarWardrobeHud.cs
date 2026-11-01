using System.Collections.Generic;
using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>In-world wardrobe picker backed by the account-owned inventory API.</summary>
    [DisallowMultipleComponent]
    public sealed class AvatarWardrobeHud : MonoBehaviour
    {
        private static readonly string[] Slots = { "hair", "top", "outerwear", "bottom", "shoes", "accessory" };
        private AvatarWardrobeController controller;
        private AvatarWardrobeSyncClient sync;
        private WorldSessionClient session;
        private readonly Dictionary<string, int> selected = new Dictionary<string, int>();
        private bool visible;
        private string status = "Sign in to load your wardrobe.";
        private Vector2 scroll;
        private GUIStyle titleStyle;
        private GUIStyle buttonStyle;
        private GUIStyle panelStyle;
        private bool initialized;

        private void Awake()
        {
            AvatarAppearanceProfile profile = GetComponentInChildren<AvatarAppearanceProfile>();
            if (profile == null) profile = GetComponent<AvatarAppearanceProfile>();
            if (profile == null) return;
            controller = profile.GetComponent<AvatarWardrobeController>();
            if (controller == null) controller = profile.gameObject.AddComponent<AvatarWardrobeController>();
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.W)) visible = !visible;
            if (controller == null) return;
            if (session == null) session = FindObjectOfType<WorldSessionClient>();
            if (!initialized && session != null && session.IsAuthenticated)
            {
                sync = GetComponent<AvatarWardrobeSyncClient>();
                if (sync == null) sync = gameObject.AddComponent<AvatarWardrobeSyncClient>();
                sync.Initialize(session, controller);
                initialized = true;
                status = "Loading account wardrobe...";
            }
            if (sync != null && sync.IsLoaded && status == "Loading account wardrobe...")
                status = sync.Inventory.Count == 0
                    ? "No wardrobe items are assigned to this account yet."
                    : "Select an owned item and equip it.";
        }

        private void OnGUI()
        {
            if (controller == null) return;
            EnsureStyles();
            float scale = Mathf.Clamp(Screen.width / 520f, 1f, 1.55f);
            Rect toggle = new Rect(12f, 88f * scale, 132f * scale, 42f * scale);
            if (GUI.Button(toggle, visible ? "CLOSE WARDROBE" : "WARDROBE", buttonStyle))
                visible = !visible;
            if (!visible) return;

            float width = Mathf.Min(Screen.width - 24f, 340f * scale);
            float height = Mathf.Min(Screen.height - 150f * scale, 470f * scale);
            Rect panel = new Rect(Screen.width - width - 12f, Screen.height - height - 12f, width, height);
            Color old = GUI.color;
            GUI.color = new Color(0.025f, 0.035f, 0.05f, 0.96f);
            GUI.Box(panel, GUIContent.none, panelStyle);
            GUI.color = old;
            GUI.Label(new Rect(panel.x + 12f, panel.y + 8f, width - 24f, 30f * scale),
                "AVATAR WARDROBE", titleStyle);
            GUI.Label(new Rect(panel.x + 12f, panel.y + 38f * scale, width - 24f, 32f * scale),
                status, buttonStyle);

            Rect view = new Rect(panel.x + 8f, panel.y + 72f * scale,
                width - 16f, height - 82f * scale);
            float contentHeight = Slots.Length * 64f * scale;
            scroll = GUI.BeginScrollView(view, scroll,
                new Rect(0f, 0f, view.width - 16f, contentHeight));
            for (int i = 0; i < Slots.Length; i++)
                DrawSlotRow(Slots[i], i * 64f * scale, view.width - 28f, scale);
            GUI.EndScrollView();
        }

        private void DrawSlotRow(string slot, float y, float width, float scale)
        {
            float labelWidth = 78f * scale;
            GUI.Label(new Rect(4f, y, labelWidth, 28f * scale), slot.ToUpperInvariant(), buttonStyle);
            List<WardrobeInventoryItem> items = GetItems(slot);
            int index = selected.TryGetValue(slot, out int current) ? current : 0;
            if (items.Count > 0) index = Mathf.Clamp(index, 0, items.Count - 1);
            else index = 0;
            selected[slot] = index;

            float x = labelWidth + 4f;
            float buttonWidth = 34f * scale;
            if (GUI.Button(new Rect(x, y, buttonWidth, 28f * scale), "<", buttonStyle) && items.Count > 0)
                selected[slot] = (index - 1 + items.Count) % items.Count;
            string itemName = items.Count == 0 ? "No owned items" : items[index].displayName;
            GUI.Label(new Rect(x + buttonWidth, y, Mathf.Max(60f, width - x - buttonWidth * 3f), 28f * scale),
                itemName, buttonStyle);
            if (GUI.Button(new Rect(width - buttonWidth, y, buttonWidth, 28f * scale), ">", buttonStyle) && items.Count > 0)
                selected[slot] = (index + 1) % items.Count;

            if (GUI.Button(new Rect(x, y + 30f * scale, 94f * scale, 27f * scale), "EQUIP", buttonStyle))
            {
                if (items.Count == 0 || sync == null || !sync.IsLoaded)
                    status = "No owned item is available for this slot.";
                else if (sync.Equip(items[index].itemId, out string error))
                    status = items[index].displayName + " equipped.";
                else status = error;
            }
            if (GUI.Button(new Rect(x + 100f * scale, y + 30f * scale, 94f * scale, 27f * scale),
                "REMOVE", buttonStyle))
            {
                if (sync == null || !sync.IsLoaded) status = "Wardrobe is not connected.";
                else { sync.Unequip(slot); status = slot + " removed."; }
            }
        }

        private List<WardrobeInventoryItem> GetItems(string slot)
        {
            List<WardrobeInventoryItem> result = new List<WardrobeInventoryItem>();
            if (sync == null || !sync.IsLoaded) return result;
            foreach (WardrobeInventoryItem item in sync.Inventory)
                if (item != null && item.slot == slot) result.Add(item);
            return result;
        }

        private void EnsureStyles()
        {
            if (titleStyle != null) return;
            titleStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = Mathf.Max(14, Screen.width / 42),
                fontStyle = FontStyle.Bold,
                normal = { textColor = Color.white }
            };
            buttonStyle = new GUIStyle(GUI.skin.button)
            {
                fontSize = Mathf.Max(10, Screen.width / 64),
                fontStyle = FontStyle.Bold,
                wordWrap = true
            };
            panelStyle = new GUIStyle(GUI.skin.box);
        }
    }
}
