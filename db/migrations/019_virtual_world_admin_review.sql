-- Administrative review metadata only. No escrow release, refund, payout or campaign billing.
ALTER TABLE virtual_ad_campaigns
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'not_submitted'
    CHECK (review_status IN ('not_submitted','pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_note TEXT;

UPDATE virtual_ad_campaigns
SET review_status = CASE
  WHEN status = 'pending_review' THEN 'pending'
  WHEN status = 'rejected' THEN 'rejected'
  WHEN status = 'active' THEN 'approved'
  ELSE 'not_submitted'
END
WHERE review_status = 'not_submitted';

ALTER TABLE virtual_marketplace_orders
  ADD COLUMN IF NOT EXISTS dispute_review_status TEXT NOT NULL DEFAULT 'not_disputed'
    CHECK (dispute_review_status IN ('not_disputed','pending','under_review','reviewed')),
  ADD COLUMN IF NOT EXISTS dispute_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_reviewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispute_review_note TEXT;

UPDATE virtual_marketplace_orders
SET dispute_review_status = 'pending'
WHERE fulfillment_status = 'disputed' AND dispute_review_status = 'not_disputed';

CREATE INDEX IF NOT EXISTS virtual_ad_campaign_review_status_idx
  ON virtual_ad_campaigns(review_status, created_at ASC)
  WHERE review_status = 'pending';
CREATE INDEX IF NOT EXISTS virtual_marketplace_dispute_review_idx
  ON virtual_marketplace_orders(dispute_review_status, disputed_at ASC)
  WHERE dispute_review_status IN ('pending','under_review');
