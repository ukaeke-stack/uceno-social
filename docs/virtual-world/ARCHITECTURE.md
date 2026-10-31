# UCENO Virtual World — Architecture and Integration Audit

**Status:** Design baseline only; no Unity implementation or production database changes have been made.  
**Repository baseline:** `main` at `c810f72e703da12825c595e6bb3349bb6af172f7` (2026-10-31).  
**Working branch:** `feature/uceno-virtual-world-architecture`

## 1. Agreed product and delivery decisions

- Unity is the primary 3D client engine.
- Delivery option C is selected: prioritize native mobile performance while retaining browser access to UCENO's wider platform.
- Android users can enter worlds without a VR headset through a touch-first Unity client.
- Desktop users can enter supported worlds through a browser client.
- VR is a later client target, not a prerequisite for development or launch.
- UCENO Social remains the identity, social graph, community, messaging, moderation and platform entry point. Virtual worlds extend it; they do not replace it.

### Client delivery model

| Client | Role | Entry |
|---|---|---|
| UCENO Social Android app | Existing social platform and lobby | Existing Capacitor app |
| Unity Android client | Primary full 3D mobile experience | Separate Unity-built Android app initially; deep-link handoff from UCENO Social |
| Desktop browser | Browser-based 3D world client where device/browser capability is adequate | Authenticated UCENO web route serving Unity Web build |
| Mobile browser | Social/lobby, world discovery, account and billing; 3D browser entry only as a tested progressive option | Existing UCENO web app |
| VR | Later immersive client | Unity build target after mobile/desktop foundations |

**Reason for a separate Android Unity client in the first delivery:** UCENO's current Android app is a Capacitor WebView application. Embedding Unity as a Library inside that shell is possible but adds native lifecycle, Gradle, rendering-surface, memory and release complexity. A separate Unity Android package with a secure one-time handoff is the lower-risk first integration. Reassess embedding only after a working client exists.

Unity's current Web platform documentation lists Chrome on Android and Safari on iOS among supported mobile browsers, but browser capability does not guarantee acceptable frame rate, memory use or battery life on every phone. Desktop WebGL is the default browser 3D target; mobile-browser 3D is progressive enhancement and must pass device testing before being promoted as a primary route.

## 2. Repository findings

The repository is a Next.js 15 / React 19 TypeScript application with Capacitor 7 for Android. It already includes:
- Next.js route handlers under `app/api`.
- Neon PostgreSQL through `@neondatabase/serverless` and `DATABASE_URL`.
- Cookie-based sessions in `lib/session.ts`.
- Social profiles and follows.
- Conversations, conversation members and messages.
- Communities, notifications, blocks and moderation.
- LiveKit client dependency and call-token routes for voice/video calls.
- Android build/CI workflow in `.github/workflows/ci.yml`.

The current session is an HS256 JWT in an HttpOnly `uceno_session` cookie, with a seven-day lifetime. `readSession()` validates it and checks the account's moderation state in PostgreSQL. It is not a suitable token to copy into a Unity client: it is browser-cookie oriented, relatively long-lived, and signed with the existing session secret.

The Android shell points at the deployed UCENO Social URL through Capacitor's `server.url`; it is not currently a local native Unity player.

## 3. Database findings

The connected Neon project named `uceno` was inspected read-only. The default database exposes 22 public tables, including:

- Identity: `users`
- Social graph: `follows`, `mutual_connections`, `user_blocks`
- Content: `posts`, `comments`, `stories`
- Messaging: `conversations`, `conversation_members`, `messages`
- Groups: `communities`, `community_members`
- Trust and safety: `user_reports`, `moderation_actions`, `moderator_access`
- Platform engagement: `notifications`, `push_tokens`, likes, reposts and bookmarks
- Calling: `call_invitations`

The `users` table uses UUID primary keys and enforces exactly one of email or phone. Account moderation states include active, suspended and disabled. This identity and moderation model must remain authoritative for world access.

No world-specific schema exists in the inspected table list. Do not create a second users table or duplicate UCENO account credentials.

## 4. Proposed system boundaries

### UCENO Social / platform backend
Remains authoritative for:
- User identity, sign-in, account status and moderation.
- Friends/follows and social relationships.
- World discovery, invitations and membership permissions.
- Advertising campaign setup, billing and UCENO Credits ledger.
- Purchases and entitlements, with server-side validation.
- Audit events, reports and safety enforcement.

### World service / game backend
Responsible for:
- World instance allocation and lifecycle.
- Multiplayer session admission and room capacity.
- Server-authoritative movement and gameplay state.
- Reconnection, presence, interest management and state replication.
- Validating in-world actions before they affect durable records.

### Unity clients
Responsible for:
- Rendering, camera, input, avatar presentation and local prediction.
- Sending player input/commands to the authoritative world server.
- Displaying server-confirmed state and platform UI handoffs.
- Never trusting client-side claims about balances, purchases, permissions or moderation status.

### Persistence split
- Neon PostgreSQL: durable world definitions, ownership/permissions, inventory, player progression, advertising orders, credit transactions, moderation/audit records and other transactional data.
- Multiplayer runtime: transient positions, movement snapshots, voice proximity/presence and other high-frequency state. Do not write every movement tick to Neon.
- Object/media storage: world assets, avatar assets and user-generated media, with signed upload/download paths and moderation controls.

## 5. Authentication and authorization design

