# UCENO Paystack Purchased Credit integration

## Safety boundary
- Never accept client-supplied payment status, purchased-credit quantity, user ID, or verified amount as proof of payment.
- A signed webhook is a notification, not the final authority: verify the transaction server-to-server with Paystack and match reference, expected amount, currency, and successful status.
- The database function `issue_verified_purchased_credits` performs the wallet increment, ledger insert, and top-up status update in one transaction. It is idempotent for an already-paid intent.
- Keep `MARKETPLACE_ESCROW_ENABLED` unset/false. This work does not enable marketplace escrow, seller payouts, refunds, or advertising delivery.
- Do not activate advertiser billing or ad delivery until billing debit, campaign eligibility, spend caps, reporting, and rollback are implemented and tested.

## Required environment
- `PAYSTACK_SECRET_KEY`: server-side secret only; never expose to browser or Unity.
- `PAYSTACK_CALLBACK_URL`: absolute HTTPS URL to the public post-checkout return page; this return page must not issue credits.
- `UCENO_CREDIT_PACKAGES_JSON`: server-only JSON package registry. Example shape: `{"starter":{"credits":100,"prices":{"NGN":50000,"USD":500}}}`. Amounts are integer minor units (for example, kobo for NGN and cents for USD); use only currencies enabled for the merchant account. These example values are illustrative, not recommended prices.
- Public checkout URLs must use HTTPS in production.
- Use Paystack-supported currencies and merchant-country capabilities. Multi-currency means each intent stores its actual ISO currency and amount in that currency's minor units; it does not imply every currency/account combination is supported.

## Required flow
1. Authenticated server creates a pending top-up intent using a server-owned price/credit package. Client sends only the package identifier and idempotency key.
2. Server calculates amount and Purchased Credits from trusted package configuration, then initializes Paystack with a unique reference and metadata containing only the intent identifier.
3. Browser/client is redirected to Paystack checkout; client return URL is informational only.
4. Webhook route verifies the Paystack SHA-512 HMAC over the exact raw request body using `PAYSTACK_SECRET_KEY`.
5. For `charge.success`, server verifies the transaction using Paystack's verify endpoint. Match the saved provider reference, expected amount, expected currency, successful status, and intent metadata.
6. Server invokes `issue_verified_purchased_credits` with verified fields. A duplicate webhook or retry must not duplicate credits.
7. Log event outcomes without logging secret keys, full payment details, or unnecessary personal information.

## Rollout checklist
- [ ] Decide and configure server-owned credit packages and currency-specific prices.
- [ ] Apply migration 021 after review and confirm migrations 015–020 are applied.
- [x] Implement authenticated top-up initialization route with request validation, server-owned package pricing, and idempotency. Add platform-level rate limiting before production rollout.
- [x] Implement raw-body Paystack webhook route with signature verification and server-to-server transaction verification.
- [x] Add authenticated user ownership during initialization, exact currency/amount/reference matching, webhook retry handling, and safe failure states.
- [ ] Test duplicate webhook delivery, concurrent callbacks, mismatched amount/currency/reference, invalid signatures, timeouts, failed transactions, and replayed idempotency keys.
- [ ] Run database migration/integration tests and application build.
- [ ] Keep PR #38 draft and unmerged until backend checks, migration tests, Unity compilation, Android build, and physical-device tests are complete.

This document and the adapter are source additions, not proof of live payment integration. No payment should be accepted until the routes, package pricing, migration, secrets, and tests are complete.


## Initialization endpoint

```http
POST /api/payments/paystack/initialize
Content-Type: application/json

{
  "packageId": "starter",
  "currency": "NGN",
  "idempotencyKey": "a-client-generated-unique-key"
}
```

The client cannot set the user ID, amount, or credit quantity. The endpoint derives identity from the UCENO session and amount/credits from `UCENO_CREDIT_PACKAGES_JSON`. Package and currency combinations absent from configuration are rejected. The checkout URL is returned only after Paystack accepts initialization. Apply migration 021 before enabling this endpoint, configure the secret and callback URL in the server environment, and run duplicate/race and provider-failure tests before production use.
