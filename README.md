# AI Stock Pulse Engine

A personal market-monitoring assistant for retail investors who do not want to
read financial news all day. An autonomous agent watches your tracked tickers,
throws away routine daily fluctuations, and only speaks up when something
material happens — an earnings miss, an analyst action, or a momentum shift
beyond the noise band. Each alert lands on a dashboard with a one-sentence
verdict, and optionally in your Telegram.

The whole stack runs locally with `docker compose up` and needs **no API keys**.

## Architecture

```
                    ┌──────────────┐
                    │   frontend   │  React + Vite + Tailwind (nginx :5173)
                    └──────┬───────┘
                           │ /api proxy
                    ┌──────▼───────┐
                    │   backend    │  NestJS REST API (:3000)
                    └──────┬───────┘
                           │ pg
                    ┌──────▼───────┐
                    │  postgres    │  schema seeded from init.sql (:5432)
                    └──────▲───────┘
                           │ HTTP (reads watchlist, writes alerts)
                    ┌──────┴───────┐
                    │    agent     │  Python 3.11 asyncio worker
                    └──────────────┘
```

The backend is the only service that talks to PostgreSQL, so the schema has a
single owner. The agent reads its work queue and publishes alerts over HTTP.

| Path               | Service                                                    |
| ------------------ | ---------------------------------------------------------- |
| `backend/`         | NestJS REST API, `pg` connection pool, request validation   |
| `frontend/`        | React 19 dashboard, served by nginx which proxies `/api`    |
| `agent/`           | Python 3.11 asyncio worker: analysis, verdicts, Telegram    |
| `init.sql`         | Schema + seed data, run on the first boot of the DB volume  |
| `docker-compose.yaml` | Orchestration with health checks and a shared network   |

## Quick start

```bash
cp .env.example .env      # optional, every value has a working default
docker compose up --build
```

Then open <http://localhost:5173>.

The agent runs its first cycle immediately on startup, so alerts for the seeded
tickers (`AAPL`, `TSLA`, `NVDA`) appear within a few seconds.

To start over with a clean database:

```bash
docker compose down -v && docker compose up --build
```

`init.sql` only runs when the `pulse-db-data` volume is empty, so `-v` is
required to re-seed.

## How the noise filter works

The agent evaluates every ticker each cycle and discards anything that does not
clear the bar. Only surviving events reach the dashboard.

| Condition                                                       | Result                       |
| --------------------------------------------------------------- | ---------------------------- |
| Daily move below `NOISE_THRESHOLD_PCT` (0.5%) with no event      | Discarded as noise           |
| Daily move at or above `MOMENTUM_THRESHOLD_PCT` (3.5%)           | Alert — `MOMENTUM_SHIFT`     |
| Fresh earnings headline, regardless of price reaction            | Alert — `EARNINGS_EVENT`     |
| Fresh analyst action plus a move above the noise threshold       | Alert — `ANALYST_ACTION`     |
| Move above noise that extends a 30-day trend of 12% or more      | Alert — `TREND_CONFIRMATION` |

"Fresh" means newer than `EVENT_FRESHNESS_HOURS` (36h). Without that bound, a
single downgrade would re-trigger on every cycle for as long as it stayed in the
news feed.

Two guards stop the same story being reported twice. Alerts are de-duplicated by
event: a news-driven alert is identified by its article, and a pure price move is
bucketed to whole percent, so a stock parked at −4% stays quiet while a slide to
−5% counts as new. On top of that, `ALERT_COOLDOWN_HOURS` can impose a minimum
gap per ticker; set it to `0` to rely on de-duplication alone and hear about
every new event the moment it appears.

Sentiment follows whatever caused the alert, so a colour never contradicts the
verdict beside it:

- **Price triggers** (momentum shift, trend continuation) are green or red from
  the direction of the move — the market itself is the event.
- **News triggers** (earnings, analyst action) take their colour from the
  wording of the article, so a downgrade reads bearish even on a green day.
  When the wording carries no unambiguous direction the alert stays neutral
  rather than borrowing the day's drift.

Each alert records which trigger fired and the day's move alongside the 30-day
figure, so the dashboard and the Telegram message both state why it fired and
not only what to consider doing.

## Configuration

Everything is environment driven; see `.env.example` for the full list.

| Variable                      | Default | Purpose                                          |
| ----------------------------- | ------- | ------------------------------------------------ |
| `AGENT_POLL_INTERVAL_SECONDS` | `900`   | Seconds between analysis cycles                  |
| `NOISE_THRESHOLD_PCT`         | `0.5`   | Below this a move is never alerted on            |
| `MOMENTUM_THRESHOLD_PCT`      | `3.5`   | At or above this a move alerts on its own        |
| `ALERT_COOLDOWN_HOURS`        | `0`     | Minimum gap between alerts per ticker (0 = none)  |
| `EVENT_FRESHNESS_HOURS`       | `36`    | Maximum age of a headline that can trigger       |
| `MARKET_DATA_PROVIDER`        | `mock`  | `mock` or `finnhub`                              |