1. User signs into UCENO Social using the existing login.
2. User selects a world and requests entry.
3. UCENO backend verifies the current session, account moderation status, world visibility, ban/allow-list and membership rules.
4. Backend issues a short-lived, single-use world-entry code (target lifetime 60–120 seconds), bound to the user, world, intended client and a unique nonce.
5. Unity client exchanges that code over HTTPS for a short-lived world access token (target lifetime 5–10 minutes) and connection endpoint.
6. World gateway validates token signature, issuer, audience, expiry, nonce/replay status, user, world and entitlements before admitting the player.
7. Reconnect requires a fresh validated token; no permanent platform or database secret is embedded in Unity.
8. Moderation suspension/disable and world bans must be enforced server-side, including on reconnect and during long sessions.

Use a dedicated `WORLD_TOKEN_SECRET` or asymmetric signing key distinct from `SESSION_SECRET`. Prefer asymmetric signing once the service topology is established so game gateways can verify tokens without possessing the signing private key. Never expose `DATABASE_URL`, Neon credentials, LiveKit secrets or signing keys to Unity builds.

## 6. Multiplayer infrastructure — decision still open

Do not treat Neon/PostgreSQL as a real-time game server. A dedicated authoritative multiplayer runtime is required.

Evaluate at least:
- A self-hosted authoritative server framework (for control and predictable long-term unit economics).
- A managed multiplayer platform (for faster initial room/session delivery and less operations work).

Score candidates against: Unity Android + WebGL support, authoritative server logic, room/instance allocation, reconnect handling, regional latency, scaling, observability, deployment cost, data ownership, anti-cheat controls and integration with the existing Neon-backed API.

Do not select a provider or deploy infrastructure until a small proof-of-concept demonstrates two clients joining the same room, server-validated movement, disconnect/reconnect and load behavior. LiveKit is already used for calls, but it is not automatically the game-state synchronization layer. Evaluate whether proximity voice can reuse LiveKit separately.

## 7. Initial world data model (proposal, not migration)

Potential tables, subject to detailed schema and access-policy review:
- `worlds`: durable world metadata, status, visibility, owner/creator and configuration.
- `world_memberships`: user-to-world role and access state.
- `world_bans`: scoped world restrictions with moderator and reason.
- `world_instances`: allocated runtime/region/status metadata; no per-frame player state.
- `world_entry_codes`: hashed, single-use, short-lived handoff codes.
- `player_inventory` / `player_progress`: durable state only where required by agreed gameplay.
- `uceno_credit_accounts` / `uceno_credit_ledger`: append-only, server-authoritative ledger if virtual-world commerce uses credits.
- `ad_campaigns` / `ad_impressions`: campaign billing and validated reporting, designed to avoid trusting client-reported impressions.

All monetary and credit changes must be transactional and idempotent. A client cannot grant itself credits, premium status, inventory, ad delivery or world-admin privileges.

## 8. Security, privacy and moderation requirements

- Reuse UCENO account UUIDs and moderation status.
- Enforce permissions in APIs and the game server, not only in Unity UI.
- Rate-limit entry-code issuance and redemption; store only code hashes.
- Bind handoff codes to intended user, world, client and nonce; prevent replay.
- Validate all client commands and cap movement/interaction rates.
- Provide report, block, mute, kick and ban pathways appropriate to the world.
- Preserve a moderator audit trail; scope world moderators to their assigned world.
- Avoid exposing private profile/contact fields in world presence.
- Keep ad and credit accounting on trusted server services.
- Define data retention, deletion, parental/safety requirements and privacy policy before public launch.

## 9. Delivery phases and exit criteria

### Phase 0 — repository/database audit (in progress)
- [x] Confirm repository and current main commit.
- [x] Inspect project dependencies, auth/session implementation and API layout.
- [x] Inspect database table inventory and key identity/social schemas.
- [ ] Complete inspection of all relevant migrations, indexes, deploy settings and current production environment.
- [ ] Confirm database branch and backup/restore procedure before any migration.

### Phase 1 — integration proof of concept
- [ ] Create a minimal Unity project and source-controlled build configuration.
- [ ] Build a basic Android scene with touch movement.
- [ ] Build a desktop WebGL scene.
- [ ] Implement secure single-use entry-code exchange in a non-production environment.
- [ ] Demonstrate two clients in one authoritative room.
- [ ] Validate reconnect, account suspension and world access denial.

### Phase 2 — vertical slice
- [ ] Avatar, movement, camera, spawn points and one small test world.
- [ ] World discovery and entry UI in UCENO Social.
- [ ] Basic presence and proximity interactions.
- [ ] Server-side persistence for durable player/world data.
- [ ] Automated API, game-server and client integration tests.

### Phase 3 — platform features
- [ ] World creation/administration and permissions.
- [ ] UCENO Credits and advertising billing, after ledger and fraud controls are reviewed.
- [ ] Moderation tools, reports and audit integration.
- [ ] Asset pipeline, optimization, analytics and observability.

### Phase 4 — quality and release
- [ ] Test on the user's Android phone and a range of low/mid/high Android devices.
- [ ] Test desktop Chrome/Edge/Firefox and supported Safari configurations.
- [ ] Test network loss, poor connectivity, server restart and concurrent users.
- [ ] Security review, load test, backup/restore drill and staged beta.
- [ ] Production release only after measured acceptance criteria pass.

## 10. Explicit non-goals for this design commit

- No production migration.
- No changes to current authentication or moderation behavior.
- No deployment or billing activation.
- No claim that multiplayer, Unity, browser 3D or Android world entry is already implemented.
- No commitment to a multiplayer vendor until proof-of-concept and cost review.
