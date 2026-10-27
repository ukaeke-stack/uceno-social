# UCENO account API setup

## Implemented
- Registration using exactly one contact method: email or phone.
- Unique handles and contact values enforced by PostgreSQL.
- Password hashes using bcrypt with 12 rounds.
- Signed seven-day HTTP-only session cookie with SameSite=Lax.
- Sign-in, current-session lookup and logout endpoints.
- Server-side input validation and generic invalid-credentials response.

## Required setup
1. Create a PostgreSQL database in Neon or another PostgreSQL provider.
2. Apply db/schema.sql to that database.
3. Set DATABASE_URL and a random SESSION_SECRET of at least 32 characters in the deployment environment.
4. Never commit production secrets to GitHub.
5. Redeploy and test register, sign in, session lookup and logout.

## API routes
- POST /api/auth/register: displayName, handle, contactType (email or phone), matching contact field and password (10+ characters).
- POST /api/auth/login: identifier (email or phone) and password.
- GET /api/auth/me: current session user or { user: null }.
- POST /api/auth/logout: clear the session cookie.

Phone numbers must use international format such as +2348012345678.

## Not yet production-ready
Email/SMS verification, account recovery, rate limiting, bot protection, session revocation, MFA and account deletion are not implemented. No database connection is configured by this commit; routes return service-unavailable until environment variables and schema are set. Add CSRF/origin checks and rate limiting before public launch. A successful build is not a security audit.
