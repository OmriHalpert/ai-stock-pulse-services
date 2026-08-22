"""The noise filter.

Retail investors do not want to hear that a stock moved 0.3%. This module
decides whether a quote represents a material event worth interrupting someone
for, and everything below that bar is discarded silently.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime, timedelta

from .config import Settings
from .models import Headline, Quote, Sentiment, Signal, Trigger

logger = logging.getLogger(__name__)

# Triggers where the article, not the price, is the event being reported.
NEWS_DRIVEN_TRIGGERS = frozenset({Trigger.EARNINGS_EVENT, Trigger.ANALYST_ACTION})

BEARISH_KEYWORDS = (
    "miss",
    "misses",
    "missed",
    "cut",
    "cuts",
    "downgrade",
    "downgrades",
    "downgraded",
    "lowers",
    "lowered",
    "bearish",
    "underperform",
    # Rating vocabulary. Matched on whole words, so "sells" and "best-selling"
    # do not count as a sell rating.
    "sell",
    "underweight",
    "probe",
    "lawsuit",
    "recall",
    "warns",
    "slump",
    "slumps",
    "plunge",
    "plunges",
    "sinks",
    "disappoints",
    "delay",
)
BULLISH_KEYWORDS = (
    "beat",
    "beats",
    "upgrade",
    "upgrades",
    "upgraded",
    "raises",
    "raised",
    "bullish",
    "outperform",
    "buy",
    "overweight",
    "record",
    "surge",
    "surges",
    "soars",
    "rallies",
    "tops",
    "wins",
    "approval",
    "expands",
)


def evaluate(quote: Quote, settings: Settings) -> Signal | None:
    """Return a Signal when the quote clears the alert bar, otherwise None."""
    daily = quote.daily_change_pct
    abs_daily = abs(daily)
    trend = quote.change_30d_pct

    earnings = _find_headline(quote, "earnings", settings)
    analyst = _find_headline(quote, "analyst", settings)

    if abs_daily >= settings.momentum_threshold_pct:
        trigger, headline = Trigger.MOMENTUM_SHIFT, earnings or analyst
    elif earnings is not None:
        # Earnings are material by definition, even before the price reacts.
        trigger, headline = Trigger.EARNINGS_EVENT, earnings
    elif analyst is not None and abs_daily >= settings.noise_threshold_pct:
        trigger, headline = Trigger.ANALYST_ACTION, analyst
    elif (
        abs_daily >= settings.noise_threshold_pct
        and abs(trend) >= settings.trend_confirmation_pct
        and (daily > 0) == (trend > 0)
    ):
        # A modest move that pushes an already-strong 30-day trend further.
        trigger, headline = Trigger.TREND_CONFIRMATION, None
    else:
        logger.debug(
            "%s filtered as noise (daily %.2f%%, 30d %.2f%%)",
            quote.ticker,
            daily,
            trend,
        )
        return None

    return Signal(
        quote=quote,
        sentiment=_resolve_sentiment(daily, trigger, headline, settings),
        trigger=trigger,
        headline=headline,
    )


def _find_headline(quote: Quote, category: str, settings: Settings) -> Headline | None:
    """Newest headline of a category, ignoring anything already stale.

    A downgrade from last week is not news today, and without this the same
    article would re-trigger an alert on every cycle.
    """
    cutoff = datetime.now(UTC) - timedelta(hours=settings.event_freshness_hours)
    return next(
        (
            headline
            for headline in quote.headlines
            if headline.category == category
            and (headline.published_at is None or headline.published_at >= cutoff)
        ),
        None,
    )


def _resolve_sentiment(
    daily: float,
    trigger: Trigger,
    headline: Headline | None,
    settings: Settings,
) -> Sentiment:
    """Direction of the alert, decided by whatever actually caused it.

    On a news trigger the article is the event, so only its wording may set a
    colour. A quiet day drifting +0.6% says nothing about a downgrade, and
    borrowing that direction is what used to paint a warning green, so an
    article we cannot read confidently stays neutral instead.

    A momentum shift or trend move is its own event, so there the price decides.
    """
    if trigger in NEWS_DRIVEN_TRIGGERS:
        return _headline_sentiment(headline) or Sentiment.NEUTRAL

    if abs(daily) >= settings.noise_threshold_pct:
        return Sentiment.BULLISH if daily > 0 else Sentiment.BEARISH
    return Sentiment.NEUTRAL


def _headline_sentiment(headline: Headline | None) -> Sentiment | None:
    """None when the wording carries no unambiguous direction.

    Matched on whole words so that "mission" is not read as a miss and
    "cutting-edge" is not read as a cut.
    """
    if headline is None:
        return None

    title = headline.title.lower()
    if _mentions(title, BEARISH_KEYWORDS):
        return Sentiment.BEARISH
    if _mentions(title, BULLISH_KEYWORDS):
        return Sentiment.BULLISH
    return None


def _mentions(title: str, keywords: tuple[str, ...]) -> bool:
    pattern = rf"\b(?:{'|'.join(re.escape(word) for word in keywords)})\b"
    return re.search(pattern, title) is not None
