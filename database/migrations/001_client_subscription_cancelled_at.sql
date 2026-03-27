-- Run once on existing databases (Supabase SQL editor or psql).
ALTER TABLE client_subscriptions
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
