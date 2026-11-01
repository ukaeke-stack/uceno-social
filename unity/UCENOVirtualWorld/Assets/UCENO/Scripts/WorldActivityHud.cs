using System;
using UnityEngine;

namespace UCENO.VirtualWorld
{
    /// <summary>
    /// Lightweight in-world activity lobby for creating and joining gateway-hosted
    /// sessions. The gateway remains authoritative for membership and state changes.
    /// </summary>
    public sealed class WorldActivityHud : MonoBehaviour
    {
        [SerializeField] private WorldGatewayClient gateway;
        private bool visible;
        private string raceId = "city-loop";
        private string status = "Activities require a connected world gateway.";
        private Vector2 scroll;

        private void Awake()
        {
            if (gateway == null) gateway = FindObjectOfType<WorldGatewayClient>();
            if (gateway != null)
            {
                gateway.ActivityRejected += HandleActivityRejected;
                gateway.ActivityStateChanged += HandleActivityStateChanged;
            }
        }

        private void OnDestroy()
        {
            if (gateway == null) return;
            gateway.ActivityRejected -= HandleActivityRejected;
            gateway.ActivityStateChanged -= HandleActivityStateChanged;
        }

        private void HandleActivityRejected(string code)
        {
            status = "Activity request rejected: " + code;
        }

        private void HandleActivityStateChanged(GatewayActivitySessionState session)
        {
            if (session == null) return;
            status = session.kind + " is " + session.phase + ".";
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.J)) visible = !visible;
        }

        private void OnGUI()
        {
            float scale = Mathf.Clamp(Screen.width / 600f, 1f, 1.5f);
            if (Application.isMobilePlatform && !visible &&
                GUI.Button(new Rect(12f, 145f * scale, 128f * scale, 42f * scale), "ACTIVITIES"))
                visible = true;
            if (!visible) return;

            float width = Mathf.Min(Screen.width - 24f, 460f * scale);
            float height = Mathf.Min(Screen.height - 36f, 500f * scale);
            Rect panel = new Rect(12f, 96f, width, height);
            GUI.Box(panel, "WORLD ACTIVITIES");
            GUILayout.BeginArea(new Rect(panel.x + 12f, panel.y + 28f, panel.width - 24f, panel.height - 40f));
            GUILayout.BeginHorizontal();
            GUILayout.Label("Race configuration ID", GUILayout.Width(145f * scale));
            raceId = GUILayout.TextField(raceId, GUILayout.MinWidth(90f * scale), GUILayout.Height(30f * scale));
            GUILayout.EndHorizontal();

            GUILayout.BeginHorizontal();
            if (GUILayout.Button("CREATE RACE", GUILayout.Height(36f * scale)))
            {
                if (gateway == null || !gateway.RequestActivityCreate("checkpoint_race", raceId.Trim()))
                    status = "Could not send race request. Connect to a world first and enter a race ID.";
                else status = "Race request sent. The gateway must have this race configured.";
            }
            if (GUILayout.Button("CREATE DANCE", GUILayout.Height(36f * scale)))
            {
                if (gateway == null || !gateway.RequestActivityCreate("dance"))
                    status = "Could not send activity request. Connect to a world first.";
                else status = "Dance-session request sent.";
            }
            GUILayout.EndHorizontal();

            GUILayout.Label(status, GUILayout.Height(42f * scale));
            if (gateway == null)
            {
                GUILayout.Label("World gateway is unavailable.");
            }
            else
            {
                var sessions = gateway.ActivitySessions;
                if (sessions.Count == 0)
                {
                    GUILayout.Label("No activity sessions have been announced in this world.");
                }
                else
                {
                    scroll = GUILayout.BeginScrollView(scroll);
                    int shown = 0;
                    for (int i = 0; i < sessions.Count && shown < 12; i++)
                    {
                        GatewayActivitySessionState activity = sessions[i];
                        if (activity == null || string.IsNullOrEmpty(activity.id)) continue;
                        int participantCount = activity.participants == null ? 0 : activity.participants.Length;
                        bool isHost = activity.hostUserId == gateway.LocalUserId;
                        GatewayActivityParticipantState mine = null;
                        if (activity.participants != null)
                        {
                            for (int p = 0; p < activity.participants.Length; p++)
                            {
                                if (activity.participants[p] != null &&
                                    activity.participants[p].userId == gateway.LocalUserId)
                                {
                                    mine = activity.participants[p];
                                    break;
                                }
                            }
                        }

                        GUILayout.BeginVertical(GUI.skin.box);
                        GUILayout.Label(activity.kind.ToUpperInvariant() + "  |  " +
                            activity.phase.ToUpperInvariant() + "  |  " +
                            participantCount + "/" + activity.maxParticipants);
                        GUILayout.Label("Session: " + activity.id);
                        if (activity.kind == "checkpoint_race")
                            GUILayout.Label("Checkpoints: " + (mine != null ? mine.checkpointIndex : 0) +
                                "/" + activity.checkpointCount);

                        GUILayout.BeginHorizontal();
                        if (activity.phase == "lobby" && mine == null &&
                            GUILayout.Button("JOIN", GUILayout.Height(30f * scale)))
                            gateway.RequestActivityJoin(activity.id);
                        if (activity.phase == "lobby" && isHost &&
                            GUILayout.Button("START", GUILayout.Height(30f * scale)))
                            gateway.RequestActivityStart(activity.id);
                        if ((activity.phase == "lobby" || activity.phase == "active") && mine != null &&
                            GUILayout.Button("LEAVE", GUILayout.Height(30f * scale)))
                            gateway.RequestActivityLeave(activity.id);
                        if ((activity.phase == "lobby" || activity.phase == "active") && isHost &&
                            GUILayout.Button("CANCEL", GUILayout.Height(30f * scale)))
                            gateway.RequestActivityCancel(activity.id);
                        GUILayout.EndHorizontal();
                        GUILayout.EndVertical();
                        shown++;
                    }
                    GUILayout.EndScrollView();
                }
            }

            if (GUILayout.Button("CLOSE", GUILayout.Height(32f * scale))) visible = false;
            GUILayout.EndArea();
        }
    }
}
