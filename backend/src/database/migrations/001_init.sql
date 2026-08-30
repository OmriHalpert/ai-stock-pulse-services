-- Baseline schema + default tenant. Idempotent so a database that was
-- seeded by the old postgres-image init.sql can still record this version.
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
    sentiment VARCHAR(20) NOT NULL,
    recommendation TEXT NOT NULL,
    reason TEXT NOT NULL,
    news_summary TEXT NOT NULL,
    price_change_30d VARCHAR(20),
    current_price NUMERIC(10,2),
    sources TEXT NOT NULL,
    trigger_type VARCHAR(32),
    daily_change VARCHAR(20),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recommendations_user_time
    ON recommendations (user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_recommendations_user_ticker_time
    ON recommendations (user_id, ticker, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_tracked_stocks_user
    ON tracked_stocks (user_id);

INSERT INTO users (user_id, telegram_chat_id) VALUES ('default-user', NULL) ON CONFLICT DO NOTHING;
INSERT INTO tracked_stocks (user_id, ticker) VALUES ('default-user', 'AAPL'), ('default-user', 'TSLA'), ('default-user', 'NVDA') ON CONFLICT DO NOTHING;
