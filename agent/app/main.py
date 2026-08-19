"""Entrypoint for the AI Stock Pulse agent worker."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import signal
import sys

import httpx

from .backend_client import BackendClient
from .config import HEARTBEAT_PATH, Settings, get_settings
from .engine import PulseEngine
from .market_data import build_provider
from .telegram import TelegramNotifier
from .verdict import VerdictWriter

logger = logging.getLogger("agent")

# How often to check whether the dashboard asked for an immediate scan.
SCAN_POLL_SECONDS = 3


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
        stream=sys.stdout,
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)


def touch_heartbeat() -> None:
    """Docker's healthcheck reads the mtime of this file."""
    try:
        HEARTBEAT_PATH.touch()
    except OSError as exc:
        logger.warning("Could not write heartbeat file: %s", exc)


def log_startup(settings: Settings) -> None:
    logger.info(
        "Agent starting | provider=%s llm=%s telegram=%s interval=%ss",
        settings.market_data_provider,
        "on" if settings.llm_enabled else "off (template verdicts)",
        "on" if settings.telegram_enabled else "off (dashboard only)",
        settings.poll_interval_seconds,
    )
    logger.info(
        "Noise filter | ignore <%.2f%% | alert >=%.2f%% | trend confirm >=%.2f%% "
        "| cooldown %.1fh",
        settings.noise_threshold_pct,
        settings.momentum_threshold_pct,
        settings.trend_confirmation_pct,
        settings.alert_cooldown_hours,
    )


async def run() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    log_startup(settings)

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        with contextlib.suppress(NotImplementedError):
            loop.add_signal_handler(sig, stop.set)

    timeout = httpx.Timeout(settings.request_timeout_seconds)
    async with httpx.AsyncClient(timeout=timeout) as client:
        backend = BackendClient(settings, client)
        touch_heartbeat()
        await backend.wait_until_ready()

        engine = PulseEngine(
            settings=settings,
            backend=backend,
            provider=build_provider(settings, client),
            verdict_writer=VerdictWriter(settings, client),
            notifier=TelegramNotifier(settings, client),
        )

        if settings.run_on_startup:
            await safe_cycle(engine)

        while not stop.is_set():
            manual = await wait_for_next_cycle(backend, stop, settings)
            if stop.is_set():
                break
            await safe_cycle(engine, force=manual)

    logger.info("Shutdown signal received; agent stopped cleanly")


async def wait_for_next_cycle(
    backend: BackendClient,
    stop: asyncio.Event,
    settings: Settings,
) -> bool:
    """Sleep until the next scheduled cycle, or until a manual scan is requested.

    Returns True when the dashboard asked for the scan. The wait is split into
    short slices so a "Scan now" click is picked up in seconds rather than at
    the end of a 15-minute interval.
    """
    loop = asyncio.get_running_loop()
    deadline = loop.time() + settings.poll_interval_seconds

    while not stop.is_set():
        remaining = deadline - loop.time()
        if remaining <= 0:
            return False

        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(
                stop.wait(), timeout=min(SCAN_POLL_SECONDS, remaining)
            )
        if stop.is_set():
            return False

        if await backend.claim_scan_request():
            logger.info("Manual scan requested from the dashboard")
            return True

        touch_heartbeat()
    return False


async def safe_cycle(engine: PulseEngine, *, force: bool = False) -> None:
    """A failing cycle must never take the worker down."""
    try:
        await engine.run_cycle(force=force)
    except Exception:
        logger.exception("Analysis cycle failed; retrying on the next tick")
    finally:
        touch_heartbeat()


def main() -> None:
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
