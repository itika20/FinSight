-- =============================================================================
-- FinSight — Incremental Migrations
--
-- Run these IN ORDER on a database that was set up before init.sql existed.
-- Each migration is idempotent (IF NOT EXISTS / IF EXISTS guards).
-- If you are starting fresh, use init.sql instead — it includes everything.
-- =============================================================================


-- -----------------------------------------------------------------------------
--        Remove anomaly detection columns (feature was scrapped).
-- -----------------------------------------------------------------------------
ALTER TABLE transactions DROP COLUMN IF EXISTS anomaly_score;
ALTER TABLE transactions DROP COLUMN IF EXISTS is_anomaly;


-- -----------------------------------------------------------------------------
--        Remove fixed/variable cost classification feature (feature was scrapped).
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS merchant_classifications;
DROP TABLE IF EXISTS saving_opportunities;

ALTER TABLE transactions DROP COLUMN IF EXISTS cost_type;
ALTER TABLE transactions DROP COLUMN IF EXISTS merchant_normalised;
ALTER TABLE uploads      DROP COLUMN IF EXISTS classification_status;


-- -----------------------------------------------------------------------------
--        Goals — initial schema.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_goals (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_name             VARCHAR(255) NOT NULL,
    goal_amount           DECIMAL(15,2) NOT NULL,
    goal_months           INT          NOT NULL,
    required_monthly_saving DECIMAL(15,2) NOT NULL,
    monthly_income_used   DECIMAL(15,2),
    income_override       DECIMAL(15,2),
    cluster_id            INT,
    cluster_label         VARCHAR(100),
    decisions             JSONB,
    total_monthly_cutback DECIMAL(15,2),
    created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_goals_user_id ON user_goals(user_id);


-- -----------------------------------------------------------------------------
--        Goals — add baselines column for per-category spend snapshots.
-- -----------------------------------------------------------------------------
ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS baselines JSONB;


-- -----------------------------------------------------------------------------
--        Goals — add accumulated_savings_at_creation and count_existing_savings.
--        Needed for the "count existing savings toward this goal" toggle.
-- -----------------------------------------------------------------------------
ALTER TABLE user_goals
    ADD COLUMN IF NOT EXISTS accumulated_savings_at_creation DECIMAL(15,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS count_existing_savings          BOOLEAN       NOT NULL DEFAULT FALSE;


-- -----------------------------------------------------------------------------
--        Goal investments — manual per-goal investment tracking.
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

CREATE INDEX IF NOT EXISTS idx_goal_investments_goal_id   ON goal_investments(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_investments_user_goal ON goal_investments(user_id, goal_id);


-- -----------------------------------------------------------------------------
--        Credit card statement support.
--        statement_type on uploads, account_type + billing_month on transactions.
-- -----------------------------------------------------------------------------
ALTER TABLE uploads
    ADD COLUMN IF NOT EXISTS statement_type VARCHAR(20) NOT NULL DEFAULT 'bank',
    ADD COLUMN IF NOT EXISTS billing_month  VARCHAR(7);

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS account_type  VARCHAR(20) NOT NULL DEFAULT 'bank',
    ADD COLUMN IF NOT EXISTS billing_month VARCHAR(7);

-- Backfill existing rows so they are consistent with the new schema
UPDATE uploads      SET statement_type = 'bank' WHERE statement_type IS NULL;
UPDATE transactions SET account_type   = 'bank' WHERE account_type   IS NULL;
