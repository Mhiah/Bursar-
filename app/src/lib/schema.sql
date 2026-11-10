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

-- Savings: the business's own savings account (a BursarSavings contract) and its plans.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS savings_address TEXT;
-- { whenPaid: { pot, percent, since } | null }
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS savings_plans JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS savings_moves (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  pot INT NOT NULL,
  amount BIGINT NOT NULL,
  -- paid | owner
  source TEXT NOT NULL,
  -- The customer payment a "save when paid" move came from; stops saving the same payment twice.
  payment_id TEXT UNIQUE REFERENCES payments_in(id),
  -- retry (Save when paid, waiting to be sent or retried) | sending (sent to the vault, result not known yet)
  -- | pending (in savings, waiting to go into its pot) | allocating | done | failed (gave up; the owner was told)
  status TEXT NOT NULL DEFAULT 'done',
  tx_hash TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_savings_moves_business ON savings_moves (business_id, created_at DESC);

-- When the agent stopped chasing an invoice and handed it to the owner.
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS chasing_stopped_at TIMESTAMPTZ;
-- When every wallet the business deals with was last re-checked.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS wallets_checked_at TIMESTAMPTZ;
-- Only one agent run per business at a time, even across processes (timer, worker, button).
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS agent_lease_until TIMESTAMPTZ;
-- When the owner last pressed "Run the agent now", to stop it being pressed in a loop.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS last_manual_run_at TIMESTAMPTZ;
-- One savings deposit transaction is recorded once.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_savings_moves_tx ON savings_moves (tx_hash) WHERE source = 'owner';
-- What the agent has paid for AI, per day, so a daily cap holds.
CREATE TABLE IF NOT EXISTS ai_spend (
  day DATE PRIMARY KEY,
  amount BIGINT NOT NULL DEFAULT 0
);
-- Sign-in nonces already used, so a signed sign-in message works once.
CREATE TABLE IF NOT EXISTS used_nonces (
  nonce TEXT PRIMARY KEY,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Incoming payments are found first and handled after, so a restart in between can't lose one.
-- Rows that existed before this column was added were already handled.
ALTER TABLE payments_in ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE payments_in ALTER COLUMN processed_at DROP DEFAULT;
-- Only one run handles a payment at a time.
ALTER TABLE payments_in ADD COLUMN IF NOT EXISTS processing_until TIMESTAMPTZ;
-- What a match did, and when the owner and customer were told about it.
ALTER TABLE payments_in ADD COLUMN IF NOT EXISTS match_info JSONB;
ALTER TABLE payments_in ADD COLUMN IF NOT EXISTS match_told_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE payments_in ALTER COLUMN match_told_at DROP DEFAULT;
CREATE INDEX IF NOT EXISTS idx_payments_in_todo ON payments_in (business_id) WHERE processed_at IS NULL;

-- The pay page says which invoice a transaction paid: the invoice reference for a plain USDC transfer.
CREATE TABLE IF NOT EXISTS pay_claims (
  tx_hash TEXT NOT NULL,
  request_id TEXT NOT NULL REFERENCES payment_requests(id),
  -- Who signed the transaction.
  sender TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tx_hash, request_id)
);

-- Savings moves that can be retried: try count, when to try next, the onchain reference, last change.
ALTER TABLE savings_moves ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
ALTER TABLE savings_moves ADD COLUMN IF NOT EXISTS next_try_at TIMESTAMPTZ;
ALTER TABLE savings_moves ADD COLUMN IF NOT EXISTS ref TEXT;
ALTER TABLE savings_moves ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE savings_moves ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMPTZ;

-- Links that let a business's own AI assistant or software add invoices and bills (the MCP connection).
-- Only a hash of each secret link is kept; the owner sees the link once, when it's made.
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  last4 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
