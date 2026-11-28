-- UCENO marketplace fulfilment and dispute intake.
-- This migration never releases escrow or credits a seller.

ALTER TABLE virtual_marketplace_orders
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (fulfillment_status IN ('pending','seller_delivered','buyer_confirmed','disputed')),
  ADD COLUMN IF NOT EXISTS seller_delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS buyer_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_reason TEXT;

CREATE INDEX IF NOT EXISTS virtual_marketplace_orders_dispute_queue_idx
  ON virtual_marketplace_orders(disputed_at DESC)
  WHERE fulfillment_status = 'disputed';

CREATE OR REPLACE FUNCTION transition_virtual_marketplace_order(
  p_actor_user_id UUID,
  p_order_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_order virtual_marketplace_orders%ROWTYPE;
BEGIN
  IF p_action NOT IN ('seller_delivered','buyer_confirm','buyer_dispute') THEN
    RAISE EXCEPTION 'invalid_order_action' USING ERRCODE = 'P0001';
  END IF;
  IF p_action = 'buyer_dispute' AND
     (p_reason IS NULL OR length(btrim(p_reason)) < 10 OR length(p_reason) > 1000) THEN
    RAISE EXCEPTION 'invalid_dispute_reason' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_order
  FROM virtual_marketplace_orders
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'P0001'; END IF;

  IF p_action = 'seller_delivered' THEN
    IF v_order.seller_user_id <> p_actor_user_id THEN
      RAISE EXCEPTION 'seller_only' USING ERRCODE = 'P0001';
    END IF;
    IF v_order.status <> 'escrowed' THEN
      RAISE EXCEPTION 'order_not_escrowed' USING ERRCODE = 'P0001';
    END IF;
    IF v_order.fulfillment_status = 'seller_delivered' THEN
      RETURN to_jsonb(v_order) || jsonb_build_object('replayed', true);
    END IF;
    IF v_order.fulfillment_status <> 'pending' THEN
      RAISE EXCEPTION 'invalid_fulfillment_transition' USING ERRCODE = 'P0001';
    END IF;
    UPDATE virtual_marketplace_orders
      SET fulfillment_status = 'seller_delivered',
          seller_delivered_at = NOW(), updated_at = NOW()
      WHERE id = p_order_id
      RETURNING * INTO v_order;

  ELSIF p_action = 'buyer_confirm' THEN
    IF v_order.buyer_user_id <> p_actor_user_id THEN
      RAISE EXCEPTION 'buyer_only' USING ERRCODE = 'P0001';
    END IF;
    IF v_order.fulfillment_status = 'buyer_confirmed' THEN
      RETURN to_jsonb(v_order) || jsonb_build_object('replayed', true);
    END IF;
    IF v_order.status <> 'escrowed' OR v_order.fulfillment_status <> 'seller_delivered' THEN
      RAISE EXCEPTION 'delivery_not_confirmable' USING ERRCODE = 'P0001';
    END IF;
    UPDATE virtual_marketplace_orders
      SET fulfillment_status = 'buyer_confirmed',
          buyer_confirmed_at = NOW(), updated_at = NOW()
      WHERE id = p_order_id
      RETURNING * INTO v_order;

  ELSE
    IF v_order.buyer_user_id <> p_actor_user_id THEN
      RAISE EXCEPTION 'buyer_only' USING ERRCODE = 'P0001';
    END IF;
    IF v_order.status <> 'escrowed' THEN
      RAISE EXCEPTION 'order_not_escrowed' USING ERRCODE = 'P0001';
    END IF;
    IF v_order.fulfillment_status = 'disputed' THEN
      RETURN to_jsonb(v_order) || jsonb_build_object('replayed', true);
    END IF;
    IF v_order.fulfillment_status NOT IN ('pending','seller_delivered') THEN
      RAISE EXCEPTION 'dispute_not_allowed' USING ERRCODE = 'P0001';
    END IF;
    UPDATE virtual_marketplace_orders
      SET fulfillment_status = 'disputed',
          disputed_at = NOW(), dispute_reason = btrim(p_reason), updated_at = NOW()
      WHERE id = p_order_id
      RETURNING * INTO v_order;
  END IF;

  RETURN to_jsonb(v_order) || jsonb_build_object('replayed', false);
END;
$$;
