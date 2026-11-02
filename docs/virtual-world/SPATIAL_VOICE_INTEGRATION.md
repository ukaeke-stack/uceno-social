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
  context, current 24 m range and block state before issuing a 30-second token.
- Each eligible pair receives a private LiveKit room with a server-generated
  room name and participant identity. A new room generation is used after a
  pair has been torn down, preventing reuse of the prior room name.
- The gateway requests pair-room deletion when the pair becomes ineligible,
  either participant leaves, or a block is detected.
- Configure `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` only
  on the gateway server. These are optional for ordinary gateway startup but
  required for voice token issuance. Do not add them to Unity or the APK.
- LiveKit's exact token revocation and room-deletion behavior must be tested
  against the chosen Cloud or self-hosted deployment. A 30-second token TTL is
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
