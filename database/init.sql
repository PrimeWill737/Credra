-- CREDRA — bootstrap schema + admin seeds (Supabase / local Postgres).
-- Safe to run repeatedly: admin tables are dropped and recreated so column renames never drift.
-- `transactions` is NOT dropped (used by the Python processing service).

-- === 1) Reset CREDRA admin tables (order: children with FKs first) ===
DROP TABLE IF EXISTS admin_sessions CASCADE;
DROP TABLE IF EXISTS admin_audit_logs CASCADE;
DROP TABLE IF EXISTS admin_security_events CASCADE;
DROP TABLE IF EXISTS admin_usage_daily CASCADE;
DROP TABLE IF EXISTS admin_settings CASCADE;
DROP TABLE IF EXISTS admin_subscriptions CASCADE;
DROP TABLE IF EXISTS admin_risk_reviews CASCADE;
DROP TABLE IF EXISTS admin_api_keys CASCADE;
DROP TABLE IF EXISTS admin_predictions CASCADE;
DROP TABLE IF EXISTS admin_model_metrics CASCADE;
DROP TABLE IF EXISTS admin_ingestion_runs CASCADE;
DROP TABLE IF EXISTS admin_integrations CASCADE;
DROP TABLE IF EXISTS admin_clients CASCADE;
DROP TABLE IF EXISTS admin_dashboard_snapshot CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;

-- === Client tables (recreated for local testing) ===
DROP TABLE IF EXISTS client_usage_logs CASCADE;
DROP TABLE IF EXISTS client_email_otps CASCADE;
DROP TABLE IF EXISTS client_transfers CASCADE;
DROP TABLE IF EXISTS client_subscriptions CASCADE;
DROP TABLE IF EXISTS client_api_keys CASCADE;
DROP TABLE IF EXISTS client_accounts CASCADE;
DROP TABLE IF EXISTS client_users CASCADE;

