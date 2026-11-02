# UCENO Virtual World — spatial voice integration

## Selected client transport

Use the official LiveKit Unity SDK, pinned in the Unity Package Manager manifest to
`https://github.com/livekit/client-sdk-unity.git#v2.1.0`.

The SDK's upstream project documents Android support and testing against Unity
6000.3.10. The project uses Unity 6000.3.27f1. This is a compatibility basis,
not proof that this project's package resolution, Android native plugins, or
device audio path compile successfully.

Do not use Unity's deprecated `com.unity.webrtc` package for this feature.

## Required topology

- UCENO's authenticated world gateway remains authoritative for world, instance,
  home/event context, player position, blocks, mute state and proximity eligibility.
- LiveKit carries encrypted real-time audio media. It does not become the source
  of truth for UCENO identity, social graph, moderation, or spatial membership.
- A trusted UCENO server issues short-lived LiveKit access tokens only after
  validating the existing UCENO world-session JWT and current gateway membership.
- Never embed LiveKit API secrets in Unity, the Android APK, or client config.
- The server assigns room identity and participant identity. Clients cannot
  choose arbitrary rooms, impersonate another UCENO account, or grant themselves
  publish/subscribe permissions.
- Spatial admission must be enforced server-side. Participants may publish only
  while opted in and eligible; subscriptions are limited to peers in the same
  world/home/event context and within the configured 24 m 3D range.
- A shared world-wide LiveKit room with `canSubscribe=true` is NOT acceptable:
  the gateway's proximity-scoped WebSocket signaling does not restrict LiveKit
  media subscriptions. Each eligible peer pair needs a separately authorized
  media room or equivalent server-enforced subscription permissions.
- When players move out of range, change context, leave, disconnect, or block
  one another, the server revokes the relevant media subscription/permissions.
  Client-side volume attenuation is supplementary and is not an access-control
  boundary.

## Unity audio client requirements

1. Request Android microphone permission only after the user explicitly enables
   voice, and handle denial without blocking world entry.
2. Connect using a short-lived server-issued token; never use a literal token in
   a committed ScriptableObject.
3. Publish a mono microphone track with echo cancellation, noise suppression,
   automatic gain control and a conservative voice bitrate.
4. Subscribe only to eligible remote audio tracks and attach them to positional
   audio sources associated with the corresponding remote avatar.
5. Apply distance attenuation and optional occlusion locally; server-side
   subscription filtering remains authoritative.
6. Implement push-to-talk and open-mic modes, local mute, per-player mute,
   speaker output routing, reconnect and teardown on scene/app lifecycle changes.
7. On account block/report, immediately stop local publication and remove the
   blocked peer's audio subscription; the server must also revoke eligibility.
8. Do not start the microphone automatically on login or world entry.

## Server work still required

- The Next.js `POST /api/worlds/[worldId]/voice-token` route now proxies to the
  assigned healthy gateway. It forwards the authenticated UCENO bearer token
  and a requested peer UUID; it does not mint LiveKit tokens itself.
- The gateway validates both live participants, voice opt-in, same spatial
  context, current 24 m range and block state before issuing a 15-second token.
- Each eligible pair receives a private LiveKit room with a server-generated
  room name and participant identity. A new room generation is used after a
  pair has been torn down, preventing reuse of the prior room name.
- The gateway requests pair-room deletion when the pair becomes ineligible,
  either participant leaves, or a block is detected.
- Configure `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` only
  on the gateway server. These are optional for ordinary gateway startup but
  required for voice token issuance. Do not add them to Unity or the APK.
- LiveKit's exact token revocation and room-deletion behavior must be tested
  against the chosen Cloud or self-hosted deployment. A 15-second token TTL is
  a fallback bound; it is not proof of instantaneous revocation of an already
  issued token or a connected participant.

## Verification gates

- Unity Package Manager resolves the pinned SDK in Unity 6000.3.27f1.
- Unity Editor compiles the complete project for Android ARM64.
- Two Android devices can join the same eligible spatial context, publish and
  receive audio, and hear distance attenuation.
- Tests cover microphone denial, mute, block, home/event separation, 24 m
  boundary, movement out of range, reconnect, app background/foreground and
  disconnect cleanup.
- A third device outside the permitted context cannot receive the media track.
- No APK build is part of the current implementation phase.

## Current status

The SDK dependency has been added to the Unity manifest. Gateway signaling and
pair-scoped token issuance are implemented in source, with 30-second tokens
and pair-room teardown requests. LiveKit service provisioning, exact revocation
verification, the Unity audio client, microphone/track lifecycle, UI, Unity
compilation and physical-device audio tests are not implemented or verified.
Do not describe spatial voice as operational until all verification gates pass.


