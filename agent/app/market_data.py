"""Market data providers.

`mock` produces deterministic synthetic quotes so the whole stack runs without
any external account. `finnhub` calls a real quote API when a key is supplied.
"""

from __future__ import annotations

import logging
import random
import re
import time
from datetime import UTC, datetime, timedelta
from typing import Protocol

import httpx

from .config import Settings
from .models import Headline, Quote

logger = logging.getLogger(__name__)

# How far back to pull news, how many articles to consider, and how many
# survive ranking. Staleness is enforced separately in analysis.py.
NEWS_LOOKBACK_DAYS = 3
NEWS_SCAN_WINDOW = 40
MAX_HEADLINES = 3

# Rough, purely illustrative anchors for the synthetic provider.
_MOCK_BASE_PRICES: dict[str, float] = {
    "AAPL": 228.50,
    "TSLA": 341.20,
    "NVDA": 176.40,
    "MSFT": 442.10,
    "AMZN": 214.80,
    "GOOGL": 198.30,
    "META": 596.70,
}

_EARNINGS_TEMPLATES = (
    ("{ticker} misses quarterly earnings estimates as margins compress", "miss"),
    ("{ticker} beats revenue expectations and raises full-year guidance", "beat"),
    ("{ticker} warns on next-quarter demand despite in-line results", "miss"),
)
_ANALYST_TEMPLATES = (
    ("Major bank upgrades {ticker} to Overweight on improving fundamentals", "up"),
    ("Analyst cuts {ticker} price target citing slowing growth", "down"),
    ("{ticker} added to top-picks list after channel checks", "up"),
)
_GENERAL_TEMPLATES = (
    "{ticker} extends move as sector rotation accelerates",
    "Institutional flows pick up in {ticker} ahead of index rebalance",
    "{ticker} volume runs above its 30-day average",
)


class MarketDataProvider(Protocol):
    name: str

    async def fetch(self, ticker: str) -> Quote | None: ...


