# UCENO Virtual World — multiplayer and persistent-world foundation

## Added in this stage

- Additive database schema for worlds, memberships, runtime instances, one-time entry codes, durable player state, private homes and permissions, scheduled events and attendance.
- Distinct earned and purchased UCENO Credit balances with an append-only idempotency ledger.
- Marketplace listing records priced only in Purchased Credits.
- Advertising campaign records limited to real money or Purchased Credits.
- UCENO Social world-entry API: authenticated issue, 90-second single-use code, per-account request cap, hashed code storage, client binding and five-minute JWT.
- Unity `WorldSessionClient` redeems a code over HTTPS and keeps the bearer token in memory only.

## Setup

1. Review and apply `db/migrations/015_virtual_world_foundation.sql` through the normal migration process. No API route runs DDL.
2. Configure server-only `WORLD_TOKEN_SECRET` with at least 32 random characters. Never commit it or put it in the Unity project.
3. Signed-in Social client calls `POST /api/worlds/entry` with `{ "worldId": "...", "clientType": "unity-android" }`.
4. Pass the returned code to Unity `WorldSessionClient.RedeemEntryCode`; it redeems with `PUT /api/worlds/entry`.
5. Configure the Unity component's API base URL to the actual UCENO Social origin before use.

## Security boundaries

- The world gateway must verify JWT signature, issuer `uceno-social`, audience `uceno-world-gateway`, expiry, subject, world and client claims.
- Re-check moderation, world membership and bans at admission and reconnect; do not treat the token as permanent authorization.
- Neon is for durable records, not per-frame movement snapshots.
- This does not yet provide a live multiplayer server, authoritative movement, instance allocator, reconnect protocol or spatial voice.
- Credit balances must only change through future transactional server-side ledger operations. These tables do not grant balances or process purchases.
- Voice needs a separate authenticated audio plane (evaluate LiveKit), server-controlled room membership and proximity/zone rules, plus mute/block/report controls.

## Validation still required

Apply the migration on a disposable database; test code expiry, replay, wrong-client, blocked account and banned membership; run TypeScript/Unity compilation; verify gateway JWT validation; then test Android handoff on a physical device. This source change is not evidence of a successful Unity build or deployed service.
