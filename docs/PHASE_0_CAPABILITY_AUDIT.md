# UCENO Phase 0 — Repository Capability Audit

**Audit date:** 2026-10-30  
**Audited ref:** `main` at `dcb340ab17cc1a0f77ca70cca12fac1e0a51cc2b`  
**Scope:** static repository inspection; not a live database, penetration test, production deployment test, or physical-device test.

## Executive result

The project is a compact Next.js + PostgreSQL/Neon + Capacitor Android application. It has real implementations for the core social feed, stories, profiles/follows, direct conversations, communities, call invitations/tokens, push-token registration and native call notification handling.

The codebase is not yet a complete social platform. Several planned features are absent from the inspected schema/routes. Some features have only partial infrastructure. Existing implementation presence must not be confused with end-to-end production verification.

## Capability matrix

| Capability | Evidence found on main | Audit classification | Next action |
|---|---|---|---|
| Authentication | register/login/logout/me routes; session library | Exists; test depth unknown | Add auth/session regression and recovery/security review |
| Profiles | user profile route and profile page | Exists; fields include account type, bio, avatar, location, website | Review privacy controls and account-type permissions |
| Follow graph | follows table and follow route | Exists | Add block-aware behavior and integration tests |
| Feed/posts | posts route, likes, comments, repost routes; posts table | Exists; basic image/video media URL support | Improve pagination, authorization tests, moderation and media processing |
| Stories/updates | stories route; expires_at filtering | Exists | Verify expiry cleanup, audience controls, view receipts and archive policy |
| Direct messaging | conversations and messages routes; membership checked on message reads | Exists for direct chats | Test message authorization, delivery/reconnect, editing/deletion and attachments |
| Group conversations | schema allows group/channel; conversation_members supports roles | Partial infrastructure | Existing create-conversation endpoint only creates direct conversations; implement group creation/member management in this canonical system |
| Communities | communities route, membership route, community migrations and UI | Exists | Audit role enforcement, private membership and moderation |
| Audio/video calling | invitations and token routes, calls UI, LiveKit client | Exists; end-to-end call reliability not verified here | Complete app-state, permission, reconnect and multi-party test matrix |
| Incoming call push | push-token route, Firebase messaging service, native Android notification actions | Exists; notification action merge recently landed | Verify latest production APK and physical device Answer/Decline in foreground/background/terminated states |
| Push notifications | notification routes, push registration and native service | Exists | Verify token refresh, delivery retries, preference controls and duplicate suppression |
| Media uploads | signed Cloudinary media signature route and ownership validation in post route | Partial | Add file size/type validation, video transcoding, moderation and cleanup |
| Search/discovery | home UI contains search/discover entry; no dedicated search API route found in inspected route tree | Incomplete/unclear | Trace UI behavior; add privacy-aware server search if missing |
| Bookmarks/saved posts | home UI includes saved state/navigation; no bookmark route/table found in inspected route tree/schema | UI/partial state only | Implement persistent server-side bookmarks if not found elsewhere |
| Blocks/reports/moderation | no block/report/moderation routes or tables found in inspected route tree and schema | Missing in inspected implementation | Build trust-and-safety foundation before marketplace or open discovery |
| Events | no event route/table found | Missing | Add after group/community foundations |
| Reels | posts support video media, but no dedicated short-video feed/processing pipeline found | Partial media foundation | Add video pipeline and dedicated ranked/chronological Reels experience |
| Marketplace/business | profile account_type supports person/page; no listing/catalogue/order routes or tables found | Partial business identity only | Build business profiles/catalogue/listings after moderation |
| Creator analytics/monetization | no analytics or payout routes/tables found | Missing | Defer until reliable event tracking and financial controls exist |
| AI assistant | no AI API route or provider integration found in inspected route tree | Missing | Add only after privacy and usage-cost controls |
| Account privacy/2FA/device sessions | no dedicated privacy, 2FA or session-device routes/tables found in inspected route tree/schema | Missing/unclear | Add identity and privacy foundation |
| Data export/deletion | no dedicated export/deletion routes found in inspected route tree | Missing/unclear | Design retention and deletion workflows |

## Concrete repository observations

1. `package.json` provides `build`, `lint`, `test:smoke`, and Capacitor sync scripts. No unit-test or integration-test script is declared.
2. `scripts/smoke-test.mjs` checks public page response and several anonymous authentication boundaries. It does not create test users or exercise authenticated social journeys.
3. `db/schema.sql` defines users, follows, posts, post likes, comments, conversations, conversation members, messages and push tokens. Additional migrations add communities, notifications, story/media/call history and mutual connections. No bookmark, block, report, event, marketplace, creator payout or AI tables appear in the inspected base schema.
4. `app/api/conversations/route.ts` creates direct conversations. The schema supports group/channel types, but that alone does not implement group chat management.
5. `app/api/conversations/[id]/messages/route.ts` checks conversation membership on message reads. Expand tests to all message mutations and all cross-user access paths.
6. `app/api/users/[handle]/route.ts` performs schema DDL (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and `CREATE TABLE IF NOT EXISTS`) while serving profile requests. `app/api/calls/invitations/route.ts` also ensures/changes tables and constraints at request time. Move schema evolution into ordered migrations after verifying deployed database state; runtime DDL can create latency, locking and permission surprises.
7. The CI workflow runs Next production build, smoke checks and Android shell generation/build. The roadmap documentation PR's CI run #137 completed successfully for both `build` and `android-shell`. That verifies the documentation PR's codebase build at its tested head; it does not prove live production database migrations or physical call actions work.
8. The home page contains seeded example content as fallback/demo state. Verify that anonymous/demo data cannot be mistaken for persisted real user content and that signed-in feed state always uses the backend.

## Priority issues before feature expansion

### P0 — Production correctness and trust

- Verify incoming-call Answer/Decline on the latest production APK in foreground, background and terminated states.
- Verify call accept/reject server authorization and invitation state transitions; ensure actions are idempotent and cannot accept another user's invitation.
- Review all API routes for session checks, resource ownership, membership checks and private visibility rules.
- Inventory live Neon migrations and reconcile them with checked-in migration files. Do not run destructive SQL during this audit.
- Remove runtime schema mutation from request handlers by creating a migration plan and validating current production schema first.
- Add authenticated integration tests for posting, comments, follows, messaging, communities, calls and notification ownership.

### P1 — Foundational missing capabilities

- Block, mute, report, moderation queue and admin audit trail.
- Persistent bookmarks (the UI currently suggests saved posts, but persistent server-side storage was not found in the inspected schema/routes).
- Search and discover API with privacy-aware filtering.
- Group conversation creation, invitations, roles, member removal and group call integration, reusing conversations/conversation_members.
- Privacy settings and account/session controls.

### P2 — New platform capabilities

- Reels video processing and feed.
- Events and opted-in local discovery.
- Business pages/catalogues and marketplace.
- Creator analytics and monetization after event instrumentation, legal and payout controls.
- AI assistance after privacy review and cost/safety controls.

## Test and release status

- GitHub Actions run #137 for the roadmap PR: `build: success`, `android-shell: success`.
- These are CI checks, not production deployment evidence.
- No live database schema inspection was performed.
- No production smoke test was executed in this audit.
- No physical Android device test was performed.
- No application code or database migration was changed by this audit.

## Next implementation PR

Start with P0 hardening and authenticated regression coverage. Then implement missing trust-and-safety primitives (block/report/moderation) before opening up discovery, groups, marketplace or monetization. Do not start a second group system: extend the existing `conversations` and `conversation_members` model.