class MockMarketDataProvider:
    """Seeded random walk. Same cycle + same ticker always yields the same quote."""

    name = "mock"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def fetch(self, ticker: str) -> Quote | None:
        rng = random.Random(self._seed(ticker))

        base = _MOCK_BASE_PRICES.get(ticker) or 20 + (abs(hash(ticker)) % 58_000) / 100
        previous_close = round(base * rng.uniform(0.94, 1.06), 2)

        material_event = rng.random() < 0.22
        if material_event:
            daily_pct = rng.uniform(3.6, 9.0) * rng.choice((-1, 1))
        else:
            # Most days are ordinary churn that the noise filter will discard.
            # Sigma is deliberately small so quiet days rarely reach 3.5%.
            daily_pct = rng.gauss(0, 1.1)

        price = round(previous_close * (1 + daily_pct / 100), 2)
        price_30d_ago = round(price / (1 + rng.gauss(0, 9) / 100), 2)

        return Quote(
            ticker=ticker,
            price=max(price, 0.01),
            previous_close=max(previous_close, 0.01),
            price_30d_ago=max(price_30d_ago, 0.01),
            headlines=self._headlines(ticker, rng, material_event, daily_pct),
        )

    def _seed(self, ticker: str) -> str:
        cycle = int(time.time() // max(self._settings.poll_interval_seconds, 60))
        return f"{ticker}:{cycle}"

    def _headlines(
        self,
        ticker: str,
        rng: random.Random,
        material_event: bool,
        daily_pct: float,
    ) -> tuple[Headline, ...]:
        headlines: list[Headline] = []

        if material_event:
            bullish = daily_pct > 0
            if rng.random() < 0.5:
                pool = [t for t in _EARNINGS_TEMPLATES if (t[1] == "beat") == bullish]
                template = rng.choice(pool or list(_EARNINGS_TEMPLATES))[0]
                category = "earnings"
            else:
                pool = [t for t in _ANALYST_TEMPLATES if (t[1] == "up") == bullish]
                template = rng.choice(pool or list(_ANALYST_TEMPLATES))[0]
                category = "analyst"

            headlines.append(
                Headline(
                    title=template.format(ticker=ticker),
                    source="Simulated Newswire",
                    url=f"https://example.com/news/{ticker.lower()}",
                    category=category,
                )
            )

        headlines.append(
            Headline(
                title=rng.choice(_GENERAL_TEMPLATES).format(ticker=ticker),
                source="Simulated Market Desk",
                url=f"https://example.com/market/{ticker.lower()}",
                category="general",
            )
        )
        return tuple(headlines)


class FinnhubMarketDataProvider:
    """Live quotes from finnhub.io. The free tier covers /quote and /company-news."""

    name = "finnhub"
    BASE_URL = "https://finnhub.io/api/v1"

    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client
        self._alias_cache: dict[str, tuple[str, ...]] = {}

    async def fetch(self, ticker: str) -> Quote | None:
        try:
            response = await self._client.get(
                f"{self.BASE_URL}/quote",
                params={"symbol": ticker, "token": self._settings.finnhub_api_key},
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Finnhub quote failed for %s: %s", ticker, exc)
            return None

        price = float(payload.get("c") or 0)
        previous_close = float(payload.get("pc") or 0)
        if price <= 0 or previous_close <= 0:
            logger.warning("Finnhub returned no price for %s", ticker)
            return None

        return Quote(
            ticker=ticker,
            price=price,
            previous_close=previous_close,
            price_30d_ago=await self._fetch_30d_baseline(ticker, price),
            headlines=await self._fetch_headlines(ticker),
        )

    async def _fetch_30d_baseline(self, ticker: str, price: float) -> float:
        """Approximate the price 30 days ago.

        Historical candles are a paid endpoint, so the free-tier stand-in is the
        month-to-date return. Early in a calendar month that window is short and
        understates the trend, which only ever makes the filter more
        conservative.
        """
        try:
            response = await self._client.get(
                f"{self.BASE_URL}/stock/metric",
                params={
                    "symbol": ticker,
                    "metric": "all",
                    "token": self._settings.finnhub_api_key,
                },
            )
            response.raise_for_status()
            metric = response.json().get("metric") or {}
            month_to_date = float(metric["monthToDatePriceReturnDaily"])
        except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
            logger.warning("Finnhub 30d baseline failed for %s: %s", ticker, exc)
            return price

        if month_to_date <= -100:
            return price
        return price / (1 + month_to_date / 100)

    async def _company_aliases(self, ticker: str) -> tuple[str, ...]:
        """Names that mark a headline as being about this company.

        A company-news feed is full of stories that merely mention the sector,
        so the ticker alone is not enough to tell "Apple overhauls App Store
        fees" apart from "Home Depot earnings beat".
        """
        if ticker in self._alias_cache:
            return self._alias_cache[ticker]

        aliases = [ticker]
        try:
            response = await self._client.get(
                f"{self.BASE_URL}/stock/profile2",
                params={"symbol": ticker, "token": self._settings.finnhub_api_key},
            )
            response.raise_for_status()
            name = str(response.json().get("name", "")).strip()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Finnhub profile failed for %s: %s", ticker, exc)
            name = ""

        if name:
            aliases.append(_strip_corporate_suffix(name))

        result = tuple(alias.upper() for alias in aliases if alias)
        self._alias_cache[ticker] = result
        return result

    async def _fetch_headlines(self, ticker: str) -> tuple[Headline, ...]:
        aliases = await self._company_aliases(ticker)
        today = datetime.now(UTC).date()
        try:
            response = await self._client.get(
                f"{self.BASE_URL}/company-news",
                params={
                    "symbol": ticker,
                    "from": (today - timedelta(days=NEWS_LOOKBACK_DAYS)).isoformat(),
                    "to": today.isoformat(),
                    "token": self._settings.finnhub_api_key,
                },
            )
            response.raise_for_status()
            articles = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Finnhub news failed for %s: %s", ticker, exc)
            return ()

        if not isinstance(articles, list):
            return ()

        headlines = [
            Headline(
                title=str(article.get("headline", "")).strip(),
                source=str(article.get("source", "Finnhub")),
                url=str(article.get("url", "")),
                category=_categorize(str(article.get("headline", "")), aliases),
                published_at=_parse_published_at(article.get("datetime")),
            )
            for article in articles[:NEWS_SCAN_WINDOW]
            if article.get("headline")
        ]
        return _rank_headlines(headlines, aliases)


_CORPORATE_SUFFIXES = (
    "inc",
    "inc.",
    "corp",
    "corp.",
    "corporation",
    "co",
    "co.",
    "ltd",
    "ltd.",
    "plc",
    "sa",
    "nv",
    "ag",
    "holdings",
    "group",
    "company",
    "class a",
)


# Bare nouns like "earnings" or "analyst" match any opinion column about a
# popular stock, and mega-caps get several of those a day. Requiring an action
# phrase keeps the event triggers tied to things that actually happened.
_EARNINGS_PATTERN = re.compile(
    r"reports? q[1-4]|q[1-4] (?:results|earnings)|quarterly results"
    r"|earnings (?:beat|miss|call|report)|(?:beats?|tops) (?:estimates|expectations)"
    r"|miss(?:es)? (?:estimates|expectations)|(?:raises|cuts|lowers) guidance",
    re.IGNORECASE,
)
_ANALYST_PATTERN = re.compile(
    r"\b(?:upgrades?|downgrades?)\b"
    r"|(?:raises|cuts|lowers|maintains|reiterates|initiates)\s+\S*\s?"
    r"(?:price target|coverage|rating|buy|sell|hold|overweight|underweight|neutral)"
    r"|price target (?:raised|cut|lowered|to)",
    re.IGNORECASE,
)


def _parse_published_at(raw: object) -> datetime | None:
    """Finnhub publishes article times as unix seconds."""
    try:
        return datetime.fromtimestamp(float(raw), UTC)  # type: ignore[arg-type]
    except (TypeError, ValueError, OSError, OverflowError):
        return None


def _strip_corporate_suffix(name: str) -> str:
    """"NVIDIA Corp" -> "NVIDIA", so headlines saying just "NVIDIA" still match."""
    words = name.split()
    while words and words[-1].lower().strip(",") in _CORPORATE_SUFFIXES:
        words.pop()
    return " ".join(words) or name


def _mentions_company(headline: str, aliases: tuple[str, ...]) -> bool:
    upper = headline.upper()
    return any(alias in upper for alias in aliases)


def _rank_headlines(
    headlines: list[Headline], aliases: tuple[str, ...]
) -> tuple[Headline, ...]:
    """Keep the few headlines that actually drive a trigger.

    The newest articles are often market-wide filler ("today's most active S&P
    500 stocks"), so recency alone would bury a real earnings or analyst story
    and silence the corresponding trigger. Company events win, then stories that
    at least name the company.
    """

    def rank(headline: Headline) -> tuple[bool, bool]:
        return (
            headline.category == "general",
            not _mentions_company(headline.title, aliases),
        )

    # sorted() is stable, so recency still breaks ties inside each group.
    return tuple(sorted(headlines, key=rank)[:MAX_HEADLINES])


def _categorize(headline: str, aliases: tuple[str, ...]) -> str:
    # A company-news feed carries plenty of stories about other companies.
    # Treating "Home Depot earnings beat" as an Apple earnings event would fire
    # an alert on every ticker in the watchlist, so demand a name match first.
    if not _mentions_company(headline, aliases):
        return "general"

    if _EARNINGS_PATTERN.search(headline):
        return "earnings"
    if _ANALYST_PATTERN.search(headline):
        return "analyst"
    return "general"


def build_provider(settings: Settings, client: httpx.AsyncClient) -> MarketDataProvider:
    if settings.market_data_provider == "finnhub":
        if not settings.finnhub_api_key.strip():
            logger.warning(
                "MARKET_DATA_PROVIDER=finnhub but FINNHUB_API_KEY is empty; "
                "falling back to the mock provider"
            )
            return MockMarketDataProvider(settings)
        return FinnhubMarketDataProvider(settings, client)
    return MockMarketDataProvider(settings)
