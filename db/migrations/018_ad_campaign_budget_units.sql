-- Make campaign budget units explicit. This records intent only; it does not debit credits or verify payment.
ALTER TABLE virtual_ad_campaigns
  ADD COLUMN IF NOT EXISTS budget_unit TEXT NOT NULL DEFAULT 'minor_currency_unit'
    CHECK (budget_unit IN ('minor_currency_unit','purchased_credit'));

ALTER TABLE virtual_ad_campaigns
  ADD CONSTRAINT virtual_ad_campaign_budget_unit_matches_source
  CHECK (
    (payment_source = 'real_money' AND budget_unit = 'minor_currency_unit') OR
    (payment_source = 'purchased_credits' AND budget_unit = 'purchased_credit')
  );

CREATE INDEX IF NOT EXISTS virtual_ad_campaigns_advertiser_idx
  ON virtual_ad_campaigns(advertiser_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS virtual_ad_campaigns_review_idx
  ON virtual_ad_campaigns(created_at ASC)
  WHERE status = 'pending_review';
