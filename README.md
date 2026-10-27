# UCENO Social

UCENO is an ambitious social super-app concept combining public social feeds, private messaging, communities, stories, channels, voice/video calls, creator tools and safety controls in one product.

## Current status

This repository starts with a responsive front-end prototype. The home feed includes a brand system, moments row, post composer, likes, saved posts, search filtering, people suggestions, responsive navigation, community discovery cards and modal/toast states.

**This is not yet a production social network.** Accounts, database persistence, real-time messaging, media uploads, push notifications, calling, end-to-end encryption, moderation services and deployment infrastructure are not connected yet. Prototype buttons indicate when a feature is planned rather than pretending a backend operation succeeded.

## Run locally

- Node.js 20 or later
- Run `npm install`
- Run `npm run dev`
- Open `http://localhost:3000`

Production build: `npm run build`, then `npm start`.

## Planned implementation sequence

1. Product specification, interaction map, visual system and accessible responsive UI.
2. Authentication, account recovery, profiles, PostgreSQL schema and authorization rules.
3. Posts, feed pagination, follows, reactions, comments, bookmarks and media storage.
4. Durable real-time private messaging, delivery/read state and multi-device sessions.
5. Groups, channels, stories/status, notifications, discovery and search.
6. Voice/video calling, live streaming, creator/business features and integrations.
7. Trust and safety, privacy/security review, load tests, backups, observability and beta rollout.

## Security requirements before launch

- Never commit secrets to source control.
- Enforce authorization on the server, not only in the UI.
- Use rate limits, spam/abuse controls, report/block workflows and audit trails.
- Use a reviewed end-to-end encryption protocol/library; do not invent cryptography.
- Verify push, upload, account recovery and deletion flows on real devices.
- Provide privacy policy, terms, data export/deletion and incident response processes.
