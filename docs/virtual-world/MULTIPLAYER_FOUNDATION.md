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

1. Review and apply migrations `015_virtual_world_foundation.sql` through `020_credit_topup_intents.sql` in order; configure `ADMIN_USER_IDS` with authorized platform administrator UUIDs through the normal migration process. No API route runs DDL.
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
- Voice needs a separate authenticated audio plane, server-controlled room membership and proximity/zone rules, plus mute/block/report controls.

## Validation still required

Migration 022 (`virtual_world_presence.sql`) is not confirmed applied.  Test all routes against a disposable database after migration; add integration tests for listing ownership, invalid payloads, wallet isolation, event capacity under concurrent requests, entry-code expiry/replay/wrong-client, blocks and banned memberships. Run TypeScript/build checks, configure and verify the gateway JWT validation, then compile Unity and test Android handoff on a physical device. No such validation is claimed by these source commits.
