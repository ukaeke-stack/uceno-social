# UCENO Social — Complete Platform Roadmap

**Status:** Proposed delivery plan  
**Production branch:** `main`  
**Principle:** Deliver the complete social-platform vision in small, reversible, tested releases. “All features” means all roadmap phases are in scope; it does not mean shipping untested changes together.

## 1. Current-state baseline and no-duplication rule

The repository currently contains application areas for account, calls, communities, messages, user profiles, updates, a home feed, database schema/migrations, and Android/Capacitor integration. The recent production work also includes native incoming-call notification action dispatch.

Before adding any feature, perform a code-and-database inventory and classify it as:
- **Exists and verified:** retain it; improve only if a documented defect exists.
- **Exists but incomplete/unverified:** finish and test it; do not create a second implementation.
- **Missing:** add it as a new capability.
- **Deprecated:** remove only after usage and migration checks.

Do not treat a page, button, mock card, or API stub as a completed feature. A capability counts as implemented only when its UI, authenticated server behavior, persistence, authorization, notifications (where relevant), and tests work together.

### Existing capability areas to preserve

- Account/profile and user pages
- Home feed, posts and updates/stories
- Communities
- Private messaging
- Audio/video calling and incoming-call notifications
- Android app shell, push setup and update flow

The precise completeness of each area is an audit task, not assumed from the presence of its route.

## 2. Delivery phases

### Phase 0 — Production stability and capability audit (first)

1. Record the production commit, deployment status, Android build status and database migration level.
2. Map every route, API endpoint, database table, background job, push event and Android native integration.
3. Identify overlapping features and mark the canonical implementation for each.
4. Add smoke tests for sign-in/session, feed, post creation, media upload, messaging, calls, push delivery, block/report and account deletion.
5. Verify call Answer/Decline from notification with app open, backgrounded and terminated before layering new communication features on top.
6. Add error monitoring, structured server logs, health checks, backup/restore verification and a rollback procedure.

**Exit gate:** baseline build and smoke tests pass; no unresolved critical security or data-loss issue.

### Phase 1 — Trust, safety and account controls

- Two-factor authentication and session/device management.
- Privacy centre: audience controls, discoverability, online status and read receipts.
- Block, mute, restrict and report flows with server-side enforcement.
- Spam/abuse rate limits, suspicious-link warnings and moderation queue.
- Account export, deactivation and permanent deletion workflow.
- Admin audit trail and documented moderation escalation.

**Exit gate:** authorization tests cover cross-user access, blocks, private content and admin permissions; deletion/export tested against backups.

### Phase 2 — Rich social content

- Short-form vertical video (UCENO Reels): upload, transcoding, playback, captions, reactions, comments and sharing.
- Video processing limits, adaptive playback, thumbnail generation and storage lifecycle.
- Drafts, scheduled publishing and post editing history.
- Saved-post collections and improved feed ranking controls.
- Polls and question posts.

**Exit gate:** upload and playback tested on low bandwidth and common Android devices; storage costs, moderation and copyright/report workflows defined.

### Phase 3 — Communities and communication expansion

- Complete existing communities rather than creating a parallel Groups system: public/private membership, roles, moderation, pinned posts and invitations.
- Group chat with member roles, delivery/read states and message search.
- Group audio/video calls with host controls, participant limits and reconnect handling.
- Voice notes, message replies, forwarding, reactions and attachment previews.
- Optional disappearing messages with clear retention semantics.
- Message translation, with original text retained and translation clearly labelled.

**Exit gate:** concurrency, reconnect, notification routing, abuse controls and permission boundaries tested.

### Phase 4 — Events and discovery

- UCENO Events: event pages, RSVP, invitations, reminders and online meeting links.
- Local discovery of opted-in users, businesses and public events.
- Nearby discovery must be opt-in, coarse by default and never expose exact location without explicit consent.
- Search across people, posts, communities, events and businesses with privacy-aware indexing.

