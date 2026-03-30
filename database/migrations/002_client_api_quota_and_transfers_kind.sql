-- Adds API quota tracking + transfer kind for manual approvals.
-- Safe to run repeatedly.

ALTER TABLE client_subscriptions
  ADD COLUMN IF NOT EXISTS api_quota INT NOT NULL DEFAULT 0;

ALTER TABLE client_subscriptions
  ADD COLUMN IF NOT EXISTS plan_expiration_reminder_2d_sent_at TIMESTAMPTZ;

ALTER TABLE client_transfers
  ADD COLUMN IF NOT EXISTS kind VARCHAR(32) NOT NULL DEFAULT 'subscription';

ALTER TABLE client_transfers
  ADD COLUMN IF NOT EXISTS api_quota_delta INT;

