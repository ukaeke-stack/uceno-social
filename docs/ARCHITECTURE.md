# UCENO architecture plan

## Initial deployment shape

Start with a modular monolith and separate background workers. This keeps the first production release understandable while allowing high-traffic modules to split out later.

- **Clients:** Next.js web; React Native Android/iOS client sharing design tokens and API contracts.
- **API:** TypeScript modular API with validated inputs, authentication, authorization, rate limits and versioned endpoints.
- **Data:** PostgreSQL for durable relational data; object storage/CDN for media; Redis-compatible cache/queues when required.
- **Realtime:** WebSocket gateway with durable message records, idempotent sends, reconnect/sync cursors and delivery receipts.
- **Calls:** WebRTC with managed SFU/media infrastructure; push notification signaling; TURN for restrictive networks.
- **Push:** FCM for Android/web and APNs for iOS.
- **Observability:** structured logs, metrics, traces, uptime checks, error reporting and tested backups.

## Domain modules

Identity and sessions; profiles, follows and blocks; posts, comments, reactions and bookmarks; media upload/processing and moderation; direct messages and conversation membership; groups, channels, roles and invitations; stories/status and expiration jobs; notifications and preferences; discovery, trends and search; calls and live sessions; reports, moderation, appeals and audit events; creator/business features and billing after core product validation.

## Non-negotiable behavior

- Private resources are authorized on every server request.
- Message sends are durable and idempotent; reconnects recover missed events.
- Media uploads use signed, short-lived upload URLs and content validation.
- Account recovery is rate-limited and does not reveal whether an account exists.
- Block/mute/report actions work across all relevant surfaces.
- Retention, deletion, backup restoration and data export are tested.
- Encryption claims must match the actual threat model and implementation.

## Release gates

A feature is not production-ready merely because a screen or endpoint exists. Each release requires unit/integration tests, permission tests, security review for sensitive flows, mobile device checks, accessibility checks, observability, rollback plan and documented limitations.
