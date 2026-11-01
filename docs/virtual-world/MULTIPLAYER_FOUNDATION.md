# UCENO Virtual World — multiplayer and persistent-world foundation

## Implemented

- Additive database schema for worlds, memberships, runtime instances, one-time entry codes, durable player state, homes, permissions, events and attendance.
- Separate earned and purchased UCENO Credit balances with an append-only ledger schema.
- Marketplace listing schema with prices denominated only in Purchased Credits.
- Advertising campaign schema limited to real money or Purchased Credits.
- Authenticated world-entry code issue/redeem APIs. Codes are hashed, single-use, short-lived and client-bound; redemption returns a five-minute JWT.
- Unity `WorldSessionClient` redeems a code over HTTPS and keeps the bearer token in memory only.
- Authenticated bounded player checkpoint GET/PUT endpoints. These are durable checkpoints, not per-frame multiplayer synchronization.
- Short-lived multiplayer presence API at `GET/POST/DELETE /api/worlds/:worldId/presence`: authenticated clients publish bounded transforms, receive up to 64 fresh peers from the same accessible world, and remove their own presence on exit. Stale presence is filtered after 30 seconds. This is a polling foundation, not authoritative movement replication or a production realtime transport.
- Gated LiveKit world voice token endpoint at `POST /api/worlds/:worldId/voice-token`. It issues a 10-minute, world-and-zone-scoped room token only to a signed-in user with fresh world presence and valid world access. Tokens are microphone-only for publishing and permit subscription. It remains disabled unless `WORLD_SPATIAL_VOICE_ENABLED=true`; proximity attenuation, moderation controls and physical-device audio QA are not yet complete.
- Event listing/hosting and RSVP APIs. A database trigger serializes event-capacity checks.
- Home listing/creation, owner invitations/revocation and bounded layout updates.
- Read-only authenticated wallet endpoint: `GET /api/credits` returns separate earned/purchased balances and the latest 50 ledger entries.
- Marketplace browse and seller endpoints:
  - `GET /api/marketplace` lists active listings; `?mine=true` lists the signed-in seller's listings.
  - `POST /api/marketplace` creates a draft listing.
  - `PATCH /api/marketplace/:listingId` lets its seller update fields and status.
  - Listing prices are validated as non-negative integer Purchased Credits; stock and metadata are bounded.
- Migration 016 adds a concurrency-safe marketplace purchase function: it locks the listing, validates stock and buyer, debits only Purchased Credits, writes an idempotent ledger row and reserves stock in one database transaction. The resulting order remains in escrow; no seller payout or item delivery is performed.
- `POST /api/marketplace/:listingId/purchase` is implemented but deliberately feature-gated. It returns 503 unless `MARKETPLACE_ESCROW_ENABLED=true`; do not enable it until seller settlement, refunds, dispute handling and digital-item delivery are implemented and tested.
- `GET /api/marketplace/orders?role=all|buyer|seller` returns the signed-in user's own order history; escrow status does not imply item delivery or seller payout.
- Migration 017 adds a locked, server-authoritative order state machine. `POST /api/marketplace/orders/:orderId/actions` supports seller delivery declaration, buyer delivery confirmation and buyer dispute intake. These transitions are role-checked and replay-safe; they do not release escrow, refund credits or pay sellers.
- Migration 018 makes advertising budget units explicit. `GET/POST /api/ad-campaigns` lets an advertiser view their own campaigns and create drafts with either real-money or Purchased-Credit budget intent. `PATCH /api/ad-campaigns/:campaignId` allows draft submission for review or pausing an active campaign. Advertisers cannot approve or activate campaigns. These APIs do not charge, debit, verify payment, or serve ads.\n- Migration 020 adds provider-neutral Purchased Credit top-up intent records with user-scoped idempotency keys, unique provider references/events, currency and amount fields, and explicit status constraints. It is schema only: no endpoint accepts payment claims and no wallet is credited.
- Migration 019 adds a platform review queue at `GET/PATCH /api/admin/virtual-world/reviews`. Access is restricted to UUIDs explicitly configured in the server-side `ADMIN_USER_IDS` environment variable. Reviewers can approve/reject campaign review metadata and mark disputes under review/reviewed. Campaign approval does not activate ads; dispute review does not release escrow or refund credits. Disputed orders are marked for a future authorized review workflow.

## Important transaction boundary

No credit top-up execution endpoint, transfer, seller settlement, refund, final dispute resolution, advertiser debit, payment-provider verification or ad-serving endpoint has been implemented. Migration 020 stores pending top-up intent metadata only; it does not verify provider events or credit Purchased Credits. Administrative review metadata exists, but it does not decide financial outcomes or activate campaigns. Advertising campaign drafts record budget intent only; no money or credits are collected. The wallet API is read-only. Marketplace listing management does not transfer ownership of digital assets. A database purchase function and gated API exist, but checkout is disabled by default and must remain disabled until the escrow lifecycle is complete. Earned Credits are never treated as Purchased Credits. Marketplace purchases and credit-funded advertising must use Purchased Credits only, with server-authoritative atomic ledger operations and idempotency. Real-money funding must be verified server-side through the payment provider. Seller settlement rules remain intentionally undefined until the product payout policy is established; no payout behavior is assumed.

