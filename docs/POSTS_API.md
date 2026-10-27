# UCENO posts API

The current backend slice adds public text posts and authenticated likes.

- GET /api/posts?limit=20 returns the newest public posts, with author handle and aggregate like/comment counts. Limit is clamped to 1–50.
- POST /api/posts requires a valid session and JSON body { "body": "Your post" }. Body length is 1–5000 characters.
- POST /api/posts/{id}/like requires a valid session and toggles the current user's like.

Apply db/schema.sql to the configured PostgreSQL database before use. The home feed still uses demo data in the browser; wiring it to these endpoints is the next integration task.

Important limitations: text-only posts for now, no media upload, no comment create/read endpoints, no follow-based feed, no moderation pipeline, and no rate limits. The database-backed endpoints are not live until DATABASE_URL and SESSION_SECRET are configured in the deployment environment.
