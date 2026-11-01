using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace UCENO.VirtualWorld
{
    [Serializable] public sealed class WorldHomeSummary
    {
        public string id;
        public string name;
        public string templateId;
        public string visibility;
        public string permission;
        public string updatedAt;
    }

    [Serializable] public sealed class WorldHomeTransform
    {
        public float x;
        public float y;
        public float z;
        public float yaw;
    }

    [Serializable] public sealed class WorldHomeFurnishing
    {
        public string id;
        public string assetId;
        public float x;
        public float y;
        public float z;
        public float yaw;
        public float scale = 1f;
    }

    [Serializable] internal sealed class WorldHomeListResponse { public WorldHomeSummary[] homes; }
    [Serializable] internal sealed class WorldHomeDetail
    {
        public string id;
        public string name;
        public string templateId;
        public string visibility;
        public string permission;
        public WorldHomeTransform transform;
        public WorldHomeFurnishing[] furnishing;
    }
    [Serializable] internal sealed class WorldHomeDetailResponse { public WorldHomeDetail home; }
    [Serializable] internal sealed class WorldHomeCreateRequest
    {
        public string worldId;
        public string name;
        public string templateId;
        public string visibility;
        public WorldHomeTransform transform;
        public WorldHomeFurnishing[] furnishing;
    }
    [Serializable] internal sealed class WorldHomeSaveRequest
    {
        public WorldHomeTransform transform;
        public WorldHomeFurnishing[] furnishing;
        public string visibility;
    }
    [Serializable] internal sealed class WorldHomeCreateResponse { public WorldHomeDetail home; }
    [Serializable] public sealed class WorldHomeMember
    {
        public string userId;
        public string permission;
    }
    [Serializable] internal sealed class WorldHomeMembersResponse { public WorldHomeMember[] members; }
    [Serializable] internal sealed class WorldHomeGrantRequest
    {
        public string userId;
        public string permission;
    }

    [Serializable] public sealed class WorldHomeFurnitureCatalogEntry
    {
        public string assetId;
        public GameObject prefab;
    }

    /// <summary>
    /// Authenticated Unity client for home listing, creation, loading and
    /// permission-aware layout persistence. Furniture prefabs are supplied
    /// through an explicit scene catalog; no placeholder meshes are created.
    /// </summary>
    public sealed class WorldHomeClient : MonoBehaviour
    {
        [SerializeField] private WorldSessionClient session;
        [SerializeField] private PlayerMotor player;
        [SerializeField] private WorldGatewayClient gateway;
        [SerializeField] private WorldHomeFurnitureCatalogEntry[] furnitureCatalog =
            new WorldHomeFurnitureCatalogEntry[0];
        [SerializeField] private float placementDistance = 2.2f;
        [SerializeField] private float furnitureMoveStep = 0.25f;

        private readonly List<WorldHomeSummary> homes = new List<WorldHomeSummary>();
        private readonly List<WorldHomeFurnishing> furnishing = new List<WorldHomeFurnishing>();
        private readonly List<GameObject> spawnedFurniture = new List<GameObject>();
        private readonly List<WorldHomeMember> members = new List<WorldHomeMember>();
        private string selectedHomeId;
        private WorldHomeTransform selectedHomeTransform = new WorldHomeTransform();
        private int selectedFurnitureIndex = -1;
        private string selectedHomeName = "";
        private string selectedPermission = "";
        private string selectedVisibility = "private";
        private string newHomeName = "My Home";
        private string inviteUserId = "";
        private string invitePermission = "visitor";
        private string status = "Press M to manage homes.";
        private bool visible;
        private bool busy;
        private Vector2 scroll;
        private Vector2 furnitureScroll;
        private GameObject activeInterior;
        private string activeHomeId;

        public IReadOnlyList<WorldHomeSummary> Homes => homes;
        public string SelectedHomeId => selectedHomeId;
        public bool CanEditSelectedHome => selectedPermission == "owner" ||
            selectedPermission == "decorator" || selectedPermission == "co_owner";

        private void Awake()
        {
            if (session == null) session = FindObjectOfType<WorldSessionClient>();
            if (player == null) player = FindObjectOfType<PlayerMotor>();
            if (gateway == null) gateway = FindObjectOfType<WorldGatewayClient>();
            if (gateway != null)
            {
                gateway.SpatialLocationEntered += HandleSpatialLocationEntered;
                gateway.SpatialLocationExited += HandleSpatialLocationExited;
            }
        }

        private void OnDestroy()
        {
            if (gateway != null)
            {
                gateway.SpatialLocationEntered -= HandleSpatialLocationEntered;
                gateway.SpatialLocationExited -= HandleSpatialLocationExited;
            }
            if (activeInterior != null) Destroy(activeInterior);
            ClearSpawnedFurniture();
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.M))
            {
                visible = !visible;
                if (visible && session != null && session.IsAuthenticated) RefreshHomes();
            }
        }

        public void RefreshHomes()
        {
            if (!CanRequest()) return;
            StartCoroutine(RequestHomes());
        }

        public void CreateHome(string homeName)
        {
            if (!CanRequest() || string.IsNullOrWhiteSpace(homeName)) return;
            StartCoroutine(CreateHomeRoutine(homeName.Trim()));
        }

        public void LoadHome(string homeId)
        {
            if (!CanRequest() || string.IsNullOrWhiteSpace(homeId)) return;
            StartCoroutine(LoadHomeRoutine(homeId));
        }

        public void SaveSelectedHome()
        {
            if (!CanRequest() || !CanEditSelectedHome || string.IsNullOrEmpty(selectedHomeId)) return;
            StartCoroutine(SaveHomeRoutine());
        }

        public bool PlaceFurniture(string assetId)
        {
            if (!CanEditSelectedHome || string.IsNullOrEmpty(selectedHomeId)) return false;
            WorldHomeFurnitureCatalogEntry entry = FindCatalogEntry(assetId);
            if (entry == null || entry.prefab == null || player == null) return false;

            Quaternion homeRotation = HomeRotation();
            Vector3 worldPosition = player.transform.position + player.transform.forward * placementDistance;
            worldPosition.y = Mathf.Max(worldPosition.y, player.transform.position.y);
            Vector3 localPosition = Quaternion.Inverse(homeRotation) * (worldPosition - HomePosition());
            if (!WithinHomeBounds(localPosition))
            {
                status = "Move closer to this home's plot before placing furniture. The furnishing area is 50 by 50 metres.";
                return false;
            }
            GameObject instance = Instantiate(entry.prefab, worldPosition, homeRotation);
            instance.name = "Home Furniture " + assetId;
            spawnedFurniture.Add(instance);
            furnishing.Add(new WorldHomeFurnishing
            {
                id = Guid.NewGuid().ToString("N"),
                assetId = assetId,
                x = localPosition.x, y = localPosition.y, z = localPosition.z,
                yaw = 0f,
                scale = instance.transform.localScale.x
            });
            selectedFurnitureIndex = furnishing.Count - 1;
            status = "Furniture placed. Save the home to persist this layout.";
            return true;
        }

        private bool CanRequest()
        {
            if (busy) return false;
            if (session == null || !session.IsAuthenticated)
            {
                status = "Enter a world before managing homes.";
                return false;
            }
            if (string.IsNullOrWhiteSpace(session.WorldId))
            {
                status = "The world session has no world ID.";
                return false;
            }
            return true;
        }

        public void MoveSelectedFurniture(int direction)
        {
            if (!CanEditSelectedHome || selectedFurnitureIndex < 0 ||
                selectedFurnitureIndex >= furnishing.Count || player == null) return;
            Vector3 forward = player.transform.forward;
            Vector3 right = player.transform.right;
            forward.y = 0f;
            right.y = 0f;
            forward.Normalize();
            right.Normalize();
            Vector3 delta = direction == 0 ? forward * furnitureMoveStep :
                direction == 1 ? -forward * furnitureMoveStep :
                direction == 2 ? -right * furnitureMoveStep :
                direction == 3 ? right * furnitureMoveStep : Vector3.zero;
            WorldHomeFurnishing item = furnishing[selectedFurnitureIndex];
            Vector3 localDelta = Quaternion.Inverse(HomeRotation()) * delta;
            Vector3 candidate = new Vector3(item.x + localDelta.x, item.y, item.z + localDelta.z);
            if (!WithinHomeBounds(candidate))
            {
                status = "Furniture cannot be moved outside this home's furnishing area.";
                return;
            }
            item.x = candidate.x;
            item.z = candidate.z;
            if (selectedFurnitureIndex < spawnedFurniture.Count && spawnedFurniture[selectedFurnitureIndex] != null)
                spawnedFurniture[selectedFurnitureIndex].transform.position += delta;
            status = "Selected furniture moved. Save the home to persist the change.";
        }

        public void RotateSelectedFurniture(float degrees)
        {
            if (!CanEditSelectedHome || selectedFurnitureIndex < 0 ||
                selectedFurnitureIndex >= furnishing.Count) return;
            WorldHomeFurnishing item = furnishing[selectedFurnitureIndex];
            item.yaw = Mathf.Repeat(item.yaw + degrees, 360f);
            if (selectedFurnitureIndex < spawnedFurniture.Count && spawnedFurniture[selectedFurnitureIndex] != null)
                spawnedFurniture[selectedFurnitureIndex].transform.rotation = HomeRotation() * Quaternion.Euler(0f, item.yaw, 0f);
            status = "Selected furniture rotated. Save the home to persist the change.";
        }

        public void RemoveSelectedFurniture()
        {
            if (!CanEditSelectedHome || selectedFurnitureIndex < 0 ||
                selectedFurnitureIndex >= furnishing.Count) return;
            if (selectedFurnitureIndex < spawnedFurniture.Count && spawnedFurniture[selectedFurnitureIndex] != null)
                Destroy(spawnedFurniture[selectedFurnitureIndex]);
            if (selectedFurnitureIndex < spawnedFurniture.Count) spawnedFurniture.RemoveAt(selectedFurnitureIndex);
            furnishing.RemoveAt(selectedFurnitureIndex);
            selectedFurnitureIndex = furnishing.Count == 0 ? -1 :
                Mathf.Clamp(selectedFurnitureIndex, 0, furnishing.Count - 1);
            status = "Furniture removed. Save the home to persist the change.";
        }

        private WorldHomeFurnitureCatalogEntry FindCatalogEntry(string assetId)
        {
            foreach (WorldHomeFurnitureCatalogEntry entry in furnitureCatalog)
                if (entry != null && entry.assetId == assetId) return entry;
            return null;
        }

        private IEnumerator RequestHomes()
        {
            busy = true;
            string url = session.ApiBaseUrl.TrimEnd('/') + "/api/world-homes?worldId=" +
                UnityWebRequest.EscapeURL(session.WorldId);
            using (UnityWebRequest request = CreateRequest(url, "GET", null))
            {
                yield return request.SendWebRequest();
                if (!Succeeded(request)) SetFailure(request, "Home list");
                else
                {
                    WorldHomeListResponse response = JsonUtility.FromJson<WorldHomeListResponse>(request.downloadHandler.text);
                    homes.Clear();
                    if (response != null && response.homes != null) homes.AddRange(response.homes);
                    status = homes.Count + " home(s) available in this world.";
                }
            }
            busy = false;
        }

        private IEnumerator CreateHomeRoutine(string homeName)
        {
            busy = true;
            bool refreshAfterCreate = false;
            WorldHomeCreateRequest payload = new WorldHomeCreateRequest
            {
                worldId = session.WorldId,
                name = homeName,
                templateId = "starter.home",
                visibility = "private",
                transform = CurrentTransform(),
                furnishing = CreateStarterFurnishing()
            };
            using (UnityWebRequest request = CreateRequest(
                session.ApiBaseUrl.TrimEnd('/') + "/api/world-homes", "POST", JsonUtility.ToJson(payload)))
            {
                yield return request.SendWebRequest();
                if (!Succeeded(request)) SetFailure(request, "Home creation");
                else
                {
                    WorldHomeCreateResponse response = JsonUtility.FromJson<WorldHomeCreateResponse>(request.downloadHandler.text);
                    if (response != null && response.home != null)
                    {
                        selectedHomeId = response.home.id;
                        selectedHomeName = response.home.name;
                        selectedHomeTransform = response.home.transform ?? payload.transform;
                        selectedPermission = "owner";
                        selectedVisibility = "private";
                        selectedFurnitureIndex = -1;
                        members.Clear();
                        furnishing.Clear();
                        ClearSpawnedFurniture();
                        status = "Home created. Change visibility to invite before sharing.";
                        refreshAfterCreate = true;
                    }
                    else status = "Home service returned an invalid response.";
                }
            }
            busy = false;
            if (refreshAfterCreate) RefreshHomes();
        }

        private IEnumerator LoadHomeRoutine(string homeId)
        {
            busy = true;
            using (UnityWebRequest request = CreateRequest(
                session.ApiBaseUrl.TrimEnd('/') + "/api/world-homes/" + UnityWebRequest.EscapeURL(homeId),
                "GET", null))
            {
                yield return request.SendWebRequest();
                if (!Succeeded(request)) SetFailure(request, "Home loading");
                else
                {
                    WorldHomeDetailResponse response = JsonUtility.FromJson<WorldHomeDetailResponse>(request.downloadHandler.text);
                    if (response == null || response.home == null)
                        status = "Home service returned an invalid response.";
                    else
                    {
                        selectedHomeId = response.home.id;
                        selectedHomeName = response.home.name;
                        selectedHomeTransform = response.home.transform ?? new WorldHomeTransform();
                        selectedPermission = response.home.permission;
                        selectedVisibility = response.home.visibility;
                        members.Clear();
                        furnishing.Clear();
                        if (selectedPermission == "owner" && selectedVisibility == "invite")
                            StartCoroutine(LoadMembersRoutine());
                        if (response.home.furnishing != null) furnishing.AddRange(response.home.furnishing);
                        if (gateway == null || !gateway.RequestHomeEntry(homeId))
                            status = "Home access loaded, but the authoritative world gateway is not connected. Reconnect and open this home again.";
                        else
                            status = "Home access verified. Waiting for the world server to admit you.";
                    }
                }
            }
            busy = false;
        }

        private IEnumerator LoadMembersRoutine()
        {
            string homeId = selectedHomeId;
            if (string.IsNullOrEmpty(homeId)) yield break;
            using (UnityWebRequest request = CreateRequest(
                session.ApiBaseUrl.TrimEnd('/') + "/api/world-homes/" +
                UnityWebRequest.EscapeURL(homeId) + "/members", "GET", null))
            {
                yield return request.SendWebRequest();
                if (!Succeeded(request)) { SetFailure(request, "Invitation roster"); yield break; }
                if (selectedHomeId != homeId) yield break;
                WorldHomeMembersResponse response = JsonUtility.FromJson<WorldHomeMembersResponse>(request.downloadHandler.text);
                members.Clear();
                if (response != null && response.members != null) members.AddRange(response.members);
            }
        }

        private IEnumerator InviteMemberRoutine(string userId)
        {
            busy = true;
            WorldHomeGrantRequest payload = new WorldHomeGrantRequest
            {
                userId = userId,
                permission = invitePermission
            };
            using (UnityWebRequest request = CreateRequest(
                session.ApiBaseUrl.TrimEnd('/') + "/api/world-homes/" +
                UnityWebRequest.EscapeURL(selectedHomeId) + "/members", "POST", JsonUtility.ToJson(payload)))
            {
                yield return request.SendWebRequest();
                if (!Succeeded(request)) SetFailure(request, "Home invitation");
                else
                {
                    inviteUserId = "";
                    status = "Home access granted.";
                    StartCoroutine(LoadMembersRoutine());
                }
            }
            busy = false;
        }

        private IEnumerator RevokeMemberRoutine(string userId)
        {
            busy = true;
            string url = session.ApiBaseUrl.TrimEnd('/') + "/api/world-homes/" +
                UnityWebRequest.EscapeURL(selectedHomeId) + "/members?userId=" + UnityWebRequest.EscapeURL(userId);
            using (UnityWebRequest request = CreateRequest(url, "DELETE", null))
            {
                yield return request.SendWebRequest();
                if (!Succeeded(request)) SetFailure(request, "Home access revocation");
                else
                {
                    status = "Home access revoked.";
                    StartCoroutine(LoadMembersRoutine());
                }
            }
            busy = false;
        }

        private IEnumerator SaveHomeRoutine()
        {
            busy = true;
            WorldHomeSaveRequest payload = new WorldHomeSaveRequest
            {
                transform = selectedPermission == "decorator" ? null : selectedHomeTransform,
                furnishing = furnishing.ToArray(),
                visibility = selectedPermission == "owner" ? selectedVisibility : ""
            };
            using (UnityWebRequest request = CreateRequest(
                session.ApiBaseUrl.TrimEnd('/') + "/api/world-homes/" + UnityWebRequest.EscapeURL(selectedHomeId),
                "PUT", JsonUtility.ToJson(payload)))
            {
                yield return request.SendWebRequest();
                if (!Succeeded(request)) SetFailure(request, "Home save");
                else
                {
                    status = "Home layout saved.";
                    if (selectedPermission == "owner" && selectedVisibility == "invite")
                        StartCoroutine(LoadMembersRoutine());
                    else members.Clear();
                }
            }
            busy = false;
        }

        private static WorldHomeFurnishing[] CreateStarterFurnishing()
        {
            return new[]
            {
                new WorldHomeFurnishing { id = "starter-sofa", assetId = "sofa_01", x = -2.1f, y = 0f, z = 1.9f, yaw = 0f, scale = 0.9f },
                new WorldHomeFurnishing { id = "starter-chair", assetId = "arm_chair_01", x = 2.2f, y = 0f, z = 1.8f, yaw = 180f, scale = 0.9f },
                new WorldHomeFurnishing { id = "starter-table", assetId = "round_wooden_table_01", x = 0f, y = 0f, z = 0.2f, yaw = 0f, scale = 0.85f },
                new WorldHomeFurnishing { id = "starter-bed", assetId = "gothic_bed_01", x = -2.3f, y = 0f, z = -2.7f, yaw = 90f, scale = 0.8f },
                new WorldHomeFurnishing { id = "starter-cabinet", assetId = "gothic_cabinet_01", x = 2.5f, y = 0f, z = -2.9f, yaw = 0f, scale = 0.85f }
            };
        }

        private void HandleSpatialLocationEntered(string contextType, string contextId, Vector3 spawnPosition, float yaw)
        {
            if (contextType != "home" || contextId != selectedHomeId) return;
            if (activeInterior != null) Destroy(activeInterior);
            ClearSpawnedFurniture();
            activeInterior = WorldHomeInteriorBuilder.Create(contextId, HomePosition(), HomeRotation());
            activeHomeId = contextId;
            RebuildFurniture();
            status = "Inside " + selectedHomeName + ". Home entry was authorized by the world server.";
        }

        private void HandleSpatialLocationExited()
        {
            if (activeInterior != null) Destroy(activeInterior);
            activeInterior = null;
            activeHomeId = null;
            ClearSpawnedFurniture();
            status = "You have left the residential interior.";
        }

        private WorldHomeTransform CurrentTransform()
        {
            Vector3 p = player != null ? player.transform.position : transform.position;
            float yaw = player != null ? player.transform.eulerAngles.y : transform.eulerAngles.y;
            return new WorldHomeTransform { x = p.x, y = p.y, z = p.z, yaw = yaw };
        }

        private Vector3 HomePosition()
        {
            return new Vector3(selectedHomeTransform.x, selectedHomeTransform.y, selectedHomeTransform.z);
        }

        private Quaternion HomeRotation()
        {
            return Quaternion.Euler(0f, selectedHomeTransform.yaw, 0f);
        }

        private static bool WithinHomeBounds(Vector3 localPosition)
        {
            return localPosition.x >= -25f && localPosition.x <= 25f &&
                localPosition.z >= -25f && localPosition.z <= 25f &&
                localPosition.y >= -2f && localPosition.y <= 10f;
        }

        private void RebuildFurniture()
        {
            selectedFurnitureIndex = -1;
            ClearSpawnedFurniture();
            Quaternion homeRotation = HomeRotation();
            Vector3 homePosition = HomePosition();
            foreach (WorldHomeFurnishing item in furnishing)
            {
                WorldHomeFurnitureCatalogEntry entry = FindCatalogEntry(item.assetId);
                if (entry == null || entry.prefab == null)
                {
                    spawnedFurniture.Add(null);
                    continue;
                }
                Vector3 localPosition = new Vector3(item.x, item.y, item.z);
                Vector3 worldPosition = homePosition + homeRotation * localPosition;
                Quaternion worldRotation = homeRotation * Quaternion.Euler(0f, item.yaw, 0f);
                GameObject instance = Instantiate(entry.prefab, worldPosition, worldRotation);
                instance.name = "Home Furniture " + item.assetId;
                instance.transform.localScale = Vector3.one * Mathf.Clamp(item.scale, 0.1f, 5f);
                spawnedFurniture.Add(instance);
            }
        }

        private void ClearSpawnedFurniture()
        {
            foreach (GameObject item in spawnedFurniture)
                if (item != null) Destroy(item);
            spawnedFurniture.Clear();
        }

        private UnityWebRequest CreateRequest(string url, string method, string body)
        {
            UnityWebRequest request = new UnityWebRequest(url, method);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Authorization", "Bearer " + session.AccessToken);
            request.SetRequestHeader("Accept", "application/json");
            if (body != null)
            {
                request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
                request.SetRequestHeader("Content-Type", "application/json");
            }
            request.timeout = 15;
            return request;
        }

        private static bool Succeeded(UnityWebRequest request)
        {
            return request.result == UnityWebRequest.Result.Success &&
                request.responseCode >= 200 && request.responseCode < 300;
        }

        private void SetFailure(UnityWebRequest request, string operation)
        {
            status = operation + " failed (" + request.responseCode + "). " +
                "The server may have denied access or the home service may be unavailable.";
            Debug.LogWarning("UCENO " + status);
        }

        private void OnGUI()
        {
            float scale = Mathf.Clamp(Screen.width / 600f, 1f, 1.6f);
            if (Application.isMobilePlatform && !visible)
            {
                if (GUI.Button(new Rect(12f, 94f, 118f * scale, 42f * scale), "HOMES"))
                {
                    visible = true;
                    if (session != null && session.IsAuthenticated) RefreshHomes();
                }
            }
            if (!visible) return;
            float width = Mathf.Min(Screen.width - 24f, 440f * scale);
            float height = Mathf.Min(Screen.height - 40f, 560f * scale);
            Rect panel = new Rect(12f, 92f, width, height);
            GUI.Box(panel, "UCENO HOMES  |  M TO CLOSE");
            GUILayout.BeginArea(new Rect(panel.x + 12f, panel.y + 28f, panel.width - 24f, panel.height - 40f));
            GUILayout.BeginHorizontal();
            GUILayout.FlexibleSpace();
            if (GUILayout.Button("CLOSE", GUILayout.Width(82f * scale), GUILayout.Height(30f * scale)))
            {
                visible = false;
                GUILayout.EndHorizontal();
                GUILayout.EndArea();
                return;
            }
            GUILayout.EndHorizontal();
            GUILayout.BeginHorizontal();
            GUILayout.Label("New home", GUILayout.Width(75f * scale));
            newHomeName = GUILayout.TextField(newHomeName, GUILayout.Width(150f * scale));
            if (GUILayout.Button("CREATE", GUILayout.Height(34f * scale))) CreateHome(newHomeName);
            if (GUILayout.Button("REFRESH", GUILayout.Height(34f * scale))) RefreshHomes();
            GUILayout.EndHorizontal();

            GUILayout.Space(8f);
            scroll = GUILayout.BeginScrollView(scroll, GUILayout.Height(height * 0.43f));
            foreach (WorldHomeSummary home in homes)
            {
                GUILayout.BeginHorizontal();
                GUILayout.Label(home.name + "  [" + home.permission + "]", GUILayout.MinWidth(100f));
                if (GUILayout.Button("OPEN", GUILayout.Width(72f * scale))) LoadHome(home.id);
                GUILayout.EndHorizontal();
            }
            GUILayout.EndScrollView();

            if (!string.IsNullOrEmpty(selectedHomeId))
            {
                GUILayout.Label("Selected: " + selectedHomeName + " (" + selectedPermission + ")");
                if (activeHomeId == selectedHomeId && gateway != null &&
                    GUILayout.Button("EXIT HOME", GUILayout.Height(34f * scale)))
                    gateway.RequestHomeExit();
                if (selectedPermission == "owner")
                {
                    if (GUILayout.Button(selectedVisibility == "invite" ? "SHARING: ON (TAP TO MAKE PRIVATE)" : "SHARING: OFF (TAP TO INVITE)", GUILayout.Height(32f * scale)))
                        selectedVisibility = selectedVisibility == "invite" ? "private" : "invite";
                }
                if (selectedPermission == "owner" && selectedVisibility == "invite")
                {
                    inviteUserId = GUILayout.TextField(inviteUserId, GUILayout.Height(30f * scale));
                    GUILayout.BeginHorizontal();
                    if (GUILayout.Button("ROLE: " + invitePermission.ToUpperInvariant(), GUILayout.Height(30f * scale)))
                        invitePermission = invitePermission == "visitor" ? "decorator" :
                            invitePermission == "decorator" ? "co_owner" : "visitor";
                    if (GUILayout.Button("INVITE USER ID", GUILayout.Height(30f * scale))) InviteMember();
                    GUILayout.EndHorizontal();
                    foreach (WorldHomeMember member in members)
                    {
                        GUILayout.BeginHorizontal();
                        GUILayout.Label(member.userId + " [" + member.permission + "]", GUILayout.MinWidth(100f));
                        if (GUILayout.Button("REVOKE", GUILayout.Width(72f * scale))) RevokeMember(member.userId);
                        GUILayout.EndHorizontal();
                    }
                }
                if (CanEditSelectedHome)
                {
                    foreach (WorldHomeFurnitureCatalogEntry entry in furnitureCatalog)
                    {
                        if (entry == null || entry.prefab == null || string.IsNullOrWhiteSpace(entry.assetId)) continue;
                        if (GUILayout.Button("PLACE " + entry.assetId, GUILayout.Height(32f * scale)))
                            PlaceFurniture(entry.assetId);
                    }
                    if (furnishing.Count > 0)
                    {
                        GUILayout.Label("Placed furniture");
                        furnitureScroll = GUILayout.BeginScrollView(furnitureScroll, GUILayout.Height(height * 0.22f));
                        for (int i = 0; i < furnishing.Count; i++)
                        {
                            GUILayout.BeginHorizontal();
                            string prefix = i == selectedFurnitureIndex ? "> " : "";
                            if (GUILayout.Button(prefix + furnishing[i].assetId, GUILayout.MinWidth(100f)))
                                selectedFurnitureIndex = i;
                            GUILayout.EndHorizontal();
                        }
                        GUILayout.EndScrollView();
                        if (selectedFurnitureIndex >= 0 && selectedFurnitureIndex < furnishing.Count)
                        {
                            GUILayout.BeginHorizontal();
                            if (GUILayout.Button("FORWARD", GUILayout.Height(32f * scale))) MoveSelectedFurniture(0);
                            if (GUILayout.Button("BACK", GUILayout.Height(32f * scale))) MoveSelectedFurniture(1);
                            GUILayout.EndHorizontal();
                            GUILayout.BeginHorizontal();
                            if (GUILayout.Button("LEFT", GUILayout.Height(32f * scale))) MoveSelectedFurniture(2);
                            if (GUILayout.Button("RIGHT", GUILayout.Height(32f * scale))) MoveSelectedFurniture(3);
                            GUILayout.EndHorizontal();
                            GUILayout.BeginHorizontal();
                            if (GUILayout.Button("ROTATE -15", GUILayout.Height(32f * scale))) RotateSelectedFurniture(-15f);
                            if (GUILayout.Button("ROTATE +15", GUILayout.Height(32f * scale))) RotateSelectedFurniture(15f);
                            if (GUILayout.Button("REMOVE", GUILayout.Height(32f * scale))) RemoveSelectedFurniture();
                            GUILayout.EndHorizontal();
                        }
                    }
                    if (GUILayout.Button("SAVE HOME LAYOUT", GUILayout.Height(38f * scale)))
                        SaveSelectedHome();
                }
                else GUILayout.Label("Visitor access: layout editing is disabled.");
            }
            GUILayout.Space(6f);
            GUILayout.Label(status, GUI.skin.label);
            GUILayout.EndArea();
        }
    }
}