## Setup

1. Review and apply migrations `015_virtual_world_foundation.sql` through `023_virtual_world_animation_state.sql` in numeric order; configure `ADMIN_USER_IDS` with authorized platform administrator UUIDs through the normal migration process. No API route runs DDL.
2. Configure server-only `WORLD_TOKEN_SECRET` with at least 32 random characters. Never commit it or put it in the Unity project.
3. A signed-in Social client calls `POST /api/worlds/entry` with a world ID and client type.
4. Pass the returned code to Unity `WorldSessionClient.RedeemEntryCode`; it redeems with `PUT /api/worlds/entry`.
5. Configure the Unity component's API base URL to the actual UCENO Social origin before use.

## Security boundaries and known gaps

- The world gateway must verify JWT signature, issuer `uceno-social`, audience `uceno-world-gateway`, expiry, subject, world and client claims.
- Re-check moderation, world membership and bans at admission and reconnect; do not treat the token as permanent authorization.
- Neon is for durable records and occasional checkpoints, not per-frame movement snapshots.
- Home friends-only visibility and Unity home-building UI are not implemented.
- This does not yet provide a live multiplayer server, authoritative movement, instance allocator, reconnect protocol or spatial voice.
- Wallet balances are read-only through the new API. No client-supplied balance writes are accepted.
- The LiveKit token endpoint is only the authenticated audio-plane admission step. Unity must still implement distance-based attenuation, zone transitions, local mute/deafen, participant block/report controls and reconnect handling. Do not enable the feature flag until these client controls and QA are complete.

## Validation still required

Migration 022 (`virtual_world_presence.sql`) is not confirmed applied. Set `WORLD_SPATIAL_VOICE_ENABLED=true` only after Unity voice controls and moderation are ready; keep it unset for now.  Test all routes against a disposable database after migration; add integration tests for listing ownership, invalid payloads, wallet isolation, event capacity under concurrent requests, entry-code expiry/replay/wrong-client, blocks and banned memberships. Run TypeScript/build checks, configure and verify the gateway JWT validation, then compile Unity and test Android handoff on a physical device. No such validation is claimed by these source commits.


## Unity bearer-session integration (November 2026)

The Unity entry exchange returns a five-minute JWT scoped to one world and one
client type. World runtime APIs now accept that token through
`Authorization: Bearer <token>`; the token is not accepted as a general UCENO
web session. The shared server verifier checks issuer, audience, signature,
expiry, world ID, client type and the user's current moderation status.

Unity-compatible endpoints:
- `GET/POST/DELETE /api/worlds/:worldId/presence`
- `GET/PUT /api/worlds/:worldId/state`
- `POST /api/worlds/:worldId/voice-token` (still feature-gated)
- `POST /api/worlds/:worldId/session/refresh`

The refresh endpoint accepts only a still-valid Unity world token, and renews
it for five minutes only while the user has a fresh presence record and still
passes world visibility, membership, moderation and owner-block checks. It is
not a long-lived refresh credential. Clients must stop world requests if
renewal fails and require a fresh authenticated entry handoff.

This closes the earlier client/server authentication mismatch: Unity's bearer
token was previously issued but the world APIs only read the browser cookie.
It does not yet make the Unity client a complete multiplayer client. Movement
polling, remote-avatar interpolation, reconnect UX, voice proximity
attenuation, mute/deafen, block/report and on-device tests remain outstanding.


## Unity presence client implementation

The generated starter city now attaches a Unity presence component to the local
player and references the imported humanoid prefab for remote players. The
client uses the configured UCENO Social API origin, reads the world scope from
the short-lived signed entry token, posts position/rotation at approximately
one-second intervals, polls fresh peers, and interpolates remote humanoid
transforms. Peers beyond the 110 m visibility radius are discarded, and the
client caps rendered remote avatars at 12 to limit mobile rendering and memory
cost. Peers that disappear from fresh presence results are removed after a
timeout. The Unity status HUD includes a field for pasting a one-time entry
code issued by the signed-in UCENO Social web session. Once connected, it also
shows the multiplayer connection state and the number of currently tracked
nearby peers.

This is an initial polling implementation only:
- It is not authoritative movement simulation, anti-cheat, prediction or
  server-side collision validation.
- Remote player animation state is not sent as a separate network field. The
  client estimates locomotion speed from successive server-observed position
  samples and drives the imported humanoid `MoveSpeed` animator parameter. This
  provides basic walk/run blending when the imported controller supports it;
  seated state, gestures and exact sprint state are not yet synchronized.