## Unity client implementation update — 2026-11-02

- Added `WorldSpatialVoiceClient.cs` using the pinned LiveKit Unity SDK.
- Voice remains explicit opt-in. Android microphone permission is requested only
  after the user taps Enable voice; login and world entry never start capture.
- Added a per-eligible-peer LiveKit room flow. The client asks the authenticated
  UCENO voice-token proxy for each gateway-announced peer and validates the
  returned peer identity and local UCENO identity before connecting.
- Added microphone publication at a bounded 32 kbps target with WebRTC echo
  cancellation, noise suppression and automatic gain control.
- Added push-to-talk gating, local microphone mute, voice leave, speaker-output
  enable/disable and foreground/background teardown/rejoin behavior.
- Remote audio is attached to the matching replicated avatar head anchor with
  3D logarithmic attenuation (1.5 m near distance, 24 m maximum range). Audio
  attachment waits briefly for the gateway's remote-avatar snapshot to arrive.
- Exposed remote-avatar transform lookup and voice join/leave controls from
  `WorldGatewayClient`.

### Important implementation limits

- This is source implementation, not a successful Unity compile or operational
  voice service. SDK API compatibility, Android microphone permissions, plugin
  import, audio routing and device behavior remain unverified.
- The current speaker control gates Unity audio output; it does not yet select
  the Android earpiece/loudspeaker/Bluetooth route. Native Android audio-route
  selection remains outstanding.
- Backgrounding intentionally leaves voice and releases pair rooms. Foreground
  return requests voice presence again; the user must have enabled voice in the
  current session. Android OS behavior and reconnection are not yet device-tested.
- Server pair-room revocation and room deletion are implemented in source, but
  existing token invalidation and connected-participant eviction have not been
  proven against a provisioned LiveKit service. A 30-second token TTL alone is
  not immediate revocation.
- No two-device test has been run. Do not mark positional voice, push-to-talk,
  background handling or revocation as verified until the acceptance matrix in
  `SPATIAL_VOICE_DEVICE_TESTS.md` passes.
- Do not start an APK build in this phase. Keep PR #38 draft and unmerged.


## Reliability follow-up — 2026-11-02

- Gateway pair discovery now uses hysteresis: pairs enter at 22 m and remain
  authorized until 26 m. The Unity audio attenuation still reaches its maximum
  fade distance at 24 m. This avoids room churn when players hover at the edge.
- Added boundary tests for entry/exit thresholds and invalid hysteresis settings.
- Added a GitHub Actions workflow to compile the world gateway and run its
  activity-session and voice-policy tests on relevant changes.
- Push-to-talk now uses the LiveKit `MicrophoneSource.SetMute` API while keeping
  the capture pipeline started after publication, instead of repeatedly
  starting/stopping the microphone for each button press. The source is stopped
  and disposed when the pair room is removed.
- Speaker mute now affects only remote voice AudioSources; it no longer changes
  the global Unity AudioListener volume or unintentionally silences world audio.
- Voice presence retries after gateway reconnection. Returned token responses
  are checked for expected pair-room naming, local identity, peer identity,
  bounded expiry and secure WSS URL before LiveKit connect.

These are source changes. CI results, Unity compilation, Android behavior and
two-device revocation tests still need to be observed; do not treat them as
passed merely because the workflow has been added.


- Revocation now attempts to remove both authorized participant identities from
  the pair room before deleting it. Newly issued voice tokens have a 15-second
  lifetime; they remain room-scoped and cannot join a replacement room after
  the pair is re-authorized. A transient LiveKit API failure is logged and
  still requires operational monitoring; it is not a proof of immediate
  revocation under every provider outage.


## Android audio routing implementation — 2026-11-02

- Added `UCENOAudioRoute.androidlib` under `Assets/Plugins/Android`, including the Android communication-device adapter and Bluetooth Connect permission.
- The Unity client exposes Speaker, Earpiece and Bluetooth route choices. It applies `MODE_IN_COMMUNICATION`, uses `setCommunicationDevice` on Android 12+ and legacy speakerphone/SCO routing on older Android versions.
- Bluetooth route selection requests the Android 12+ runtime `BLUETOOTH_CONNECT` permission. If permission is denied or a route is not present, the client reports that the route is unavailable instead of claiming that it switched.
- The selected route is cleared when voice is disabled or the app backgrounds; it is reapplied when the user returns to the foreground with voice enabled.
- This remains uncompiled and untested on Android hardware. The Android library import/Gradle merge, permission prompt, Bluetooth headset availability, earpiece behavior, and route restoration must be checked in Unity and on physical devices. This change does not constitute verified Android routing.