### Optional integrations

All three are off by default and the engine stays fully functional without them.

- **Live prices** — set `MARKET_DATA_PROVIDER=finnhub` and `FINNHUB_API_KEY`.
  Quotes, company news and company profiles all work on the free tier. Historical
  candles do not, so the 30-day change is approximated from the month-to-date
  return; early in a calendar month that window is short and understates the
  trend, which only makes `TREND_CONFIRMATION` more conservative.

  News arrives from whatever publishers Finnhub aggregates for a symbol — in
  practice Yahoo, Benzinga, SeekingAlpha, CNBC and ChartMill. That feed contains
  a lot of market-wide filler, so a headline only counts as an event when it
  names the company *and* describes an actual action (an upgrade, a price target
  change, a results report), and only while it is newer than
  `EVENT_FRESHNESS_HOURS`.
- **LLM verdicts** — set `LLM_API_KEY`. Any OpenAI-compatible chat completions
  endpoint works; `LLM_BASE_URL` defaults to OpenRouter.

  | Provider   | `LLM_BASE_URL`                 | Example `LLM_MODEL`               |
  | ---------- | ------------------------------ | --------------------------------- |
  | OpenRouter | `https://openrouter.ai/api/v1` | `google/gemma-4-26b-a4b-it:free`  |
  | OpenAI     | `https://api.openai.com/v1`    | `gpt-4o-mini`                     |
  | Ollama     | `http://host.docker.internal:11434/v1` | `llama3.1`                |

  The default ships free OpenRouter models, so verdicts cost nothing. Free
  endpoints rate-limit and go offline often, so `LLM_FALLBACK_MODELS` lists
  alternates and the agent tries each in turn until one answers; a model that
  rejects `response_format` is retried without it. Expect roughly 8–20 seconds
  per verdict, which is why `LLM_TIMEOUT_SECONDS` defaults to 90. Without a key,
  or if every model fails, verdicts come from a deterministic template writer,
  so alert quality degrades gracefully rather than failing.
- **Telegram** — set `TELEGRAM_BOT_TOKEN` and either `TELEGRAM_CHAT_ID` or a
  per-user `users.telegram_chat_id` row. Without them, alerts are logged and
  still shown on the dashboard.

## API

All routes are prefixed with `/api` and scoped by `userId`, which defaults to
the seeded `default-user`.

| Method   | Route                        | Purpose                              |
| -------- | ---------------------------- | ------------------------------------ |
| `GET`    | `/api/health`                | Liveness plus database reachability   |
| `GET`    | `/api/stocks`                | Tracked tickers for a user            |
| `POST`   | `/api/stocks`                | Track a ticker                        |
| `DELETE` | `/api/stocks/:ticker`        | Stop tracking a ticker                |
| `GET`    | `/api/recommendations`       | Alert feed, newest first              |
| `GET`    | `/api/recommendations/latest`| Newest alert per ticker               |
| `GET`    | `/api/recommendations/stats` | Dashboard counters                    |
| `POST`   | `/api/recommendations`       | Publish an alert (used by the agent)  |
| `GET`    | `/api/watchlist`             | Per-tenant fan-out view for the agent |

```bash
curl -s http://localhost:3000/api/health
curl -s -X POST http://localhost:3000/api/stocks \
  -H 'Content-Type: application/json' -d '{"ticker":"MSFT"}'
curl -s 'http://localhost:3000/api/recommendations?limit=5'
```

## Multi-tenancy

Every table is keyed by `user_id`, and every API route accepts a `userId`
parameter, so a second investor is just another row in `users` plus their own
`tracked_stocks`. The agent already iterates over all tenants and sends each
one's alerts to their own Telegram chat.

```sql
INSERT INTO users (user_id, telegram_chat_id) VALUES ('alice', '123456789');
INSERT INTO tracked_stocks (user_id, ticker) VALUES ('alice', 'MSFT');
```

## Local development without Docker

```bash
# database only
docker compose up postgres -d

# backend
cd backend && npm install && npm run start:dev

# frontend (proxies /api to localhost:3000)
cd frontend && npm install && npm run dev

# agent
cd agent && python3.11 -m venv .venv && .venv/bin/pip install -r requirements.txt
BACKEND_URL=http://localhost:3000 .venv/bin/python -m app.main
```

## Disclaimer

Alerts are informational only and are not investment advice. The default `mock`
provider generates synthetic prices that do not reflect any real market.
