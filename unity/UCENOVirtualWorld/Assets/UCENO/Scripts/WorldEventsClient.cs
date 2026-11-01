using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace UCENO.VirtualWorld
{
    [Serializable] public sealed class WorldEventSummary
    {
        public string id;
        public string title;
        public string description;
        public string startsAt;
        public string endsAt;
        public int capacity;
        public string status;
        public int goingCount;
        public string myAttendance;
    }

    [Serializable] internal sealed class WorldEventListResponse { public WorldEventSummary[] events; public bool canHost; }
    [Serializable] internal sealed class WorldEventCreateRequest
    {
        public string worldId;
        public string title;
        public string description;
        public string startsAt;
        public string endsAt;
        public int capacity;
    }
    [Serializable] internal sealed class WorldEventAttendanceRequest { public string attendanceStatus; }

    /// <summary>
    /// Displays scheduled world events and submits authenticated RSVP changes.
    /// This does not pretend to teleport users into an event; spatial event
    /// locations and activity scenes require a separate world-instance feature.
    /// </summary>
    public sealed class WorldEventsClient : MonoBehaviour
    {
        [SerializeField] private WorldSessionClient session;
        private readonly List<WorldEventSummary> events = new List<WorldEventSummary>();
        private bool visible;
        private bool busy;
        private bool canHost;
        private string newEventTitle = "";
        private string newEventDescription = "";
        private string startsAtUtc = "";
        private string endsAtUtc = "";
        private string status = "Press N to view world events.";
        private Vector2 scroll;

        private void Awake()
        {
            if (session == null) session = FindObjectOfType<WorldSessionClient>();
            startsAtUtc = DateTime.UtcNow.AddHours(1).ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);
            endsAtUtc = DateTime.UtcNow.AddHours(2).ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.N))
            {
                visible = !visible;
                if (visible) RefreshEvents();
            }
        }

        public void RefreshEvents()
        {
            if (!CanRequest()) return;
            StartCoroutine(LoadEventsRoutine());
        }

        public void CreateEvent()
        {
            if (!CanRequest() || !canHost || string.IsNullOrWhiteSpace(newEventTitle)) return;
            if (!DateTime.TryParse(startsAtUtc, CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out DateTime start) ||
                !DateTime.TryParse(endsAtUtc, CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out DateTime end) ||
                start <= DateTime.UtcNow.AddMinutes(1) || end <= start || end - start > TimeSpan.FromHours(24))
            {
                status = "Enter valid UTC start/end times. Start must be in the future; event duration is limited to 24 hours.";
                return;
            }
            StartCoroutine(CreateEventRoutine(start, end));
        }

        public void SetAttendance(string eventId, string attendanceStatus)
        {
            if (!CanRequest() || string.IsNullOrWhiteSpace(eventId) ||
                (attendanceStatus != "going" && attendanceStatus != "interested" &&
                 attendanceStatus != "cancelled")) return;
            StartCoroutine(SetAttendanceRoutine(eventId, attendanceStatus));
        }

        private bool CanRequest()
        {
            if (busy) return false;
            if (session == null || !session.IsAuthenticated || string.IsNullOrWhiteSpace(session.WorldId))
            {
                status = "Enter a world before viewing events.";
                return false;
            }
            return true;
        }

        private IEnumerator LoadEventsRoutine()
        {
            busy = true;
            string url = session.ApiBaseUrl.TrimEnd('/') + "/api/world-events?worldId=" +
                UnityWebRequest.EscapeURL(session.WorldId);
            using (UnityWebRequest request = CreateRequest(url, "GET", null))
            {
                yield return request.SendWebRequest();
                if (!Succeeded(request)) SetFailure(request, "Event list");
                else
                {
                    WorldEventListResponse response = JsonUtility.FromJson<WorldEventListResponse>(request.downloadHandler.text);
                    events.Clear();
                    if (response != null && response.events != null) events.AddRange(response.events);
                    canHost = response != null && response.canHost;
                    status = events.Count + " scheduled event(s) in this world.";
                }
            }
            busy = false;
        }

        private IEnumerator CreateEventRoutine(DateTime start, DateTime end)
        {
            busy = true;
            WorldEventCreateRequest payload = new WorldEventCreateRequest
            {
                worldId = session.WorldId,
                title = newEventTitle.Trim(),
                description = newEventDescription.Trim(),
                startsAt = start.ToString("o", CultureInfo.InvariantCulture),
                endsAt = end.ToString("o", CultureInfo.InvariantCulture),
                capacity = 100
            };
            using (UnityWebRequest request = CreateRequest(
                session.ApiBaseUrl.TrimEnd('/') + "/api/world-events", "POST", JsonUtility.ToJson(payload)))
            {
                yield return request.SendWebRequest();
                if (!Succeeded(request)) SetFailure(request, "Event creation");
                else
                {
                    newEventTitle = "";
                    newEventDescription = "";
                    status = "Event created with a 100-person capacity.";
                }
            }
            busy = false;
            StartCoroutine(LoadEventsRoutine());
        }

        private IEnumerator SetAttendanceRoutine(string eventId, string attendanceStatus)
        {
            busy = true;
            bool refreshAfterRsvp = false;
            WorldEventAttendanceRequest payload = new WorldEventAttendanceRequest
            {
                attendanceStatus = attendanceStatus
            };
            string url = session.ApiBaseUrl.TrimEnd('/') + "/api/world-events/" +
                UnityWebRequest.EscapeURL(eventId) + "/attendance";
            using (UnityWebRequest request = CreateRequest(url, "POST", JsonUtility.ToJson(payload)))
            {
                yield return request.SendWebRequest();
                if (!Succeeded(request)) SetFailure(request, "Event RSVP");
                else
                {
                    status = attendanceStatus == "going" ? "You are going." :
                        attendanceStatus == "interested" ? "Marked as interested." : "RSVP cancelled.";
                    // Reload server counts and this account's current attendance.
                    refreshAfterRsvp = true;
                }
            }
            busy = false;
            if (refreshAfterRsvp) StartCoroutine(LoadEventsRoutine());
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
            status = operation + " failed (" + request.responseCode + ").";
            Debug.LogWarning("UCENO " + status);
        }

        private void OnGUI()
        {
            float scale = Mathf.Clamp(Screen.width / 600f, 1f, 1.6f);
            if (Application.isMobilePlatform && !visible)
            {
                if (GUI.Button(new Rect(140f * scale, 94f, 118f * scale, 42f * scale), "EVENTS"))
                {
                    visible = true;
                    RefreshEvents();
                }
            }
            if (!visible) return;

            float width = Mathf.Min(Screen.width - 24f, 440f * scale);
            float height = Mathf.Min(Screen.height - 40f, 520f * scale);
            Rect panel = new Rect(12f, 92f, width, height);
            GUI.Box(panel, "WORLD EVENTS");
            GUILayout.BeginArea(new Rect(panel.x + 12f, panel.y + 28f, panel.width - 24f, panel.height - 40f));
            GUILayout.BeginHorizontal();
            GUILayout.FlexibleSpace();
            if (GUILayout.Button("REFRESH", GUILayout.Width(90f * scale), GUILayout.Height(30f * scale)))
                RefreshEvents();
            if (GUILayout.Button("CLOSE", GUILayout.Width(82f * scale), GUILayout.Height(30f * scale)))
            {
                visible = false;
                GUILayout.EndHorizontal();
                GUILayout.EndArea();
                return;
            }
            GUILayout.EndHorizontal();

            scroll = GUILayout.BeginScrollView(scroll, GUILayout.Height(height * 0.78f));
            if (canHost)
            {
                GUILayout.BeginVertical(GUI.skin.box);
                GUILayout.Label("HOST AN EVENT");
                newEventTitle = GUILayout.TextField(newEventTitle);
                newEventDescription = GUILayout.TextArea(newEventDescription, GUILayout.Height(48f * scale));
                GUILayout.Label("Start UTC (YYYY-MM-DDTHH:MM:SSZ)");
                startsAtUtc = GUILayout.TextField(startsAtUtc);
                GUILayout.Label("End UTC (YYYY-MM-DDTHH:MM:SSZ)");
                endsAtUtc = GUILayout.TextField(endsAtUtc);
                if (GUILayout.Button("CREATE EVENT (100 CAPACITY)", GUILayout.Height(34f * scale)))
                    CreateEvent();
                GUILayout.EndVertical();
            }
            foreach (WorldEventSummary item in events)
            {
                GUILayout.BeginVertical(GUI.skin.box);
                GUILayout.Label(item.title);
                GUILayout.Label(item.startsAt + " — " + item.endsAt);
                if (!string.IsNullOrWhiteSpace(item.description)) GUILayout.Label(item.description);
                string capacity = item.capacity > 0 ? item.goingCount + "/" + item.capacity + " going" :
                    item.goingCount + " going";
                GUILayout.Label(capacity + "  |  Your RSVP: " +
                    (string.IsNullOrEmpty(item.myAttendance) ? "none" : item.myAttendance));
                GUILayout.BeginHorizontal();
                if (GUILayout.Button("GOING", GUILayout.Height(32f * scale)))
                    SetAttendance(item.id, "going");
                if (GUILayout.Button("INTERESTED", GUILayout.Height(32f * scale)))
                    SetAttendance(item.id, "interested");
                if (GUILayout.Button("CANCEL", GUILayout.Height(32f * scale)))
                    SetAttendance(item.id, "cancelled");
                GUILayout.EndHorizontal();
                GUILayout.EndVertical();
            }
            GUILayout.EndScrollView();
            GUILayout.Label(status);
            GUILayout.EndArea();
        }
    }
}
