-- Amounts are stored in USDC base units (6 decimals) as BIGINT.

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  owner_address TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  vault_address TEXT UNIQUE,
  -- Owner settings the agent works within (instalments, chasing, reserve target).
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_block BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  email TEXT,
  telegram_chat_id TEXT,
  whatsapp TEXT,
  wallet_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_requests (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  invoice_no TEXT NOT NULL,
  description TEXT,
  amount BIGINT NOT NULL,
  paid_amount BIGINT NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  -- open | part_paid | paid | cancelled
  status TEXT NOT NULL DEFAULT 'open',
  -- Instalment plan offered by the agent: [{amount, due_date}]
  instalments JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  UNIQUE (business_id, invoice_no)
);

CREATE TABLE IF NOT EXISTS payments_in (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  tx_hash TEXT NOT NULL,
  log_index INT NOT NULL,
  from_address TEXT NOT NULL,
  amount BIGINT NOT NULL,
  block_number BIGINT NOT NULL,
  request_id TEXT REFERENCES payment_requests(id),
  -- clean | flagged | blocked, plus the details
  screening JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tx_hash, log_index)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  email TEXT,
  wallet_address TEXT NOT NULL,
  previous_wallet TEXT,
  wallet_changed_at TIMESTAMPTZ,
  category TEXT NOT NULL DEFAULT 'suppliers',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  invoice_no TEXT NOT NULL,
  description TEXT,
  amount BIGINT NOT NULL,
  category TEXT NOT NULL,
  due_date DATE NOT NULL,
  -- Purchase-order amount the bill should match, if the owner gave one.
  expected_amount BIGINT,
  -- new | scheduled | held | awaiting_approval | paid | rejected | blocked
  status TEXT NOT NULL DEFAULT 'new',
  -- bytes32 reference used onchain so a bill can't be paid twice.
  ref TEXT NOT NULL,
  pay_after DATE,
  approval_id BIGINT,
  paid_tx TEXT,
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  UNIQUE (business_id, ref)
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  seq BIGSERIAL,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  -- pay | hold | early_pay | reserve | release | approval | chase | instalment | screen | match | note
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- The exact text that was hashed, its keccak256, and the hash of the entry before it.
  body TEXT NOT NULL,
  hash TEXT NOT NULL,
  prev_hash TEXT,
  anchor_tx TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chases (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  request_id TEXT NOT NULL REFERENCES payment_requests(id),
  channel TEXT NOT NULL,
  message TEXT NOT NULL,
  -- sent | failed | skipped (channel not set up)
  status TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS screenings (
  address TEXT PRIMARY KEY,
  result JSONB NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requests_business ON payment_requests (business_id, status);
CREATE INDEX IF NOT EXISTS idx_bills_business ON bills (business_id, status);
CREATE INDEX IF NOT EXISTS idx_decisions_business ON decisions (business_id, seq DESC);
CREATE INDEX IF NOT EXISTS idx_chases_request ON chases (request_id, created_at DESC);
