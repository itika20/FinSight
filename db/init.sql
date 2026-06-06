-- =============================================================================
-- FinSight — Full Schema (current state)
-- Run this on a fresh database to get to the current schema in one shot.
-- All tables, indexes, and constraints included.
-- =============================================================================

-- Enable pgcrypto for gen_random_uuid() if not already active
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- -----------------------------------------------------------------------------
-- 1. users
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- -----------------------------------------------------------------------------
-- 2. uploads
--    statement_type: 'bank' | 'credit_card'
--    billing_month:  'YYYY-MM'  — populated for credit_card uploads only
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS uploads (
    id                UUID        PRIMARY KEY,
    user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename          VARCHAR(255) NOT NULL,
    file_type         VARCHAR(50)  NOT NULL DEFAULT 'pdf',
    statement_type    VARCHAR(20)  NOT NULL DEFAULT 'bank',
    billing_month     VARCHAR(7),                          -- NULL for bank uploads
    status            VARCHAR(50)  NOT NULL DEFAULT 'processing',
                                                           -- processing | completed | failed
    transaction_count INT          NOT NULL DEFAULT 0,
    created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON uploads(user_id);


-- -----------------------------------------------------------------------------
-- 3. transactions
--    amount:       negative = debit, positive = credit
--    account_type: 'bank' | 'credit_card'  (mirrors upload.statement_type)
--    billing_month:'YYYY-MM' — only set for credit_card rows
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id            UUID         PRIMARY KEY,
    user_id       UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    upload_id     UUID         NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    date          DATE         NOT NULL,
    description   VARCHAR(255) NOT NULL,
    amount        DECIMAL(15,2) NOT NULL,
    type          VARCHAR(50)  NOT NULL,            -- 'debit' | 'credit'
    balance       DECIMAL(15,2),                    -- nullable — CC statements have no running balance
    category      VARCHAR(100),
    confidence    VARCHAR(50),
                  -- 'high' | 'medium' | 'low' | 'uncategorised' | 'user_confirmed'
    account_type  VARCHAR(20)  NOT NULL DEFAULT 'bank',
    billing_month VARCHAR(7),                       -- NULL for bank transactions
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id   ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_upload_id ON transactions(upload_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date      ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);


-- -----------------------------------------------------------------------------
-- 4. user_vpa_memory
--    Learned merchant→category mappings from user corrections.
--    Never deleted — survives upload deletion.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_vpa_memory (
    user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vpa              VARCHAR     NOT NULL,     -- e.g. 'swiggy@yesbank', 'bharatpe123456'
    category         VARCHAR     NOT NULL,
    merchant_hint    VARCHAR,
    correction_count INT         NOT NULL DEFAULT 1,
    last_seen        DATE,
    PRIMARY KEY (user_id, vpa)
);


-- -----------------------------------------------------------------------------
-- 5. user_goals
--    decisions:   JSONB — { "Food": { "status": "accepted", "amount": 3000 }, … }
--    baselines:   JSONB — per-category average spend at the time of plan creation
--    accumulated_savings_at_creation: total Investments debits before goal was created
--    count_existing_savings: whether that pre-existing pool counts toward this goal's progress
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_goals (
    id                              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_name                       VARCHAR(255) NOT NULL,
    goal_amount                     DECIMAL(15,2) NOT NULL,
    goal_months                     INT          NOT NULL,
    required_monthly_saving         DECIMAL(15,2) NOT NULL,
    monthly_income_used             DECIMAL(15,2),
    income_override                 DECIMAL(15,2),
    cluster_id                      INT,
    cluster_label                   VARCHAR(100),
    decisions                       JSONB,
    total_monthly_cutback           DECIMAL(15,2),
    baselines                       JSONB,
    accumulated_savings_at_creation DECIMAL(15,2) NOT NULL DEFAULT 0,
    count_existing_savings          BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at                      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_goals_user_id ON user_goals(user_id);


-- -----------------------------------------------------------------------------
-- 6. goal_investments
--    Manual investment records tagged to a specific goal by the user.
--    Deleted automatically when the parent goal is deleted (CASCADE).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS goal_investments (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id    UUID         NOT NULL REFERENCES user_goals(id) ON DELETE CASCADE,
    user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount     DECIMAL(15,2) NOT NULL,
    date       DATE         NOT NULL,
    note       VARCHAR(255),
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_goal_investments_goal_id      ON goal_investments(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_investments_user_goal    ON goal_investments(user_id, goal_id);
