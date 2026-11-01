using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace UCENO.VirtualWorld
{
    [Serializable] internal sealed class WardrobeInventoryItem
    {
        public string itemId;
        public string displayName;
        public string slot;
        public string prefabKey;
        public int assetVersion;
    }
    [Serializable] internal sealed class WardrobeEquippedItem
    {
        public string slot;
        public string itemId;
    }
    [Serializable] internal sealed class WardrobeLoadResponse
    {
        public WardrobeInventoryItem[] inventory;
        public WardrobeEquippedItem[] equipped;
        public string error;
    }

    /// <summary>Loads only account-owned wardrobe items and persists server-validated slot selections.</summary>
    [DisallowMultipleComponent]
    public sealed class AvatarWardrobeSyncClient : MonoBehaviour
    {
        private WorldSessionClient session;
        private AvatarWardrobeController controller;
        private bool loading;
        private bool loaded;
        private float retryAt;

        public IReadOnlyList<WardrobeInventoryItem> Inventory => inventory;
        private WardrobeInventoryItem[] inventory = Array.Empty<WardrobeInventoryItem>();
        public bool IsLoaded => loaded;

        public void Initialize(WorldSessionClient worldSession, AvatarWardrobeController wardrobe)
        {
            session = worldSession;
            controller = wardrobe;
        }

        private void Update()
        {
            if (!loaded && !loading && session != null && session.IsAuthenticated &&
                !string.IsNullOrEmpty(session.WorldId) && Time.unscaledTime >= retryAt)
                StartCoroutine(LoadRoutine());
        }

        public bool Equip(string itemId, out string error)
        {
            error = null;
            WardrobeInventoryItem owned = Array.Find(inventory, x => x != null && x.itemId == itemId);
            if (!loaded || owned == null)
            {
                error = "This account does not own that wardrobe item.";
                return false;
            }
            if (!controller.TryEquip(itemId, out error)) return false;
            StartCoroutine(SaveSlotRoutine(owned.slot, itemId));
            return true;
        }

        public void Unequip(string slot)
        {
            if (!loaded || !IsValidSlot(slot)) return;
            if (Enum.TryParse(slot, true, out AvatarWardrobeSlot parsed))
                controller.Unequip(parsed);
            StartCoroutine(SaveSlotRoutine(slot, null));
        }

        private IEnumerator LoadRoutine()
        {
            loading = true;
            string url = BuildUrl();
            using (UnityWebRequest request = UnityWebRequest.Get(url))
            {
                request.SetRequestHeader("Authorization", "Bearer " + session.AccessToken);
                request.SetRequestHeader("Accept", "application/json");
                request.timeout = 15;
                yield return request.SendWebRequest();
                if (request.result == UnityWebRequest.Result.Success)
                {
                    WardrobeLoadResponse response = JsonUtility.FromJson<WardrobeLoadResponse>(request.downloadHandler.text);
                    inventory = response != null && response.inventory != null
                        ? response.inventory : Array.Empty<WardrobeInventoryItem>();
                    List<KeyValuePair<AvatarWardrobeSlot, string>> selections =
                        new List<KeyValuePair<AvatarWardrobeSlot, string>>();
                    if (response != null && response.equipped != null)
                    {
                        foreach (WardrobeEquippedItem item in response.equipped)
                            if (item != null && Enum.TryParse(item.slot, true, out AvatarWardrobeSlot slot))
                                selections.Add(new KeyValuePair<AvatarWardrobeSlot, string>(slot, item.itemId));
                    }
                    controller.ApplyEquipped(selections);
                    loaded = true;
                }
                else
                {
                    retryAt = Time.unscaledTime + 10f;
                    Debug.LogWarning("UCENO wardrobe load failed: " + request.responseCode);
                }
            }
            loading = false;
        }

        private IEnumerator SaveSlotRoutine(string slot, string itemId)
        {
            string value = itemId == null ? "null" : "\"" + itemId + "\"";
            string json = "{\"equipped\":{\"" + slot + "\":" + value + "}}";
            byte[] body = Encoding.UTF8.GetBytes(json);
            using (UnityWebRequest request = new UnityWebRequest(BuildUrl(), "PUT"))
            {
                request.uploadHandler = new UploadHandlerRaw(body);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Authorization", "Bearer " + session.AccessToken);
                request.SetRequestHeader("Content-Type", "application/json");
                request.timeout = 15;
                yield return request.SendWebRequest();
                if (request.result != UnityWebRequest.Result.Success)
                    Debug.LogWarning("UCENO wardrobe save failed: " + request.responseCode);
            }
        }

        private string BuildUrl() => session.ApiBaseUrl.TrimEnd('/') + "/api/worlds/" +
            UnityWebRequest.EscapeURL(session.WorldId) + "/wardrobe";

        private static bool IsValidSlot(string slot) =>
            slot == "hair" || slot == "top" || slot == "outerwear" ||
            slot == "bottom" || slot == "shoes" || slot == "accessory";
    }
}
