# UCENO direct messaging API

## Current scope
- GET /api/conversations lists conversations the signed-in user belongs to.
- POST /api/conversations with { "handle": "other_user" } creates or reuses a one-to-one direct conversation.
- GET /api/conversations/{id}/messages returns the latest 50 messages in chronological order and updates the caller's read timestamp.
- POST /api/conversations/{id}/messages with { "body": "Hello" } sends a text message to a conversation the user belongs to.

Apply db/schema.sql to the configured PostgreSQL database before use. Conversation membership is checked server-side for every message read/send.

## Not yet implemented
Group creation, channel management, realtime delivery/WebSockets, push notifications, message edit/delete, attachments, voice notes, calling, end-to-end encryption, block/report controls, rate limiting and delivery/read receipts. The current endpoints provide persistent text messaging primitives, not a complete WhatsApp/Telegram replacement.
