-- Provider-neutral top-up intent records. This does not process or verify payments.
-- Only a trusted server-side provider adapter may mark an intent paid and credit a wallet.
CREATE TABLE IF NOT EXISTS uceno_credit_topup_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 2 AND 40),
  client_idempotency_key TEXT NOT NULL CHECK (length(client_idempotency_key) BETWEEN 8 AND 160),
  provider_reference TEXT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  purchased_credits BIGINT NOT NULL CHECK (purchased_credits > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','failed','expired','cancelled')),
  provider_event_id TEXT,
  provider_payload_digest TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  UNIQUE (user_id, client_idempotency_key),
  CHECK (
    (status = 'paid' AND verified_at IS NOT NULL AND provider_reference IS NOT NULL)
    OR status <> 'paid'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uceno_topup_provider_reference_unique
  ON uceno_credit_topup_intents(provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uceno_topup_provider_event_unique
  ON uceno_credit_topup_intents(provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS uceno_topup_user_history_idx
  ON uceno_credit_topup_intents(user_id, created_at DESC);

-- This migration intentionally defines no function that credits a wallet.
-- Provider-specific signature verification and atomic credit+ledger posting
-- must be implemented together after a payment provider and pricing policy
-- are explicitly selected.
