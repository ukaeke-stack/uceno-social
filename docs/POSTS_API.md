# UCENO social graph and posts API

## Endpoints
- GET /api/posts?limit=20 returns newest public posts with author handle and aggregate like/comment counts. Limit is clamped to 1–50.
- POST /api/posts requires a session and JSON body { "body": "Your post" }. Body length is 1–5000 characters.
- POST /api/posts/{id}/like requires a session and toggles the current user's like.
- GET /api/posts/{id}/comments returns up to 100 comments.
- POST /api/posts/{id}/comments requires a session and JSON body { "body": "A comment" }, maximum 2,000 characters.
- POST /api/users/{handle}/follow requires a session and toggles the follow relationship.

Apply db/schema.sql to the configured PostgreSQL database before use. The home feed still uses demo data in the browser; wiring it to these endpoints is a separate integration task.

Limitations: text-only posts; no media upload, moderation pipeline, pagination cursor, notification delivery or rate limits. The database-backed endpoints are not live until DATABASE_URL and SESSION_SECRET are configured in the deployment environment.
