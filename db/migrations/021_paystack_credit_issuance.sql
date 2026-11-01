-- UCENO Purchased Credit issuance for Paystack.
-- Apply only through the reviewed migration process. This migration does not enable escrow or ads.
ALTER TABLE uceno_credit_topup_intents
  ADD COLUMN IF NOT EXISTS provider_access_code TEXT,
  ADD COLUMN IF NOT EXISTS provider_checkout_url TEXT,
  ADD COLUMN IF NOT EXISTS provider_amount_minor BIGINT,
  ADD COLUMN IF NOT EXISTS provider_currency CHAR(3);

-- Enforce a stable ledger reference for a single successful top-up.
CREATE UNIQUE INDEX IF NOT EXISTS uceno_credit_topup_ledger_reference_unique
  ON uceno_credit_ledger(reference_type, reference_id)
  WHERE reference_type = 'credit_topup' AND reference_id IS NOT NULL;

-- A provider callback cannot issue credits merely by changing an intent status.
-- Only the backend payment-verification path should call this function after
-- verifying the transaction directly with Paystack and matching amount/currency/reference.
CREATE OR REPLACE FUNCTION issue_verified_purchased_credits(
  p_intent_id UUID,
  p_provider_reference TEXT,
  p_provider_event_id TEXT,
  p_amount_minor BIGINT,
  p_currency TEXT,
  p_payload_digest TEXT
) RETURNS TABLE(issued BOOLEAN, purchased_balance BIGINT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_intent uceno_credit_topup_intents%ROWTYPE;
  v_balance BIGINT;
BEGIN
  SELECT * INTO v_intent
  FROM uceno_credit_topup_intents
  WHERE id = p_intent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'topup_intent_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_intent.provider <> 'paystack'
     OR v_intent.provider_reference IS DISTINCT FROM p_provider_reference
     OR v_intent.amount_minor <> p_amount_minor
     OR v_intent.currency <> upper(p_currency)
     OR v_intent.status NOT IN ('pending','paid') THEN
    RAISE EXCEPTION 'topup_verification_mismatch' USING ERRCODE = 'P0001';
  END IF;

  IF v_intent.status = 'paid' THEN
    SELECT a.purchased_balance INTO v_balance
    FROM uceno_credit_accounts a WHERE a.user_id = v_intent.user_id;
    RETURN QUERY SELECT FALSE, COALESCE(v_balance, 0);
    RETURN;
  END IF;

  IF p_provider_event_id IS NULL OR length(p_provider_event_id) < 1 THEN
    RAISE EXCEPTION 'provider_event_id_required' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO uceno_credit_accounts(user_id)
  VALUES (v_intent.user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE uceno_credit_accounts
  SET purchased_balance = purchased_balance + v_intent.purchased_credits,
      updated_at = now()
  WHERE user_id = v_intent.user_id
  RETURNING purchased_balance INTO v_balance;

  INSERT INTO uceno_credit_ledger(
    user_id, credit_type, amount, reason, reference_type, reference_id, idempotency_key
  ) VALUES (
    v_intent.user_id, 'purchased', v_intent.purchased_credits,
    'verified_paystack_topup', 'credit_topup', v_intent.id::text,
    'paystack_topup:' || v_intent.id::text
  );

  UPDATE uceno_credit_topup_intents
  SET status = 'paid',
      provider_event_id = p_provider_event_id,
      provider_payload_digest = p_payload_digest,
      verified_at = now(),
      updated_at = now()
  WHERE id = v_intent.id;

  RETURN QUERY SELECT TRUE, v_balance;
END;
$$;

COMMENT ON FUNCTION issue_verified_purchased_credits(UUID,TEXT,TEXT,BIGINT,TEXT,TEXT) IS
'Call only after server-side Paystack transaction verification. Database-level idempotency prevents duplicate Purchased Credit issuance. Does not charge advertisers or enable marketplace escrow.';

-- Do not expose the financial issuance function to anonymous/public SQL callers.
-- The migration owner and trusted server database role retain access according to
-- the database's ownership/role setup; verify the deployed DATABASE_URL role before rollout.
REVOKE ALL ON FUNCTION issue_verified_purchased_credits(UUID,TEXT,TEXT,BIGINT,TEXT,TEXT) FROM PUBLIC;