**Exit gate:** privacy review, location permission review, search authorization tests and notification preference tests pass.

### Phase 5 — Business and marketplace

- Business profiles with verification, catalogues, opening hours and contact methods.
- Marketplace listings, categories, search, seller profiles and buyer/seller conversations.
- Listing moderation, prohibited-item policy, scam reporting and seller reputation.
- If payments are later introduced: use a regulated payment provider, server-side verification, idempotent webhooks, refund/dispute handling and no storage of card credentials.

**Exit gate:** fraud and prohibited-listing controls, seller verification policy, transaction reconciliation and support process are ready. Do not represent a listing as a completed transaction.

### Phase 6 — Creator tools and monetization

- Creator analytics: reach, watch time, engagement and follower trends.
- Creator eligibility and policy dashboard.
- Optional subscriptions, gifts or revenue sharing only after legal, tax, payout, fraud and financial reconciliation design.
- Transparent earnings statements and payout history.
- Monetization controls must be feature-flagged and disabled until operationally ready.

**Exit gate:** financial controls, payout reconciliation, fraud monitoring, creator terms and support processes approved.

### Phase 7 — AI assistance and personalization

- Caption and post-writing assistance.
- Optional translation and long-thread summarization.
- Creator content ideas and accessibility captions.
- Personalized feed controls with explanations and a chronological option.
- AI-generated content labels where appropriate; no silent posting or messaging on a user's behalf.

**Exit gate:** privacy/data-use review, safety evaluation, cost limits, opt-out controls and human reporting path pass.

## 3. Release sequence

Each phase is split into small pull requests. Suggested first delivery order:

1. Baseline audit and regression suite.
2. Fix and verify existing calling, notification and messaging gaps.
3. Trust/safety foundation.
4. Reels MVP.
5. Community completion and group chat.
6. Group calling and voice notes.
7. Events and privacy-aware discovery.
8. Business profiles and marketplace.
9. Creator analytics and monetization readiness.
10. AI assistance.

Dependencies may change after Phase 0 discovers the actual implementation state.

## 4. Production safety rules

- Never commit production secrets or copy them into logs.
- Do not run destructive schema changes directly against production.
- Use additive migrations first; deploy compatible code; backfill; then remove obsolete fields only in a later release.
- Use feature flags for new user-facing capabilities and staged rollout by percentage/cohort.
- Keep existing API contracts backward-compatible where practical.
- Require lint, type-check, unit/integration tests, production build and Android build for relevant changes.
- Require migration tests and rollback notes for every schema change.
- Preserve the last known-good APK and deployment revision.
- Do not merge a feature merely because the UI renders; verify server authorization and persistence.
- Test critical Android flows on physical devices, including app foreground/background/terminated states.
- Roll out to internal testers first, then a small cohort, then all users after monitoring.

## 5. Definition of done for every feature

A feature is complete only when all applicable items are true:

- User journey and edge cases documented.
- UI is accessible and works on mobile screens.
- API validates input and enforces authentication/authorization server-side.
- Database constraints, indexes and migrations are included where needed.
- Rate limits, abuse handling and privacy rules are covered.
- Loading, empty, offline, retry and failure states are implemented.
- Notifications are deduplicated and respect user preferences.
- Automated tests cover success, failure, unauthorized access and regression.
- Production build and Android build pass.
- Staging verification is recorded; physical-device verification is recorded for native features.
- Feature flag, rollout plan, monitoring and rollback instructions exist.

## 6. Immediate next work

Start with Phase 0. Produce a capability matrix with columns for feature, UI route, API, tables, authorization, tests, observed status and next action. Do not start Reels or Marketplace until the audit identifies the canonical media upload, feed, user, moderation and storage services.

This roadmap does not authorize an unreviewed bulk release. It authorizes progressive implementation through reviewed pull requests and verified production deployments.
