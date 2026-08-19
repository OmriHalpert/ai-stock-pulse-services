"""Cycle orchestration: quote -> noise filter -> verdict -> dashboard + Telegram."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from . import analysis
from .backend_client import BackendClient
from .config import Settings
from .market_data import MarketDataProvider
from .models import Signal, WatchlistEntry, format_pct
from .telegram import TelegramNotifier
from .verdict import VerdictWriter

logger = logging.getLogger(__name__)

MAX_CONCURRENT_TICKERS = 5


@dataclass
class CycleReport:
    scanned: int = 0
    filtered_as_noise: int = 0
    suppressed_by_cooldown: int = 0
    duplicates: int = 0
    alerts: int = 0
    telegram_sent: int = 0
    errors: list[str] = field(default_factory=list)

    def summary(self) -> str:
        return (
            f"scanned={self.scanned} noise={self.filtered_as_noise} "
            f"repeat={self.duplicates} cooldown={self.suppressed_by_cooldown} "
            f"alerts={self.alerts} telegram={self.telegram_sent} "
            f"errors={len(self.errors)}"
        )


class PulseEngine:
    def __init__(
        self,
        settings: Settings,
        backend: BackendClient,
        provider: MarketDataProvider,
        verdict_writer: VerdictWriter,
        notifier: TelegramNotifier,
    ) -> None:
        self._settings = settings
        self._backend = backend
        self._provider = provider
        self._verdicts = verdict_writer
        self._notifier = notifier
        self._semaphore = asyncio.Semaphore(MAX_CONCURRENT_TICKERS)
        # Last event alerted per (user, ticker). Stops one downgrade from
        # re-alerting every cycle for as long as the article stays fresh, which
        # is what makes ALERT_COOLDOWN_HOURS=0 usable.
        self._last_event: dict[tuple[str, str], str] = {}

    async def run_cycle(self, *, force: bool = False) -> CycleReport:
        """Analyse every tenant's watchlist.

        `force` is set for manual scans from the dashboard: the user explicitly
        asked for fresh results, so the per-ticker cooldown is skipped.
        """
        report = CycleReport()

        watchlist = await self._backend.fetch_watchlist()
        if not watchlist:
            logger.info("No tracked stocks found; nothing to analyse")
            return report

        for entry in watchlist:
            await self._process_user(entry, report, force=force)

        logger.info("Cycle complete%s: %s", " (manual)" if force else "", report.summary())
        return report

    async def _process_user(
        self,
        entry: WatchlistEntry,
        report: CycleReport,
        *,
        force: bool,
    ) -> None:
        last_alerts = (
            {} if force else await self._backend.fetch_last_alert_times(entry.user_id)
        )
        cutoff = datetime.now(UTC) - timedelta(hours=self._settings.alert_cooldown_hours)

        await asyncio.gather(
            *(
                self._process_ticker(entry, ticker, last_alerts.get(ticker), cutoff, report)
                for ticker in entry.tickers
            )
        )

    async def _process_ticker(
        self,
        entry: WatchlistEntry,
        ticker: str,
        last_alert_at: datetime | None,
        cutoff: datetime,
        report: CycleReport,
    ) -> None:
        async with self._semaphore:
            try:
                report.scanned += 1

                quote = await self._provider.fetch(ticker)
                if quote is None:
                    report.errors.append(f"{ticker}: no quote available")
                    return

                signal = analysis.evaluate(quote, self._settings)
                if signal is None:
                    report.filtered_as_noise += 1
                    return

                fingerprint = _fingerprint(signal)
                if self._last_event.get((entry.user_id, ticker)) == fingerprint:
                    logger.info(
                        "%s still on the same event as its last alert; not repeating",
                        ticker,
                    )
                    report.duplicates += 1
                    return

                if last_alert_at is not None and last_alert_at > cutoff:
                    logger.info(
                        "%s cleared the filter but is inside the %sh cooldown",
                        ticker,
                        self._settings.alert_cooldown_hours,
                    )
                    report.suppressed_by_cooldown += 1
                    return

                await self._emit(entry, signal, report)
                self._last_event[(entry.user_id, ticker)] = fingerprint
            except Exception as exc:  # noqa: BLE001 - one ticker must not kill the cycle
                logger.exception("Failed to process %s", ticker)
                report.errors.append(f"{ticker}: {exc}")

    async def _emit(
        self,
        entry: WatchlistEntry,
        signal: Signal,
        report: CycleReport,
    ) -> None:
        verdict = await self._verdicts.write(signal)
        alert_id = await self._backend.publish(entry.user_id, signal, verdict)
        report.alerts += 1

        logger.info(
            "ALERT #%s %s %s %s (%s) -> %s",
            alert_id,
            signal.ticker,
            signal.sentiment.value,
            format_pct(signal.quote.daily_change_pct),
            signal.trigger.value,
            verdict.recommendation,
        )

        if await self._notifier.send(entry.telegram_chat_id, signal, verdict):
            report.telegram_sent += 1


def _fingerprint(signal: Signal) -> str:
    """Identity of the event behind an alert.

    News-driven alerts are identified by the article, so the same story never
    fires twice. Pure price moves have no article, so the move is bucketed to
    whole percent: a stock sitting at -4% stays quiet, but sliding to -5% is a
    new event worth hearing about.
    """
    if signal.headline is not None:
        article = signal.headline.url or signal.headline.title
        return f"{signal.trigger.value}:{article}"
    return (
        f"{signal.trigger.value}:{signal.sentiment.value}:"
        f"{round(signal.quote.daily_change_pct)}"
    )
