from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum


class Sentiment(StrEnum):
    BULLISH = "BULLISH"
    BEARISH = "BEARISH"
    NEUTRAL = "NEUTRAL"


class Trigger(StrEnum):
    """Why an alert cleared the noise filter."""

    MOMENTUM_SHIFT = "MOMENTUM_SHIFT"
    EARNINGS_EVENT = "EARNINGS_EVENT"
    ANALYST_ACTION = "ANALYST_ACTION"
    TREND_CONFIRMATION = "TREND_CONFIRMATION"


@dataclass(frozen=True, slots=True)
class Headline:
    title: str
    source: str
    url: str
    category: str = "general"
    # None means undated, which is treated as fresh.
    published_at: datetime | None = None


@dataclass(frozen=True, slots=True)
class Quote:
    ticker: str
    price: float
    previous_close: float
    price_30d_ago: float
    headlines: tuple[Headline, ...] = field(default=())

    @property
    def daily_change_pct(self) -> float:
        if self.previous_close <= 0:
            return 0.0
        return (self.price - self.previous_close) / self.previous_close * 100

    @property
    def change_30d_pct(self) -> float:
        if self.price_30d_ago <= 0:
            return 0.0
        return (self.price - self.price_30d_ago) / self.price_30d_ago * 100


@dataclass(frozen=True, slots=True)
class Signal:
    """A quote that survived the noise filter and deserves an alert."""

    quote: Quote
    sentiment: Sentiment
    trigger: Trigger
    headline: Headline | None = None

    @property
    def ticker(self) -> str:
        return self.quote.ticker


@dataclass(frozen=True, slots=True)
class Verdict:
    recommendation: str
    reason: str
    news_summary: str
    sources: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class WatchlistEntry:
    user_id: str
    telegram_chat_id: str | None
    tickers: tuple[str, ...]


def format_pct(value: float) -> str:
    return f"{value:+.2f}%"
