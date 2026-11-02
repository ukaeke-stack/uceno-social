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
4. Subscribe to eligible remote audio tracks and attach them to positional audio
   sources associated with the corresponding remote avatar.
5. Apply distance attenuation and optional occlusion locally; server-side
   subscription filtering remains authoritative.
6. Implement push-to-talk and open-mic modes, local mute, per-player mute,
   speaker output routing, reconnect and teardown on scene/app lifecycle changes.
7. On account block/report, immediately stop local publication and remove the
   blocked peer's audio subscription; the server must also revoke eligibility.
8. Do not start the microphone automatically on login or world entry.

## Server work still required

- Add LiveKit server SDK and a protected token-issuance endpoint.
- Validate UCENO world-session JWT, instance lease, moderation status, membership,
  owner blocks, home/event permissions and voice opt-in before issuing a token.
- Keep API key/secret in server environment only; configure the LiveKit endpoint.
- Implement authoritative participant permission changes on proximity/context
  updates and disconnect cleanup.
- Add rate limits, short token TTL, audit-safe failure logging and health checks.
- Decide whether to use LiveKit Cloud or self-hosted LiveKit before provisioning.
  No provider account, endpoint, secret or deployment has been configured.

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

The SDK dependency has been added to the Unity manifest. The token endpoint,
server-side LiveKit integration, Unity audio client, UI, service provisioning,
Unity compilation and physical-device audio tests are not yet implemented or
verified. Do not describe spatial voice as operational until all verification
gates pass.
