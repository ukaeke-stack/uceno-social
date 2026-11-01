-- UCENO marketplace purchase reservation.
-- Funds are debited from Purchased Credits and held in escrow.
-- Seller settlement and asset delivery are intentionally separate future workflows.

CREATE TABLE IF NOT EXISTS virtual_marketplace_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES virtual_marketplace_listings(id) ON DELETE RESTRICT,
  buyer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  seller_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 1000),
  unit_price_purchased_credits BIGINT NOT NULL CHECK (unit_price_purchased_credits >= 0),
  total_purchased_credits BIGINT NOT NULL CHECK (total_purchased_credits >= 0),
  status TEXT NOT NULL DEFAULT 'escrowed' CHECK (status IN ('escrowed','settled','refunded','cancelled')),
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (buyer_user_id <> seller_user_id),
  UNIQUE (buyer_user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS virtual_marketplace_orders_buyer_idx
  ON virtual_marketplace_orders(buyer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS virtual_marketplace_orders_seller_idx
  ON virtual_marketplace_orders(seller_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION purchase_virtual_marketplace_listing(
  p_buyer_user_id UUID,
  p_listing_id UUID,
  p_quantity INTEGER,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_listing virtual_marketplace_listings%ROWTYPE;
  v_existing virtual_marketplace_orders%ROWTYPE;
  v_order virtual_marketplace_orders%ROWTYPE;
  v_total BIGINT;
  v_balance BIGINT;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 1000 THEN
    RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = 'P0001';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 16 OR length(p_idempotency_key) > 100 THEN
    RAISE EXCEPTION 'invalid_idempotency_key' USING ERRCODE = 'P0001';
  END IF;

  -- Serialize identical buyer/key retries, even if they arrive concurrently.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_buyer_user_id::text || ':' || p_idempotency_key, 0));

  SELECT * INTO v_existing
  FROM virtual_marketplace_orders
  WHERE buyer_user_id = p_buyer_user_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.listing_id <> p_listing_id OR v_existing.quantity <> p_quantity THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = 'P0001';
    END IF;
    RETURN to_jsonb(v_existing) || jsonb_build_object('replayed', true);
  END IF;

  SELECT * INTO v_listing
  FROM virtual_marketplace_listings
  WHERE id = p_listing_id
  FOR UPDATE;
  IF NOT FOUND OR v_listing.status <> 'active' THEN
    RAISE EXCEPTION 'listing_unavailable' USING ERRCODE = 'P0001';
  END IF;
  IF v_listing.seller_user_id = p_buyer_user_id THEN
    RAISE EXCEPTION 'cannot_buy_own_listing' USING ERRCODE = 'P0001';
  END IF;
  IF v_listing.stock IS NOT NULL AND v_listing.stock < p_quantity THEN
    RAISE EXCEPTION 'insufficient_stock' USING ERRCODE = 'P0001';
  END IF;
  IF v_listing.price_purchased_credits > 1000000000000 / p_quantity THEN
    RAISE EXCEPTION 'purchase_total_overflow' USING ERRCODE = 'P0001';
  END IF;
  v_total := v_listing.price_purchased_credits * p_quantity;

  INSERT INTO uceno_credit_accounts (user_id) VALUES (p_buyer_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE uceno_credit_accounts
  SET purchased_balance = purchased_balance - v_total, updated_at = NOW()
  WHERE user_id = p_buyer_user_id AND purchased_balance >= v_total
  RETURNING purchased_balance INTO v_balance;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_purchased_credits' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO virtual_marketplace_orders
    (listing_id, buyer_user_id, seller_user_id, quantity,
     unit_price_purchased_credits, total_purchased_credits, status, idempotency_key)
  VALUES
    (p_listing_id, p_buyer_user_id, v_listing.seller_user_id, p_quantity,
     v_listing.price_purchased_credits, v_total, 'escrowed', p_idempotency_key)
  RETURNING * INTO v_order;

  INSERT INTO uceno_credit_ledger
    (user_id, credit_type, amount, reason, reference_type, reference_id, idempotency_key)
  VALUES
    (p_buyer_user_id, 'purchased', -v_total, 'marketplace_purchase_escrow',
     'marketplace_order', v_order.id::text, 'marketplace-purchase:' || v_order.id::text);

  IF v_listing.stock IS NOT NULL THEN
    UPDATE virtual_marketplace_listings
    SET stock = stock - p_quantity, updated_at = NOW()
    WHERE id = p_listing_id;
  END IF;

  RETURN to_jsonb(v_order) || jsonb_build_object('replayed', false);
END;
$$;
