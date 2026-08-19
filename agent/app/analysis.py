"""The noise filter.

Retail investors do not want to hear that a stock moved 0.3%. This module
decides whether a quote represents a material event worth interrupting someone
for, and everything below that bar is discarded silently.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from .config import Settings
from .models import Headline, Quote, Sentiment, Signal, Trigger

logger = logging.getLogger(__name__)

BEARISH_KEYWORDS = (
    "miss",
    "misses",
    "cut",
    "cuts",
    "downgrade",
    "downgrades",
    "probe",
    "lawsuit",
    "recall",
    "warns",
    "slump",
    "delay",
)
BULLISH_KEYWORDS = (
    "beat",
    "beats",
    "upgrade",
    "upgrades",
    "raises",
    "record",
    "surge",
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
        sentiment=_resolve_sentiment(daily, headline, settings),
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
    headline: Headline | None,
    settings: Settings,
) -> Sentiment:
    if abs(daily) >= settings.noise_threshold_pct:
        return Sentiment.BULLISH if daily > 0 else Sentiment.BEARISH

    # Price has not reacted yet, so lean on the wording of the event itself.
    title = headline.title.lower() if headline else ""
    if any(word in title for word in BEARISH_KEYWORDS):
        return Sentiment.BEARISH
    if any(word in title for word in BULLISH_KEYWORDS):
        return Sentiment.BULLISH
    return Sentiment.NEUTRAL
