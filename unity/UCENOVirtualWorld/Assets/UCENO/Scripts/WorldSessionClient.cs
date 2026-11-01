using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace UCENO.VirtualWorld
{
    [Serializable]
    public sealed class WorldEntryExchangeRequest
    {
        public string code;
        public string clientType;
    }

    [Serializable]
    public sealed class WorldEntryExchangeResponse
    {
        public string accessToken;
        public string tokenType;
        public int expiresInSeconds;
        public string error;
        public string worldId;
    }

    /// <summary>
    /// Redeems a single-use UCENO Social world-entry code.
    /// The bearer token stays in memory and must never be logged or persisted.
    /// </summary>
    public sealed class WorldSessionClient : MonoBehaviour
    {
        [SerializeField] private string apiBaseUrl = "https://uceno-social.onrender.com";
        [SerializeField] private bool androidClient = true;

        public string AccessToken { get; private set; }
        public int ExpiresInSeconds { get; private set; }
        public string ApiBaseUrl => apiBaseUrl;
        public string WorldId { get; private set; }
        public bool IsAuthenticated => !string.IsNullOrEmpty(AccessToken);

        public void RedeemEntryCode(string code, Action<bool, string> completed)
        {
            if (string.IsNullOrWhiteSpace(code))
            {
                completed?.Invoke(false, "A world-entry code is required.");
                return;
            }
            StartCoroutine(RedeemRoutine(code.Trim(), completed));
        }

        public void SetRenewedSession(string token, int expiresInSeconds)
        {
            AccessToken = token;
            ExpiresInSeconds = expiresInSeconds;
        }

        public void ClearSession()
        {
            AccessToken = null;
            ExpiresInSeconds = 0;
            WorldId = null;
        }

        private IEnumerator RedeemRoutine(string code, Action<bool, string> completed)
        {
            string clientType = androidClient ? "unity-android" : "unity-desktop";
            string payload = JsonUtility.ToJson(new WorldEntryExchangeRequest
            {
                code = code,
                clientType = clientType
            });
            byte[] body = Encoding.UTF8.GetBytes(payload);
            if (string.IsNullOrWhiteSpace(apiBaseUrl))
            {
                completed?.Invoke(false, "Configure the UCENO Social API address before connecting.");
                yield break;
            }
            string url = apiBaseUrl.TrimEnd('/') + "/api/worlds/entry";

            using (UnityWebRequest request = new UnityWebRequest(url, "PUT"))
            {
                request.uploadHandler = new UploadHandlerRaw(body);
                request.downloadHandler = new DownloadHandlerBuffer();
                request.SetRequestHeader("Content-Type", "application/json");
                request.SetRequestHeader("Accept", "application/json");
                request.timeout = 15;
                yield return request.SendWebRequest();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    ClearSession();
                    completed?.Invoke(false, "World sign-in failed (" + request.responseCode + "). Request a fresh entry code and try again.");
                    yield break;
                }

                WorldEntryExchangeResponse response = JsonUtility.FromJson<WorldEntryExchangeResponse>(request.downloadHandler.text);
                if (response == null || string.IsNullOrEmpty(response.accessToken) ||
                    response.tokenType != "Bearer" || response.expiresInSeconds <= 0)
                {
                    ClearSession();
                    completed?.Invoke(false, "The world service returned an invalid session.");
                    yield break;
                }

                AccessToken = response.accessToken;
                ExpiresInSeconds = response.expiresInSeconds;
                WorldId = response.worldId;
                completed?.Invoke(true, null);
            }
        }
    }
}
