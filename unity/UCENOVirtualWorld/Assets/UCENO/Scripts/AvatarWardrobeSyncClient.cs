using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace UCENO.VirtualWorld
{
    [Serializable] public sealed class WardrobeInventoryItem
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
        private bool saving;
        private string loadedUserId;
        private string loadedWorldId;
        private int accountGeneration;
        private readonly Dictionary<string, string> pendingEquipment = new Dictionary<string, string>();

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
            if (session != null && (loadedUserId != session.UserId || loadedWorldId != session.WorldId))
            {
                accountGeneration++;
                StopAllCoroutines();
                loading = false;
                saving = false;
                loaded = false;
                inventory = Array.Empty<WardrobeInventoryItem>();
                pendingEquipment.Clear();
                loadedUserId = session.UserId;
                loadedWorldId = session.WorldId;
                if (controller != null)
                    controller.ApplyEquipped(Array.Empty<KeyValuePair<AvatarWardrobeSlot, string>>());
            }
            if (!loaded && !loading && session != null && session.IsAuthenticated &&
                !string.IsNullOrEmpty(session.WorldId) && !string.IsNullOrEmpty(session.UserId) && Time.unscaledTime >= retryAt)
                StartCoroutine(LoadRoutine());
            if (loaded && !saving && pendingEquipment.Count > 0 &&
                session != null && session.IsAuthenticated && Time.unscaledTime >= retryAt)
                StartCoroutine(SavePendingRoutine());
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
            if (owned.assetVersion > 0 && !string.IsNullOrWhiteSpace(owned.prefabKey))
            {
                string requestedUserId = session.UserId;
                string requestedWorldId = session.WorldId;
                int requestedGeneration = accountGeneration;
                controller.EquipAddressable(itemId, owned.prefabKey, owned.assetVersion, (success, loadError) =>
                {
                    if (success && session != null && session.UserId == requestedUserId &&
                        session.WorldId == requestedWorldId && accountGeneration == requestedGeneration && loaded)
                        QueueSaveSlot(owned.slot, itemId);
                    else if (!success)
                        Debug.LogWarning("UCENO versioned wardrobe equip failed (" + itemId + "): " + loadError);
                }, () => session != null && session.UserId == requestedUserId &&
                    session.WorldId == requestedWorldId && accountGeneration == requestedGeneration && loaded);
                return true;
            }
            if (!controller.TryEquip(itemId, owned.prefabKey, out error)) return false;
            QueueSaveSlot(owned.slot, itemId);
            return true;
        }

        public void Unequip(string slot)
        {
            if (!loaded || !IsValidSlot(slot)) return;
            if (Enum.TryParse(slot, true, out AvatarWardrobeSlot parsed))
                controller.Unequip(parsed);
            QueueSaveSlot(slot, null);
        }

        private IEnumerator LoadRoutine()
        {
            loading = true;
            string requestedUserId = session.UserId;
            string requestedWorldId = session.WorldId;
            int requestedGeneration = accountGeneration;
            string url = BuildUrl();
            using (UnityWebRequest request = UnityWebRequest.Get(url))
            {
                request.SetRequestHeader("Authorization", "Bearer " + session.AccessToken);
                request.SetRequestHeader("Accept", "application/json");
                request.timeout = 15;
                yield return request.SendWebRequest();
                if (session == null || session.UserId != requestedUserId ||
                    session.WorldId != requestedWorldId || accountGeneration != requestedGeneration) { loading = false; yield break; }
                if (request.result == UnityWebRequest.Result.Success)
                {
                    WardrobeLoadResponse response = JsonUtility.FromJson<WardrobeLoadResponse>(request.downloadHandler.text);
                    inventory = response != null && response.inventory != null
                        ? response.inventory : Array.Empty<WardrobeInventoryItem>();
                    // Clear stale local selections first, then resolve each server-owned
                    // item using its immutable Addressables key/version when available.
                    controller.ApplyEquipped(Array.Empty<KeyValuePair<AvatarWardrobeSlot, string>>());
                    if (response != null && response.equipped != null)
                    {
                        foreach (WardrobeEquippedItem item in response.equipped)
                        {
                            if (item == null || !Enum.TryParse(item.slot, true, out AvatarWardrobeSlot slot))
                                continue;
                            WardrobeInventoryItem owned = Array.Find(inventory,
                                candidate => candidate != null && candidate.itemId == item.itemId);
                            if (owned == null ||
                                !Enum.TryParse(owned.slot, true, out AvatarWardrobeSlot ownedSlot) ||
                                ownedSlot != slot)
                            {
                                Debug.LogWarning("UCENO ignored a saved wardrobe selection with an invalid inventory slot (" +
                                    item.itemId + ").");
                                continue;
                            }
                            if (owned.assetVersion > 0 && !string.IsNullOrWhiteSpace(owned.prefabKey))
                            {
                                controller.EquipAddressable(owned.itemId, owned.prefabKey, owned.assetVersion,
                                    (success, loadError) =>
                                    {
                                        if (!success) Debug.LogWarning("UCENO saved wardrobe item could not load (" +
                                            owned.itemId + "): " + loadError);
                                    }, () => session != null && session.UserId == requestedUserId &&
                                        session.WorldId == requestedWorldId && accountGeneration == requestedGeneration);
                            }
                            else if (!controller.TryEquip(owned.itemId, owned.prefabKey, out string equipError))
                            {
                                Debug.LogWarning("UCENO legacy wardrobe item could not load (" +
                                    owned.itemId + "): " + equipError);
                            }
                        }
                    }
                    loaded = true;
                    loadedUserId = session.UserId;
                }
                else
                {
                    retryAt = Time.unscaledTime + 10f;
                    Debug.LogWarning("UCENO wardrobe load failed: " + request.responseCode);
                }
            }
            loading = false;
        }

        private void QueueSaveSlot(string slot, string itemId)
        {
            pendingEquipment[slot] = itemId;
            if (!saving) StartCoroutine(SavePendingRoutine());
        }

        private IEnumerator SavePendingRoutine()
        {
            saving = true;
            string requestedUserId = session != null ? session.UserId : null;
            string requestedWorldId = session != null ? session.WorldId : null;
            int requestedGeneration = accountGeneration;
            while (pendingEquipment.Count > 0 && session != null &&
                session.UserId == requestedUserId && session.WorldId == requestedWorldId &&
                accountGeneration == requestedGeneration)
            {
                Dictionary<string, string> batch = new Dictionary<string, string>(pendingEquipment);
                pendingEquipment.Clear();
                StringBuilder json = new StringBuilder("{\"equipped\":{");
                bool first = true;
                foreach (KeyValuePair<string, string> item in batch)
                {
                    if (!first) json.Append(",");
                    first = false;
                    json.Append("\"").Append(item.Key).Append("\":");
                    if (item.Value == null) json.Append("null");
                    else json.Append("\"").Append(item.Value).Append("\"");
                }
                json.Append("}}");
                byte[] body = Encoding.UTF8.GetBytes(json.ToString());
                bool saved = false;
                long responseCode = 0;
                using (UnityWebRequest request = new UnityWebRequest(BuildUrl(), "PUT"))
                {
                    request.uploadHandler = new UploadHandlerRaw(body);
                    request.downloadHandler = new DownloadHandlerBuffer();
                    request.SetRequestHeader("Authorization", "Bearer " + session.AccessToken);
                    request.SetRequestHeader("Content-Type", "application/json");
                    request.timeout = 15;
                    yield return request.SendWebRequest();
                    if (session == null || session.UserId != requestedUserId ||
                        session.WorldId != requestedWorldId || accountGeneration != requestedGeneration) { saving = false; yield break; }
                    saved = request.result == UnityWebRequest.Result.Success;
                    responseCode = request.responseCode;
                    if (!saved) Debug.LogWarning("UCENO wardrobe save failed: " + responseCode);
                }
                if (saved)
                {
                    WorldGatewayClient gateway = FindObjectOfType<WorldGatewayClient>();
                    if (gateway != null) gateway.RequestWardrobeRefresh();
                }
                else if (responseCode == 0 || responseCode >= 500)
                {
                    foreach (KeyValuePair<string, string> item in batch)
                        if (!pendingEquipment.ContainsKey(item.Key))
                            pendingEquipment[item.Key] = item.Value;
                    retryAt = Time.unscaledTime + 10f;
                    break;
                }
                else
                {
                    // A permanent validation/auth failure must not retry forever.
                    // Reload the server selection to roll back the local preview.
                    loaded = false;
                    retryAt = Time.unscaledTime + 1f;
                    break;
                }
            }
            saving = false;
        }

        private string BuildUrl() => session.ApiBaseUrl.TrimEnd('/') + "/api/worlds/" +
            UnityWebRequest.EscapeURL(session.WorldId) + "/wardrobe";

        private static bool IsValidSlot(string slot) =>
            slot == "hair" || slot == "top" || slot == "outerwear" ||
            slot == "bottom" || slot == "shoes" || slot == "accessory";
    }
}
