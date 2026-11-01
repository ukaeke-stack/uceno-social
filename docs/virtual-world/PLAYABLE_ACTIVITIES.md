# UCENO Playable Activities — implementation contract

Status: design/acceptance contract only. This document does not claim playable mechanics have shipped.

## Non-negotiable runtime rules

- Clients submit input and intent, never final scores, wins, rewards, inventory changes, or authoritative transforms.
- Every activity instance is scoped to a published world and one healthy runtime instance. Participants must pass the existing gateway authentication, moderation, block, membership, and instance-lease checks.
- Activity admission must validate the persisted event RSVP, event schedule, activity type, and current world context on the server.
- Activity state transitions are server-owned and versioned. Duplicate requests must be idempotent; out-of-order input must be rejected.
- Earned and Purchased UCENO Credits remain separate. Gameplay scoring must not mint credits until an explicit reward policy, anti-abuse controls, durable ledger transaction, and replay-safe tests exist.
- Disconnect, reconnect, event cancellation, moderation revocation, and instance shutdown need defined cleanup/recovery behavior.
- Do not call an activity playable until its Unity controls, server rules, multiplayer replication, persistence policy, and automated tests are present.

## Delivery order

### 1. Shared activity session framework

Implement a server-owned activity session state machine with states `scheduled`, `lobby`, `active`, `completed`, and `cancelled`. Each session needs an ID, world/instance scope, activity type, participant roster, start/end timestamps, monotonically increasing version, and authoritative event log. Enforce participant caps, one active session per player, rate limits, and cleanup on disconnect or moderation revocation.

Acceptance:
- Unauthorized, blocked, suspended, banned, or stale-lease users cannot join or send actions.
- Replayed and stale-version actions do not change state twice.
- Two participants see the same session phase and authoritative result.
- Restart behavior is explicit: either recover from durable state or mark the session interrupted; never silently invent a result.

### 2. First complete activity: timed checkpoint race

Use authored checkpoint/finish volumes, not client-submitted finish claims. The gateway validates checkpoint order, proximity, elapsed time, and per-player progression. Persist the final result with an idempotency key; ties use server timestamps and a documented tolerance. No credit reward in the first release.

Acceptance:
- Skipping a checkpoint, finishing out of order, sending impossible movement, replaying an action, or finishing outside the valid volume is rejected.
- Disconnect before finish results in a documented DNF/rejoin policy.
- Multiplayer results match on all clients and survive API reload when persistence is enabled.

### 3. Social dance session

Extend the current synchronized dance gesture into a session with join/leave, start/stop, participant roster, synchronized beat epoch, and server-controlled emote allowlist. This is an activity session, not a rhythm-scoring game until beat timing and anti-cheat rules exist.

### 4. Activity adapters

Only after the shared framework and race tests pass, add independent adapters for sports, racing vehicles, adventure objectives, cinema/concert audience interactions, workshops/education, and casual multiplayer. Each adapter must declare its own authoritative state, action schema, limits, persistence, accessibility controls, and tests. Do not present category labels as implemented gameplay.

## Next architecture stages

### AI citizens
- Server-owned citizen profiles, schedules, district anchors, navigation goals, interaction cooldowns, and dialogue policy.
- Start with deterministic daily schedules and bounded local navigation before adding generated dialogue.
- Never let client input author citizen positions, permissions, economy transactions, or moderation decisions.

### Persistent districts
- District registry with stable IDs, scene/asset version, access policy, capacity, runtime-instance pool, and migration status.
- Keep durable world state separate from ephemeral instance simulation. Define ownership and conflict resolution for cross-instance travel before enabling it.
- Add safe entry/exit handoff and reconnect tests before claiming district persistence.

### Advanced social experiences
- Build on account-level friend/block/moderation controls. Proximity voice must support mute, block enforcement, spatial range, private spaces, and server-issued short-lived tokens.
- Text/voice rooms, gatherings, clubs, parties, and shared activities must use explicit access policies and server-side admission.

### Virtual economy
- Keep wallet balances and append-only ledger server-owned; earned and purchased balances cannot be merged.
- Marketplace escrow remains disabled. Paystack live configuration remains deferred.
- Do not enable purchases or rewards until seller settlement, refunds, final dispute resolution, digital delivery, payment verification, and end-to-end tests pass.
- Ad campaigns remain review metadata only until billing, budget enforcement, delivery, and analytics are implemented and tested.

## Verification gates before APK

1. Gateway TypeScript build and activity unit/integration tests.
2. Database migration review and integration/concurrency tests where persistent state is introduced.
3. Unity Editor compilation and scene/prefab validation.
4. Two-device multiplayer testing, reconnect/disconnect, moderation revocation, and adverse network testing.
5. Visual inspection on the actual city scene and Android performance checks.
6. Only after these gates, build and test the Android APK.

## Current baseline

The current source has spatial event admission and a synchronized dance gesture. That is not a complete activity framework. Sports, racing, adventure objectives, cinema/concert interactions, education/workshops, authoritative scoring, durable activity results, AI citizens, and connected persistent districts remain outstanding. Unity compilation, database integration testing, gateway deployment, and physical-device testing remain unverified.
