# UCENO Virtual World — Repository and Environment Audit

**Audit date:** 2026-10-31  
**Scope:** Read-only inspection of the UCENO Social GitHub repository and connected Neon project.  
**No production data, schema, deployment settings, or secrets were changed.**

## 1. Confirmed source and database

- Repository: `ukaeke-stack/uceno-social`
- Audited application baseline: `main` at `c810f72e703da12825c595e6bb3349bb6af172f7`
- Neon project: `uceno` (`empty-river-03798156`)
- Primary/default Neon branch: `production` (`br-holy-cloud-b4klj78e`), state `ready`
- Additional branch `uceno-pr16-staging` exists and is ready. It is not used for this project.
- Created isolated Neon branch `uceno-virtual-world-dev` (`br-nameless-tree-b4pgla2u`) from the production branch at parent LSN `0/33B1940`. It is ready and was created without a compute endpoint to avoid idle compute use. No schema changes have been applied to it.
- Production database inventory contains 22 public base tables. The live inventory includes users, social graph, posts/comments/stories, messaging, communities, notifications, calls, blocks, reports and moderation tables.
- Live `users` schema includes UUID identity, email/phone, password hash, profile fields and moderation fields (`moderation_status`, `suspended_until`, `moderation_note`, `moderated_at`, `moderated_by`).
- No world-specific tables were found in the production public schema.

## 2. Deployment and build pipeline findings

- The current Android package is a Capacitor 7 shell configured to load `https://uceno-social.onrender.com`; it is not a native Unity player.
- The existing CI workflow builds the Next.js app, runs the smoke test against the production build, generates/syncs the Capacitor Android project and attempts an Android debug APK build.
- The Android CI path requires the Firebase native configuration secret `FIREBASE_GOOGLE_SERVICES_JSON`.
- The separate release workflow requires Firebase configuration plus Android keystore and signing secrets. No secret values were inspected or exposed.
- There is no Unity project or Unity Android/Web build job in the inspected main-branch workflows.
- The existing package dependencies include LiveKit client for calling; this does not establish that a game-state multiplayer service exists.

## 3. Authentication integration constraints

- Existing `uceno_session` cookie is an HttpOnly HS256 JWT with a seven-day lifetime.
- Session validation checks the user record and current moderation state in PostgreSQL.
- The current cookie/session token must not be handed to Unity as a game token.
- The Unity handoff must be implemented as a separate short-lived, single-use exchange, with a dedicated world-token signing key and server-side account/moderation checks.

## 4. Migration and backup cautions

- The repository contains numbered SQL migration files, but the live database does not expose an obvious public migration-history table in the inspected table inventory.
- Therefore, migration filenames alone are not proof of which migrations ran. Compare actual live schema with each proposed migration before applying anything.
- The production Neon branch is currently marked unprotected in the branch metadata. Do not treat that as a backup or rollback guarantee.
- A complete backup/restore drill and explicit confirmation of a safe isolated development branch are still required before any virtual-world migration.
- Do not apply virtual-world migrations to the production branch during the prototype phase.

## 5. Consequences for implementation

1. Keep the current UCENO Social production app and database behavior unchanged.
2. Use a separate, isolated development branch/database for the first schema and API experiments after confirming its lineage and reset/restore procedure.
3. Implement and test the world-entry code exchange in the existing Next.js backend, but only after the isolated test environment is established.
4. Build the Unity Android and desktop Web client independently from the current Capacitor shell.
5. Select multiplayer infrastructure only after a working two-client authoritative-room proof of concept and cost/security comparison.
6. Add CI for Unity builds and server tests before treating the virtual-world code as releasable.

## 6. Audit status

- [x] Confirmed repository and audited main commit.
- [x] Confirmed Neon project and primary production branch.
- [x] Read production table inventory and relevant user identity/moderation columns.
- [x] Inspected current auth/session implementation.
- [x] Inspected Capacitor configuration and CI/release workflow definitions.
- [x] Create a dedicated virtual-world development branch from production (no compute; no schema changes).
- [ ] Confirm a point-in-time restore procedure and complete a restore drill before migrations.
- [ ] Review migrations 001–014 against the live schema and confirm exact applied state; no public migration-history table was found.
- [ ] Create Unity project and authoritative multiplayer proof of concept.
- [ ] Implement and test secure world-entry exchange in isolated environment.

**Release status:** No Unity client, world server, world-entry API, world schema or multiplayer deployment has been implemented yet.
