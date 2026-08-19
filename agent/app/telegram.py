"""Telegram delivery for triggered alerts."""

from __future__ import annotations

import html
import logging

import httpx

from .config import Settings
from .models import Sentiment, Signal, Verdict, format_pct

logger = logging.getLogger(__name__)

_SENTIMENT_ICON = {
    Sentiment.BULLISH: "🟢",
    Sentiment.BEARISH: "🔴",
    Sentiment.NEUTRAL: "🟡",
}


class TelegramNotifier:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client

    async def send(
        self,
        chat_id: str | None,
        signal: Signal,
        verdict: Verdict,
    ) -> bool:
        """Returns True when the alert was handed to Telegram."""
        target = (chat_id or self._settings.telegram_chat_id or "").strip()

        if not self._settings.telegram_enabled or not target:
            logger.info(
                "Telegram not configured; alert for %s stays on the dashboard",
                signal.ticker,
            )
            return False

        try:
            response = await self._client.post(
                f"https://api.telegram.org/bot{self._settings.telegram_bot_token}"
                "/sendMessage",
                json={
                    "chat_id": target,
                    "text": render_message(signal, verdict),
                    "parse_mode": "HTML",
                    "disable_web_page_preview": True,
                },
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("Telegram send failed for %s: %s", signal.ticker, exc)
            return False

        logger.info("Telegram alert delivered for %s", signal.ticker)
        return True


def render_message(signal: Signal, verdict: Verdict) -> str:
    quote = signal.quote
    icon = _SENTIMENT_ICON[signal.sentiment]

    lines = [
        f"{icon} <b>{html.escape(quote.ticker)}</b> · {signal.sentiment.value}",
        (
            f"${quote.price:,.2f}  "
            f"({format_pct(quote.daily_change_pct)} today · "
            f"{format_pct(quote.change_30d_pct)} 30d)"
        ),
        "",
        f"<b>{html.escape(verdict.recommendation)}</b>",
        "",
        html.escape(verdict.reason),
    ]

    links = [source for source in verdict.sources if source.startswith("http")]
    if links:
        rendered = " · ".join(
            f'<a href="{html.escape(url, quote=True)}">source {index}</a>'
            for index, url in enumerate(links[:3], start=1)
        )
        lines += ["", rendered]

    lines += ["", "<i>Informational only, not investment advice.</i>"]
    return "\n".join(lines)
