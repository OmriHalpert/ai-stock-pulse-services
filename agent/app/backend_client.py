"""Thin async client for the NestJS API.

The backend owns the database schema; the agent reads its work queue and
publishes alerts strictly over HTTP.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from .config import Settings
from .models import Signal, Verdict, WatchlistEntry

logger = logging.getLogger(__name__)

_retry_policy = retry(
    retry=retry_if_exception_type(httpx.HTTPError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)


class BackendClient:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client
        self._base = settings.backend_url.rstrip("/")

    async def wait_until_ready(self, attempts: int = 30, delay: float = 2.0) -> None:
        for attempt in range(1, attempts + 1):
            try:
                response = await self._client.get(f"{self._base}/api/health")
                if response.status_code == 200:
                    logger.info("Backend is ready at %s", self._base)
                    return
            except httpx.HTTPError as exc:
                logger.debug("Backend not ready (%s/%s): %s", attempt, attempts, exc)
            await asyncio.sleep(delay)
        raise RuntimeError(f"Backend at {self._base} never became ready")

    @_retry_policy
    async def fetch_watchlist(self) -> list[WatchlistEntry]:
        response = await self._client.get(f"{self._base}/api/watchlist")
        response.raise_for_status()

        return [
            WatchlistEntry(
                user_id=str(item["userId"]),
                telegram_chat_id=item.get("telegramChatId"),
                tickers=tuple(str(ticker) for ticker in item.get("tickers", [])),
            )
            for item in response.json()
        ]

    @_retry_policy
    async def fetch_last_alert_times(self, user_id: str) -> dict[str, datetime]:
        """Newest alert timestamp per ticker, used to enforce the cooldown."""
        response = await self._client.get(
            f"{self._base}/api/recommendations/latest",
            params={"userId": user_id},
        )
        response.raise_for_status()

        timestamps: dict[str, datetime] = {}
        for item in response.json():
            parsed = _parse_timestamp(item.get("timestamp"))
            if parsed is not None:
                timestamps[str(item["ticker"])] = parsed
        return timestamps

    async def claim_scan_request(self) -> bool:
        """True when the dashboard asked for an immediate scan.

        Polled frequently, so a transient failure is logged at debug level and
        retried on the next tick rather than raising.
        """
        try:
            response = await self._client.post(f"{self._base}/api/scan/claim")
            response.raise_for_status()
            return bool(response.json().get("pending"))
        except (httpx.HTTPError, ValueError) as exc:
            logger.debug("Scan request poll failed: %s", exc)
            return False

    @_retry_policy
    async def publish(self, user_id: str, signal: Signal, verdict: Verdict) -> int:
        quote = signal.quote
        response = await self._client.post(
            f"{self._base}/api/recommendations",
            json={
                "userId": user_id,
                "ticker": quote.ticker,
                "sentiment": signal.sentiment.value,
                "recommendation": verdict.recommendation,
                "reason": verdict.reason,
                "newsSummary": verdict.news_summary,
                "priceChange30d": f"{quote.change_30d_pct:+.2f}%",
                "currentPrice": round(quote.price, 2),
                "sources": list(verdict.sources),
            },
        )
        response.raise_for_status()
        return int(response.json()["id"])


def _parse_timestamp(raw: object) -> datetime | None:
    if not isinstance(raw, str):
        return None
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    # Timestamps are stored without a zone; both containers run in UTC.
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
