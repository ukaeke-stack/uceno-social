# UCENO media and calling setup

## Image/video posts (Cloudinary)

Add these **server-side Render environment variables** to the UCENO web service:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Do not put the API secret in frontend variables or commit it to GitHub. The app issues a short-lived upload signature after checking the UCENO session. The browser uploads directly to Cloudinary. The composer currently limits images to 10 MB and videos to 50 MB. Configure Cloudinary upload limits and moderation in its dashboard as well.

Before deploying this feature, apply `db/migrations/005_media_posts.sql` to the UCENO Neon production database. The migration is additive and adds `media_url` and `media_type` to posts.

## Audio/video calls (LiveKit)

Create a LiveKit project and add these server-side Render environment variables:

- `LIVEKIT_URL` (the project's WebSocket URL, usually `wss://...`)
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

The API secret must remain server-side. The app issues one-hour, room-scoped JWTs only to signed-in users. Both participants must enter the same room name. This first iteration provides room joining and basic audio/video controls; it is not a replacement for explicit incoming-call invitations, ringing, accept/reject, missed-call notifications, or abuse-reporting. Those are still required before calling should be described as production-complete.

## Verification

Run the anonymous/auth-boundary smoke checks with:

```sh
UCENO_BASE_URL=https://uceno-social.onrender.com npm run test:smoke
```

This script does not prove authenticated workflows. After configuring the services and deploying the migration, use two separate test accounts and verify:

1. User A starts a conversation with User B; send a message both ways, refresh, and verify history persists.
2. Open B's profile from a post; follow, refresh, unfollow, and confirm counts/state update. Check Following feed contains followed users and the current user's posts only.
3. Add a comment, reply to it, like/unlike the comment, refresh, and verify counts persist.
4. Create a community; join from the second account; confirm member count changes; leave and confirm it returns.
5. Upload a small image and a short video; verify each renders in the feed after refresh.
6. Join the same LiveKit room from two devices/browsers; verify audio, video, mute, camera toggle, and hang-up. Test microphone/camera permissions and reconnect.
7. On Android, use the phone hardware Back button once to return to the previous in-app view; press it twice quickly to confirm the current double-back behavior. Repeat with an open modal and on Messages/Communities/Calls.

Record any failing step before calling the feature verified.
