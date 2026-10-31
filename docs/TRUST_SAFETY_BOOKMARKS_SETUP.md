# UCENO trust, safety and bookmarks setup

## Database migrations

Apply these additive migrations to the UCENO Neon production database before enabling the new features:

1. `db/migrations/011_trust_safety.sql` — block relationships and user reports.
2. `db/migrations/012_bookmarks.sql` — persistent saved posts.
3. `db/migrations/013_moderation_enforcement.sql` — audited warnings, temporary suspensions, account disabling, and reversible content removal.

The block APIs already depend on migration 011. The report submission and moderator queue also require its `user_reports` table. The Saved Posts page requires migration 012. Do not deploy the UI/API without applying the matching migrations.

## Moderator access

The moderation queue is closed by default. Set the Render environment variable `UCENO_MODERATOR_IDS` to a comma-separated list of trusted moderator user UUIDs. Retrieve an account UUID in Neon with:

```sql
SELECT id, handle FROM users WHERE handle = 'your_uceno_handle';
```

Only listed UUIDs can read or update reports through `/api/moderation/reports`. Do not use handles or email addresses in this variable. Keep the value server-side; do not prefix it with `NEXT_PUBLIC_`.

## User features

- Profile pages provide Report and Block actions.
- The Blocked Accounts page lists the signed-in user's blocks and allows unblocking.
- Blocking is enforced for profile access, feed visibility, direct messaging and calls; comment reads/creation also check block relationships.
- Public posts can be saved from profile post cards. Saved posts are listed at `/saved`.
- Reports support user, post and comment targets. Duplicate pending/reviewing reports from the same reporter for the same target are suppressed.

## Moderation scope

The moderation queue supports reviewing and dismissing reports, plus audited enforcement actions: user warnings, 1–365 day suspensions, account disabling/restoration, and reported post/comment removal/restoration. Apply migration 013 before deploying the enforcement API. Suspended and disabled accounts cannot use their session; expired suspensions are automatically reactivated on the next session check. Every enforcement action is recorded in `moderation_actions`.
