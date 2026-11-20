using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace UCENO.VirtualWorld
{
    [Serializable] internal sealed class AvatarAppearancePayload
    {
        public string skin;
        public string hair;
        public string top;
        public string trousers;
        public string shoes;
    }
    [Serializable] internal sealed class AvatarAppearanceResponse
    {
        public AvatarAppearancePayload appearance;
        public bool saved;
        public string error;
    }
    [Serializable] internal sealed class AvatarAppearanceSaveRequest
    {
        public AvatarAppearancePayload appearance;
    }

    /// <summary>Loads and saves the signed-in account's appearance; bearer tokens remain in memory.</summary>
    [DisallowMultipleComponent]
    public sealed class AvatarAppearanceSyncClient : MonoBehaviour
    {
        private WorldSessionClient session;
        private AvatarAppearanceProfile profile;
        private bool saving;
        private bool pendingSave;
        private bool loaded;
        private bool loading;
        private float nextLoadAttempt;

        public void Initialize(WorldSessionClient worldSession, AvatarAppearanceProfile appearanceProfile)
        {
            session = worldSession;
            profile = appearanceProfile;
        }

        private void Update()
        {
            if (!loaded && !loading && session != null && session.IsAuthenticated &&
                Time.unscaledTime >= nextLoadAttempt)
                StartCoroutine(LoadRoutine());
        }

        public void Save(AvatarAppearanceProfile.Palette palette)
        {
            if (!loaded || session == null || !session.IsAuthenticated) return;
            pendingSave = true;
            if (!saving) StartCoroutine(SaveRoutine(palette));
        }

        private IEnumerator LoadRoutine()
        {
            loading = true;
            if (session == null || profile == null || !session.IsAuthenticated ||
                string.IsNullOrEmpty(session.WorldId)) { loading = false; yield break; }
            string url = session.ApiBaseUrl.TrimEnd('/') + "/api/worlds/" + UnityWebRequest.EscapeURL(session.WorldId) + "/appearance";
            using (UnityWebRequest request = UnityWebRequest.Get(url))
            {
                request.SetRequestHeader("Authorization", "Bearer " + session.AccessToken);
                request.SetRequestHeader("Accept", "application/json");
                request.timeout = 15;
                yield return request.SendWebRequest();
                if (request.result == UnityWebRequest.Result.Success)
                {
                    AvatarAppearanceResponse response = JsonUtility.FromJson<AvatarAppearanceResponse>(request.downloadHandler.text);
                    if (response != null && response.appearance != null)
                    {
                        AvatarAppearanceProfile.Palette palette = profile.CurrentPalette;
                        if (TryColor(response.appearance.skin, out Color skin)) palette.skin = skin;
                        if (TryColor(response.appearance.hair, out Color hair)) palette.hair = hair;
                        if (TryColor(response.appearance.top, out Color top)) palette.top = top;
                        if (TryColor(response.appearance.trousers, out Color trousers)) palette.trousers = trousers;
                        if (TryColor(response.appearance.shoes, out Color shoes)) palette.shoes = shoes;
                        profile.Apply(palette);
                        AvatarCustomizationHud hud = GetComponent<AvatarCustomizationHud>();
                        if (hud == null) hud = GetComponentInChildren<AvatarCustomizationHud>();
                        if (hud != null) hud.ApplyAccountPalette(palette);
                    }
                    loaded = true;
                }
                else Debug.LogWarning("UCENO account appearance load failed: " + request.responseCode);
            }
            if (!loaded) nextLoadAttempt = Time.unscaledTime + 10f;
            loading = false;
        }

        private IEnumerator SaveRoutine(AvatarAppearanceProfile.Palette initial)
        {
            saving = true;
            AvatarAppearanceProfile.Palette palette = initial;
            while (pendingSave)
            {
                pendingSave = false;
                AvatarAppearancePayload payload = new AvatarAppearancePayload {
                    skin = Hex(palette.skin), hair = Hex(palette.hair), top = Hex(palette.top),
                    trousers = Hex(palette.trousers), shoes = Hex(palette.shoes)
                };
                string json = JsonUtility.ToJson(new AvatarAppearanceSaveRequest { appearance = payload });
                byte[] bytes = Encoding.UTF8.GetBytes(json);
                string url = session.ApiBaseUrl.TrimEnd('/') + "/api/worlds/" + UnityWebRequest.EscapeURL(session.WorldId) + "/appearance";
                using (UnityWebRequest request = new UnityWebRequest(url, "PUT"))
                {
                    request.uploadHandler = new UploadHandlerRaw(bytes);
                    request.downloadHandler = new DownloadHandlerBuffer();
                    request.SetRequestHeader("Authorization", "Bearer " + session.AccessToken);
                    request.SetRequestHeader("Content-Type", "application/json");
                    request.timeout = 15;
                    yield return request.SendWebRequest();
                    if (request.result != UnityWebRequest.Result.Success)
                        Debug.LogWarning("UCENO account appearance save failed: " + request.responseCode);
                }
                if (pendingSave && profile != null) palette = profile.CurrentPalette;
            }
            saving = false;
        }

        private static string Hex(Color color) => "#" +
            Mathf.RoundToInt(color.r * 255f).ToString("X2") +
            Mathf.RoundToInt(color.g * 255f).ToString("X2") +
            Mathf.RoundToInt(color.b * 255f).ToString("X2");

        private static bool TryColor(string value, out Color color)
        {
            color = Color.white;
            return !string.IsNullOrEmpty(value) && ColorUtility.TryParseHtmlString(value, out color);
        }
    }
}
