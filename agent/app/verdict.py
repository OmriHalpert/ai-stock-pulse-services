"""Turns a Signal into the one-sentence verdict shown on the dashboard.

An OpenAI-compatible model writes the verdict when a key is configured;
otherwise a deterministic template keeps the pipeline fully functional offline.
"""

from __future__ import annotations

import json
import logging
import re

import httpx

from .config import Settings
from .models import Sentiment, Signal, Trigger, Verdict, format_pct

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a disciplined equity analyst writing push alerts for a busy retail "
    "investor. You only ever see events that already cleared a materiality "
    "filter, so never claim the move is insignificant. Reply with strict JSON "
    'containing exactly these keys: "recommendation", "reason", "news_summary". '
    '"recommendation" is a single sentence naming a concrete action to consider. '
    '"reason" is a single sentence citing the specific numbers you were given. '
    '"news_summary" is at most two sentences of market context. '
    "Never invent prices, dates, or headlines that were not provided. "
    "Do not give personalised financial advice or promise outcomes."
)

_TRIGGER_LABEL = {
    Trigger.MOMENTUM_SHIFT: "a momentum shift beyond the daily noise band",
    Trigger.EARNINGS_EVENT: "an earnings event",
    Trigger.ANALYST_ACTION: "an analyst rating action",
    Trigger.TREND_CONFIRMATION: "continuation of a strong 30-day trend",
}


class VerdictWriter:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client

    async def write(self, signal: Signal) -> Verdict:
        sources = _collect_sources(signal)
        if self._settings.llm_enabled:
            generated = await self._ask_model(signal)
            if generated is not None:
                return Verdict(*generated, sources=sources)
        return _template_verdict(signal, sources)

    async def _ask_model(self, signal: Signal) -> tuple[str, str, str] | None:
        """Try each configured model in turn, newest failure never fatal.

        Free endpoints rate-limit and go offline routinely, so the chain is
        walked here rather than relying on any one provider's routing.
        """
        for model in self._settings.llm_model_chain:
            verdict = await self._try_model(model, signal)
            if verdict is not None:
                return verdict

        logger.warning(
            "Every model failed for %s; using the template writer", signal.ticker
        )
        return None

    async def _try_model(
        self, model: str, signal: Signal
    ) -> tuple[str, str, str] | None:
        response: httpx.Response | None = None
        for json_mode in (True, False):
            try:
                response = await self._post(model, signal, json_mode=json_mode)
            except httpx.HTTPError as exc:
                logger.warning("%s unreachable (%s)", model, exc)
                return None

            # Not every model accepts response_format. The prompt already asks
            # for JSON and the parser tolerates fences, so retry plainly.
            if response.status_code == 400 and json_mode:
                logger.info("%s rejected response_format; retrying without it", model)
                continue
            break

        try:
            if response is None:
                return None
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            payload = _parse_json_payload(content)

            recommendation = str(payload["recommendation"]).strip()
            reason = str(payload["reason"]).strip()
            news_summary = str(payload["news_summary"]).strip()
        except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError) as exc:
            logger.warning("%s returned nothing usable (%s)", model, exc)
            return None

        if not (recommendation and reason and news_summary):
            logger.warning("%s returned empty fields", model)
            return None

        logger.info("Verdict for %s written by %s", signal.ticker, model)
        return recommendation, reason, news_summary

    async def _post(
        self, model: str, signal: Signal, *, json_mode: bool
    ) -> httpx.Response:
        settings = self._settings

        payload: dict[str, object] = {
            "model": model,
            "temperature": 0.3,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": _build_user_prompt(signal)},
            ],
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        return await self._client.post(
            f"{settings.llm_base_url.rstrip('/')}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.llm_api_key}",
                "Content-Type": "application/json",
                # Ignored by providers that do not use them.
                "HTTP-Referer": settings.llm_app_url,
                "X-Title": settings.llm_app_title,
            },
            json=payload,
            timeout=settings.llm_timeout_seconds,
        )


def _parse_json_payload(content: str) -> dict[str, object]:
    """Models reached through OpenRouter vary in how strictly they honour
    `response_format`, so tolerate a markdown-fenced or prose-wrapped object."""
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match is None:
            raise
        return json.loads(match.group(0))


def _build_user_prompt(signal: Signal) -> str:
    quote = signal.quote
    headlines = "\n".join(
        f"- {headline.title} ({headline.source})" for headline in quote.headlines
    ) or "- No headlines available."

    return (
        f"Ticker: {quote.ticker}\n"
        f"Current price: ${quote.price:.2f}\n"
        f"Change today: {format_pct(quote.daily_change_pct)}\n"
        f"Change over 30 days: {format_pct(quote.change_30d_pct)}\n"
        f"Detected sentiment: {signal.sentiment.value}\n"
        f"Alert trigger: {_TRIGGER_LABEL[signal.trigger]}\n"
        f"Headlines:\n{headlines}"
    )


def _collect_sources(signal: Signal) -> tuple[str, ...]:
    urls = [
        headline.url for headline in signal.quote.headlines if headline.url.strip()
    ]
    return tuple(dict.fromkeys(urls)) or ("Price action analysis",)


def _template_verdict(signal: Signal, sources: tuple[str, ...]) -> Verdict:
    quote = signal.quote
    ticker = quote.ticker
    daily = format_pct(quote.daily_change_pct)
    trend = format_pct(quote.change_30d_pct)

    if signal.sentiment is Sentiment.BULLISH:
        recommendation = (
            f"Consider holding or scaling into {ticker} while the move holds, "
            f"and set a level where you would step back."
        )
    elif signal.sentiment is Sentiment.BEARISH:
        recommendation = (
            f"Reassess your {ticker} exposure and decide in advance how much "
            f"further downside you are willing to carry."
        )
    else:
        recommendation = (
            f"Keep {ticker} on close watch — a material event landed but the "
            f"price has not confirmed a direction yet."
        )

    reason = (
        f"{ticker} triggered {_TRIGGER_LABEL[signal.trigger]}: it is {daily} today "
        f"at ${quote.price:.2f}, against {trend} over the past 30 days."
    )

    if signal.headline is not None:
        news_summary = (
            f"{signal.headline.title} (via {signal.headline.source}). "
            f"The alert fired because this coincided with a {daily} session move."
        )
    else:
        news_summary = (
            f"No single headline explains the move; the alert is driven by price "
            f"action, with {ticker} at {daily} today and {trend} over 30 days."
        )

    return Verdict(
        recommendation=recommendation,
        reason=reason,
        news_summary=news_summary,
        sources=sources,
    )