- The Unity client now renews its bearer token approximately 45 seconds
  before expiry and replaces the in-memory token after a successful refresh.
  Temporary network/server failures are retried after a short delay; rejected
  credentials clear the session and require a fresh entry code.
- Presence cleanup is best-effort; stale records expire from peer queries after
  the server-side freshness window.
- No Unity Editor compile, Android build, database migration execution or
  physical-device multiplayer test has been completed for this change.

The world session component defaults to `https://uceno-social.onrender.com`.
The website must issue an entry code for the selected published world; the
player pastes that short-lived code into the Unity HUD. Do not paste account
passwords, browser cookies or API secrets into the Unity client.


## Versioned avatar animation replication (November 2026)

Migration 023 adds an ephemeral JSON animation-state snapshot and a per-client
presence sequence number. The presence API validates the allowed locomotion
states (idle/walk/run), seated flag, gesture names (none/wave/cheer) and
non-negative gesture sequence. The peer response includes this state and the
latest accepted sequence. The Unity sender publishes movement, seated state
and gesture sequence alongside its transform; remote clients can consume the
state without inferring gestures from position deltas.

This is animation-state replication metadata, not authoritative simulation.
The current polling transport remains approximately one update per second,
and the remote prefab's Animator Controller must define compatible
`MoveSpeed`, `IsSeated`, `Wave` and `Cheer` parameters for those controller
bindings to animate. The imported fallback procedural driver still needs
dedicated remote-state wiring and runtime verification. No collision
authority, server-side input simulation, prediction/reconciliation, lag
compensation, WebSocket transport or load-tested instance authority is claimed.

Migration 023 must be reviewed and applied after 022 before deploying the
updated presence route. Do not claim synchronized animation is runtime-proven
until the Unity Editor compiles and two physical devices verify walk/run,
sit/stand, wave and cheer replication in both directions.


## Server-observed movement sanity checks

The presence write now compares each submitted transform with the previously
stored transform using database time. Updates are limited to one per second
and are rejected when displacement exceeds a bounded speed envelope
(12 world units/second plus a 1-unit tolerance, with a 3-unit minimum allowance
for initial movement). The database increments the accepted sample sequence
on each update, so a Unity client restart does not permanently fail because
its in-memory sequence counter restarted.

This limits obvious teleport/speed abuse but does not make movement
authoritative: the client still supplies its position, and the server does not
simulate input, gravity, jump arcs, collision geometry, terrain or vehicle
physics. A production authoritative movement service still needs a defined
world coordinate/physics contract, trusted instance simulation, input command
sequencing, server-owned player state, reconnect reconciliation and adversarial
tests. Do not describe the current endpoint as authoritative multiplayer.

Remote avatars now enable their locomotion driver. Animator Controllers receive
supported parameters only when those parameters exist; avatars without an
Animator Controller use the procedural driver for movement, seated poses and
gesture playback. Controller clips and chair-specific IK still require prefab
and in-Editor verification.


## Entry-code redemption hardening (November 2026)

The Unity entry-code exchange now revalidates access at the moment the
single-use code is consumed. A code no longer grants a token if the world has
been unpublished, a private-world membership has been removed, the user has
been banned or suspended, moderation has disabled the account, or an owner
block has been added since code issuance. The response now includes the
world ID explicitly as well as embedding it in the scoped JWT.

The LiveKit voice-token route also checks owner-block relationships before
issuing a room token. This closes an access-control gap in which a previously
valid entry handoff could otherwise be used to request voice after a block
change. These are admission checks; they do not replace revalidation by a
dedicated authoritative world server.


The payment provider decision for UCENO Virtual World is Paystack, with
multi-currency transaction support planned. Migration 021 adds the database
issuance function and Paystack metadata fields, but it is not a complete
payment integration: the live Paystack initialization/verification/webhook
configuration and end-to-end payment tests remain separate deployment work.
Keep real payment credentials out of source control. Payment configuration may
be deferred while world systems continue; do not represent top-ups as live
until server-side Paystack verification and idempotent credit issuance have
been tested. Marketplace escrow remains disabled.


## Active-session moderation enforcement (November 2026)

The checkpoint read/write, live presence read/write, and Unity session-renewal
routes now re-check the linked UCENO account's moderation status in addition
to world publication, membership, and owner-block state. Disabled accounts
are denied. Suspended accounts are denied until their suspension expiry; a
suspension with no expiry is treated as indefinite. Session renewal also
continues to require a recent presence record, so a stale token cannot be
renewed after a player has left or stopped sending presence.

This is admission and request authorization hardening, not a replacement for
a continuously authoritative simulation server. Changes have not yet been
validated against a deployed database or Unity runtime.
