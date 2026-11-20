using System.Collections.Generic;
using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>
    /// Player-private treasure clues, reward receipts, inventory and hunt history.
    /// All discovery and reward authority remains on the world gateway.
    /// </summary>
    public sealed class TreasureHuntHud : MonoBehaviour
    {
        [SerializeField] private WorldGatewayClient gateway;
        private readonly List<ClueEntry> clues = new List<ClueEntry>();
        private GatewayTreasureInventoryItem[] inventory = new GatewayTreasureInventoryItem[0];
        private GatewayTreasureHistoryItem[] history = new GatewayTreasureHistoryItem[0];
        private bool visible;
        private bool showInventory;
        private bool showHistory;
        private string status = "Treasure hunts are waiting for the world gateway.";
        private Vector2 scroll;

        private sealed class ClueEntry
        {
            public string huntId;
            public string title;
            public int sequence;
            public GatewayTreasureClue clue;
        }

        private void Awake()
        {
            if (gateway == null) gateway = FindObjectOfType<WorldGatewayClient>();
            if (gateway == null) return;
            gateway.TreasureClueReceived += HandleClue;
            gateway.TreasureDiscoveryReceived += HandleDiscovery;
            gateway.TreasureInventoryReceived += HandleInventory;
            gateway.TreasureHistoryReceived += HandleHistory;
            gateway.TreasureRejected += HandleRejected;
        }

        private void OnDestroy()
        {
            if (gateway == null) return;
            gateway.TreasureClueReceived -= HandleClue;
            gateway.TreasureDiscoveryReceived -= HandleDiscovery;
            gateway.TreasureInventoryReceived -= HandleInventory;
            gateway.TreasureHistoryReceived -= HandleHistory;
            gateway.TreasureRejected -= HandleRejected;
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.T)) TogglePanel();
        }

        private void TogglePanel()
        {
            visible = !visible;
            if (!visible || gateway == null) return;
            gateway.RequestTreasureInventory();
            gateway.RequestTreasureHistory();
        }

        private void HandleClue(string huntId, string title, int sequence, GatewayTreasureClue clue)
        {
            if (string.IsNullOrWhiteSpace(huntId) || clue == null) return;
            int index = clues.FindIndex(item => item.huntId == huntId);
            ClueEntry entry = new ClueEntry {
                huntId = huntId, title = title ?? "Treasure hunt",
                sequence = sequence, clue = clue
            };
            if (index >= 0) clues[index] = entry;
            else clues.Add(entry);
            status = "A private clue is ready. Other players do not receive this route.";
        }

        private void HandleDiscovery(string objectId, bool completed, string reward,
            GatewayTreasureCollectible[] collectibles)
        {
            string message = completed
                ? "Hunt completed. Earned Credits: " + (reward ?? "0")
                : "Clue discovered. Earned Credits: " + (reward ?? "0");
            if (collectibles != null)
            {
                for (int i = 0; i < collectibles.Length; i++)
                {
                    GatewayTreasureCollectible item = collectibles[i];
                    if (item == null) continue;
                    message += " | " + item.displayName + " (" + item.rarity + ")";
                }
            }
            status = message;
            if (completed) gateway?.RequestTreasureHistory();
            gateway?.RequestTreasureInventory();
        }

        private void HandleInventory(GatewayTreasureInventoryItem[] items)
        {
            inventory = items ?? new GatewayTreasureInventoryItem[0];
        }

        private void HandleHistory(GatewayTreasureHistoryItem[] hunts)
        {
            history = hunts ?? new GatewayTreasureHistoryItem[0];
        }

        private void HandleRejected(string code)
        {
            if (!string.IsNullOrWhiteSpace(code))
                status = "Treasure request: " + code;
        }

        private void OnGUI()
        {
            float scale = Mathf.Clamp(Screen.width / 700f, 0.85f, 1.35f);
            float buttonWidth = 116f * scale;
            if (!visible)
            {
                if (GUI.Button(new Rect(Screen.width - buttonWidth - 14f, 14f, buttonWidth, 42f * scale), "TREASURE"))
                    TogglePanel();
                return;
            }

            float width = Mathf.Min(Screen.width - 24f, 480f * scale);
            float height = Mathf.Min(Screen.height - 36f, 620f * scale);
            Rect panel = new Rect(Screen.width - width - 12f, 62f * scale, width, height);
            GUILayout.BeginArea(panel, GUI.skin.box);
            GUILayout.Label("UCENO TREASURE HUNTS");
            GUILayout.Label(status, GUI.skin.label);
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("CLUES")) { showInventory = false; showHistory = false; }
            if (GUILayout.Button("INVENTORY")) { showInventory = true; showHistory = false; gateway?.RequestTreasureInventory(); }
            if (GUILayout.Button("HISTORY")) { showInventory = false; showHistory = true; gateway?.RequestTreasureHistory(); }
            if (GUILayout.Button("CLOSE")) visible = false;
            GUILayout.EndHorizontal();

            scroll = GUILayout.BeginScrollView(scroll);
            if (showInventory)
            {
                GUILayout.Label("COLLECTIBLES");
                if (inventory.Length == 0) GUILayout.Label("No collectible rewards recorded yet.");
                foreach (GatewayTreasureInventoryItem item in inventory)
                {
                    if (item == null) continue;
                    GUILayout.BeginVertical(GUI.skin.box);
                    GUILayout.Label(item.displayName + "  •  " + item.rarity.ToUpperInvariant());
                    GUILayout.Label(item.category + "  |  quantity " + item.quantity);
                    GUILayout.EndVertical();
                }
            }
            else if (showHistory)
            {
                GUILayout.Label("DISCOVERY HISTORY");
                if (history.Length == 0) GUILayout.Label("No treasure hunts recorded yet.");
                foreach (GatewayTreasureHistoryItem item in history)
                {
                    if (item == null) continue;
                    GUILayout.BeginVertical(GUI.skin.box);
                    GUILayout.Label(item.title + "  |  " + item.distributionMode);
                    GUILayout.Label(item.discoveredClues + "/" + item.totalClues +
                        " clues  |  Earned Credits: " + item.rewardEarnedCredits);
                    if (!string.IsNullOrEmpty(item.completedAt)) GUILayout.Label("Completed: " + item.completedAt);
                    GUILayout.EndVertical();
                }
            }
            else
            {
                GUILayout.Label("YOUR PRIVATE CLUES");
                if (clues.Count == 0) GUILayout.Label("No active personal clues. New hunts appear when schedules are enabled.");
                foreach (ClueEntry entry in clues)
                {
                    if (entry == null || entry.clue == null) continue;
                    GUILayout.BeginVertical(GUI.skin.box);
                    GUILayout.Label(entry.title + "  |  clue " + (entry.sequence + 1));
                    if (!string.IsNullOrEmpty(entry.clue.title)) GUILayout.Label(entry.clue.title);
                    if (!string.IsNullOrEmpty(entry.clue.hint)) GUILayout.Label(entry.clue.hint);
                    if (!string.IsNullOrEmpty(entry.clue.description)) GUILayout.Label(entry.clue.description);
                    GUILayout.Label("Difficulty: " + Mathf.Clamp(entry.clue.difficulty, 1, 5) + "/5");
                    GUILayout.EndVertical();
                }
            }
            GUILayout.EndScrollView();
            GUILayout.EndArea();
        }
    }
}
