-- AI Stock Pulse Engine - database initialization
-- Executed automatically by the postgres image on first boot of an empty data volume.

CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(64) PRIMARY KEY,
    telegram_chat_id VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tracked_stocks (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(user_id) ON DELETE CASCADE,
    ticker VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, ticker)
);

CREATE TABLE IF NOT EXISTS recommendations (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(user_id) ON DELETE CASCADE,
    ticker VARCHAR(10) NOT NULL,
    sentiment VARCHAR(20) NOT NULL, -- BULLISH, BEARISH, NEUTRAL
    recommendation TEXT NOT NULL,
    reason TEXT NOT NULL,
    news_summary TEXT NOT NULL,
    price_change_30d VARCHAR(20),
    current_price NUMERIC(10,2),
    sources TEXT NOT NULL,
    -- What cleared the noise filter, so the dashboard can show why an alert
    -- fired rather than only what the model concluded.
    trigger_type VARCHAR(32), -- MOMENTUM_SHIFT, EARNINGS_EVENT, ANALYST_ACTION, TREND_CONFIRMATION
    daily_change VARCHAR(20),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Added after the first release; kept separate so existing volumes upgrade too.
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS trigger_type VARCHAR(32);
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS daily_change VARCHAR(20);

-- The dashboard always reads the newest alerts for one tenant first.
CREATE INDEX IF NOT EXISTS idx_recommendations_user_time
    ON recommendations (user_id, timestamp DESC);

-- The agent de-duplicates alerts by looking up the last alert per ticker.
CREATE INDEX IF NOT EXISTS idx_recommendations_user_ticker_time
    ON recommendations (user_id, ticker, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_tracked_stocks_user
    ON tracked_stocks (user_id);

-- Seed default user and initial tickers
INSERT INTO users (user_id, telegram_chat_id) VALUES ('default-user', NULL) ON CONFLICT DO NOTHING;
INSERT INTO tracked_stocks (user_id, ticker) VALUES ('default-user', 'AAPL'), ('default-user', 'TSLA'), ('default-user', 'NVDA') ON CONFLICT DO NOTHING;
