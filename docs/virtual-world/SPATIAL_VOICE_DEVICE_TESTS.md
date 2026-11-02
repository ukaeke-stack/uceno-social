# UCENO spatial voice — Android device verification

Status: test plan only. No physical-device run is claimed.

## Preconditions

- Provision a LiveKit Cloud or self-hosted deployment and configure
  `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` on the gateway
  only. Never put these values in Unity assets, the repository or an APK.
- Deploy the gateway and register a healthy instance endpoint.
- Apply and review the required UCENO database migrations in the separate UCENO
  database; verify the world-session and membership authorization path.
- Build a development APK only after the user authorizes the build phase.
- Use two Android devices signed into separate UCENO accounts. Keep a third
  account/device available for the out-of-scope subscription test.

## Acceptance matrix

| Scenario | Procedure | Expected result |
|---|---|---|
| Explicit opt-in | Enter world without touching voice | No Android mic prompt, microphone capture or LiveKit room |
| Permission denied | Enable voice, deny microphone permission | World remains usable; no publication; voice reports permission required |
| Pair authorization | Both devices opt in in same context within 24 m | Each client obtains a short-lived token for the other account's pair room |
| Spatial audio | Speak while moving apart | Remote audio is 3D-positioned at avatar head; level falls with distance and is inaudible beyond 24 m |
| Push-to-talk | Hold then release PTT | Audio transmits only while held; release stops publication/capture |
| Local mute | Mute during transmission | Remote side stops receiving speech; unmute restores only according to PTT state |
| Speaker output | Toggle output off/on | Remote audio is silenced/restored without enabling microphone |
| Context separation | Put one participant in a different home/event context | Pair is revoked; no media is delivered across contexts |
| Range revocation | Move one participant beyond 24 m | Gateway withdraws voice presence and deletes pair room; client disconnects pair room |
| Block revocation | Block either participant | Gateway withdraws pair authorization; client removes peer audio and cannot rejoin |
| Room revocation | Capture old room/token, trigger revocation, attempt reconnect | Old room generation cannot be reused; old credentials cannot admit a participant after deletion/revocation |
| Third-party isolation | Third device is nearby but not an authorized pair member | It receives no pair-room audio track or token |
| Background | Put one device in background | Client stops microphone and leaves pair rooms; gateway voice presence is withdrawn |
| Foreground | Resume app with voice previously enabled | Client re-announces opt-in and reconnects only to currently eligible peers |
| Network loss | Disable/re-enable network | No stale microphone publication; rejoin only after fresh gateway presence/token authorization |
| Disconnect cleanup | Force close app | Gateway removes player and revokes every associated pair room |

## Evidence to record

For each run record device model, Android version, Unity version, LiveKit
deployment version, gateway commit, timestamp, account pair (non-sensitive
test IDs), room generation, expected/actual result and relevant gateway/LiveKit
logs. Do not record access tokens, API secrets or microphone recordings.

## Release gate

All scenarios must pass on two physical Android devices, including room
revocation and a third-device isolation check. Also require Unity Editor Android
ARM64 compilation and review of the generated scene. Until then, spatial voice
is source-implemented only. PR #38 stays draft/unmerged; no APK build, Paystack
live configuration or marketplace escrow activation is authorized by this test
plan.