-- === 2) Core processing table (kept across re-runs) ===
CREATE TABLE IF NOT EXISTS transactions (
  id VARCHAR(64) PRIMARY KEY,
  account_id VARCHAR(128) NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  narration TEXT,
  category VARCHAR(64),
  raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions (account_id);

-- === 3) Admin schema (fresh every run after DROP above) ===
CREATE TABLE admin_users (
  email VARCHAR(255) PRIMARY KEY,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(64) NOT NULL,
  totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  totp_secret TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_sessions (
  token VARCHAR(128) PRIMARY KEY,
  admin_email VARCHAR(255) NOT NULL REFERENCES admin_users(email) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_admin_sessions_expires ON admin_sessions (expires_at);

CREATE TABLE admin_dashboard_snapshot (
  id BIGSERIAL PRIMARY KEY,
  total_users INT NOT NULL,
  active_api_requests INT NOT NULL,
  loan_insurance_processed INT NOT NULL,
  fraud_alerts INT NOT NULL,
  revenue NUMERIC(12,2) NOT NULL,
  system_uptime VARCHAR(64) NOT NULL,
  system_errors INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_clients (
  id BIGSERIAL PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  api_calls_month INT NOT NULL DEFAULT 0,
  avg_risk_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_integrations (
  id BIGSERIAL PRIMARY KEY,
  provider VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL,
  connected_accounts INT NOT NULL,
  last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_ingestion_runs (
  id BIGSERIAL PRIMARY KEY,
  pipeline_name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  records_ingested INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_model_metrics (
  id BIGSERIAL PRIMARY KEY,
  model_name VARCHAR(128) NOT NULL,
  version VARCHAR(64) NOT NULL,
  previous_version VARCHAR(64) NOT NULL,
  accuracy NUMERIC(5,4) NOT NULL,
  precision_score NUMERIC(5,4) NOT NULL,
  recall_score NUMERIC(5,4) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_predictions (
  id BIGSERIAL PRIMARY KEY,
  applicant_ref VARCHAR(128) NOT NULL,
  prediction_type VARCHAR(64) NOT NULL,
  score NUMERIC(5,2) NOT NULL,
  flagged_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_api_keys (
  id BIGSERIAL PRIMARY KEY,
  key_name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  calls_24h INT NOT NULL,
  error_rate_pct NUMERIC(5,2) NOT NULL,
  rate_limit_per_min INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_risk_reviews (
  id BIGSERIAL PRIMARY KEY,
  item_type VARCHAR(64) NOT NULL,
  applicant_ref VARCHAR(128) NOT NULL,
  risk_level VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  plan_name VARCHAR(64) NOT NULL,
  cycle VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  amount_due NUMERIC(12,2) NOT NULL,
  next_invoice_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_settings (
  key VARCHAR(128) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_security_events (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  admin_email VARCHAR(255),
  ip_address VARCHAR(64),
  details_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_usage_daily (
  day DATE PRIMARY KEY,
  api_calls INT NOT NULL,
  error_count INT NOT NULL,
  revenue NUMERIC(12,2) NOT NULL
);

CREATE TABLE admin_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_email VARCHAR(255) NOT NULL,
  action VARCHAR(128) NOT NULL,
  target_type VARCHAR(64) NOT NULL,
  target_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === Client schema (paying customers) ===
CREATE TABLE client_users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE client_email_otps (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL REFERENCES client_users(email) ON DELETE CASCADE,
  otp_hash VARCHAR(64) NOT NULL,
  purpose VARCHAR(32) NOT NULL DEFAULT 'signup',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_client_email_otps_email ON client_email_otps (email);
CREATE INDEX idx_client_email_otps_expires ON client_email_otps (expires_at);

CREATE TABLE client_accounts (
  id BIGSERIAL PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL UNIQUE REFERENCES client_users(email) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'email_unverified',
  plan_name VARCHAR(64) NOT NULL DEFAULT 'Starter',
  cycle VARCHAR(32) NOT NULL DEFAULT 'monthly',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE client_api_keys (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  key_name VARCHAR(128) NOT NULL DEFAULT 'Production Key',
  api_key_hash VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE client_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES client_accounts(id) ON DELETE CASCADE,
  plan_name VARCHAR(64) NOT NULL,
  cycle VARCHAR(32) NOT NULL,
  amount_due NUMERIC(12,2) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending_transfer',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE client_transfers (
  id BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES client_subscriptions(id) ON DELETE CASCADE,
  payer_name VARCHAR(255) NOT NULL,
  receiving_bank_name VARCHAR(64) NOT NULL,
  receiving_account_number VARCHAR(64) NOT NULL,
  receiving_account_name VARCHAR(255) NOT NULL,
  transaction_reference VARCHAR(128) NOT NULL UNIQUE,
  amount NUMERIC(12,2) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending_admin',
  admin_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE client_usage_logs (
  id BIGSERIAL PRIMARY KEY,
  api_key_id BIGINT NOT NULL REFERENCES client_api_keys(id) ON DELETE CASCADE,
  endpoint VARCHAR(64) NOT NULL,
  status_code INT NOT NULL,
  ok BOOLEAN NOT NULL,
  response_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === 4) Seeds (password plain: CredrabyWilliam-001 — bcrypt hash below) ===
INSERT INTO admin_users (email, password_hash, full_name, role, totp_enabled)
VALUES (
  'knowrist@gmail.com',
  '$2b$12$fWrPXVcTWmCbLVociv.Yd.2Cp0QLosdbZAUONuFHllktDcwgVFebK',
  'William Admin',
  'super_admin',
  FALSE
);

INSERT INTO admin_dashboard_snapshot (
  total_users, active_api_requests, loan_insurance_processed, fraud_alerts, revenue, system_uptime, system_errors
)
VALUES (128, 41, 529, 9, 84210.50, '99.95%', 2);

INSERT INTO admin_clients (company_name, contact_email, role, status, api_calls_month, avg_risk_score)
VALUES
  ('NovaLend', 'ops@novalend.africa', 'client_admin', 'active', 12013, 71.60),
  ('SureShield', 'api@sureshield.ng', 'risk_analyst', 'active', 8202, 64.20),
  ('QuickKash', 'integrations@quickkash.app', 'support', 'trial', 2190, 58.50);

INSERT INTO admin_integrations (provider, status, connected_accounts)
VALUES
  ('Mono', 'healthy', 540),
  ('Okra', 'healthy', 217);

INSERT INTO admin_ingestion_runs (pipeline_name, status, records_ingested)
VALUES
  ('daily-transactions', 'success', 18320),
  ('fraud-events-stream', 'success', 1209),
  ('loan-history-sync', 'failed', 302);

INSERT INTO admin_model_metrics (model_name, version, previous_version, accuracy, precision_score, recall_score)
VALUES
  ('trust-index', 'v2.4.1', 'v2.3.9', 0.9140, 0.8930, 0.8810),
  ('fraud-detector', 'v1.9.0', 'v1.8.4', 0.9720, 0.9540, 0.9420);

INSERT INTO admin_predictions (applicant_ref, prediction_type, score, flagged_reason)
VALUES
  ('LN-10012', 'loan', 74.30, NULL),
  ('FR-22018', 'fraud', 87.10, 'velocity spike'),
  ('IN-93011', 'insurance', 62.90, 'claim pattern anomaly');

INSERT INTO admin_api_keys (key_name, status, calls_24h, error_rate_pct, rate_limit_per_min)
VALUES
  ('Production Key - NovaLend', 'active', 3120, 0.84, 180),
  ('Sandbox - SureShield', 'active', 940, 0.12, 120),
  ('Legacy - QuickKash', 'revoked', 0, 0.00, 60);

INSERT INTO admin_risk_reviews (item_type, applicant_ref, risk_level, status)
VALUES
  ('loan_approval', 'LN-2203', 'high', 'pending'),
  ('fraud_alert', 'FR-1233', 'critical', 'pending'),
  ('insurance_claim', 'IN-4543', 'medium', 'in_review');

INSERT INTO admin_subscriptions (company_name, plan_name, cycle, status, amount_due, next_invoice_date)
VALUES
  ('NovaLend', 'Growth', 'monthly', 'active', 1250.00, (CURRENT_DATE + INTERVAL '15 days')::DATE),
  ('SureShield', 'Enterprise', 'yearly', 'active', 9200.00, (CURRENT_DATE + INTERVAL '40 days')::DATE),
  ('QuickKash', 'Starter', 'monthly', 'overdue', 310.00, (CURRENT_DATE - INTERVAL '7 days')::DATE);

INSERT INTO admin_settings (key, value)
VALUES
  ('risk_cutoff_approve', '75'),
  ('risk_cutoff_review', '55'),
  ('email_template_alert_subject', 'Critical risk alert'),
  ('two_factor_required', 'true');

INSERT INTO admin_security_events (event_type, admin_email, ip_address, details_json)
VALUES ('seed_event', 'knowrist@gmail.com', '127.0.0.1', '{"info":"seeded"}');

INSERT INTO admin_usage_daily (day, api_calls, error_count, revenue)
VALUES
  (CURRENT_DATE - INTERVAL '4 days', 12800, 31, 1320.50),
  (CURRENT_DATE - INTERVAL '3 days', 14020, 25, 1458.20),
  (CURRENT_DATE - INTERVAL '2 days', 15112, 38, 1520.90),
  (CURRENT_DATE - INTERVAL '1 day', 16001, 29, 1632.75),
  (CURRENT_DATE, 8210, 14, 820.10);

INSERT INTO admin_audit_logs (admin_email, action, target_type, target_id)
VALUES ('knowrist@gmail.com', 'seed_bootstrap', 'system', 'init');
