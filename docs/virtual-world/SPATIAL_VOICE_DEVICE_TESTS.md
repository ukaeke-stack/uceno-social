# UCENO spatial voice — Android device verification

Status: test plan only. No physical-device run is claimed. Native Android audio routing is source-implemented but has not been compiled or exercised.

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
| Push-to-talk | Hold then release PTT | Audio transmits only while held; release mutes the live microphone track without restarting capture |
| Local mute | Mute during transmission | Remote side stops receiving speech; unmute restores only according to PTT state |
| Output mute | Toggle remote output mute off/on | Remote audio is silenced/restored without enabling microphone or muting world audio |
| Speaker route | Select Speaker while voice is active | Android communication output switches to loudspeaker; world audio and microphone remain independently controlled |
| Earpiece route | Select Earpiece while voice is active | Remote voice routes to the phone earpiece when the device exposes it |
| Bluetooth route | Connect a headset, grant BLUETOOTH_CONNECT, select Bluetooth | Remote voice routes to the selected BLE/classic communication headset; denied permission or absent device reports unavailable |
| Route cleanup | Disable voice or background the app | Communication-device override is cleared; foreground voice rejoin restores the selected route when available |
| Mobile HUD | Open and close the voice panel; use each control | Controls remain inside the HUD; touches do not rotate the camera; PTT releases on finger-up or HUD disable |
| Gateway reconnect | Drop and restore the world WebSocket | Existing pair rooms close while gateway is offline; voice presence and eligible peers reconnect with bounded backoff |
| Token retry | Temporarily make voice-token endpoint unavailable, then restore it | Client retries a limited number of times with increasing delay and stops retrying after voice is disabled or peer eligibility is removed |
| Pending join cancellation | Disable voice or revoke peer eligibility while a token request/LiveKit connect is pending | Stale coroutine cannot publish microphone audio or rejoin after disable/revocation; rapid re-enable uses the new voice-session generation |
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
