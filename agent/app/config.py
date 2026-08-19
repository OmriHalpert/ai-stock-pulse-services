from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

HEARTBEAT_PATH = Path("/tmp/pulse-agent-heartbeat")  # noqa: S108


class Settings(BaseSettings):
    """Runtime configuration, entirely driven by environment variables."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    backend_url: str = "http://localhost:3000"
    default_user_id: str = "default-user"

    poll_interval_seconds: int = Field(default=900, ge=15)
    run_on_startup: bool = True

    # A move smaller than this is ordinary daily churn and never worth an alert.
    noise_threshold_pct: float = Field(default=0.5, ge=0)
    # A move at least this large is a high-conviction momentum shift on its own.
    momentum_threshold_pct: float = Field(default=3.5, gt=0)
    # A move between the two thresholds only alerts when it extends a strong
    # 30-day trend of at least this size.
    trend_confirmation_pct: float = Field(default=12.0, gt=0)
    alert_cooldown_hours: float = Field(default=6.0, ge=0)
    # How recent a headline must be to count as an event. Without this, week-old
    # analyst commentary would keep re-triggering alerts every cycle.
    event_freshness_hours: float = Field(default=36.0, gt=0)

    market_data_provider: Literal["mock", "finnhub"] = "mock"
    finnhub_api_key: str = ""

    # Any OpenAI-compatible chat completions endpoint (OpenRouter, OpenAI,
    # Groq, a local Ollama, ...). Only the base URL and model name change.
    llm_api_key: str = ""
    llm_base_url: str = "https://openrouter.ai/api/v1"
    llm_model: str = "google/gemma-4-26b-a4b-it:free"
    # Comma-separated. OpenRouter tries these in order when the primary model is
    # unavailable or rate limited, which free tiers do often.
    llm_fallback_models: str = ""
    # OpenRouter attributes requests to your app when these are set.
    llm_app_url: str = "https://github.com/ai-stock-pulse"
    llm_app_title: str = "AI Stock Pulse Engine"

    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    request_timeout_seconds: float = 20.0
    # Free models are slow but acceptable here: a verdict is written once per
    # alert, so waiting is cheaper than losing the write-up.
    llm_timeout_seconds: float = 90.0
    log_level: str = "INFO"

    @property
    def llm_enabled(self) -> bool:
        return bool(self.llm_api_key.strip())

    @property
    def llm_model_chain(self) -> list[str]:
        """Primary model first, then any configured fallbacks."""
        chain = [self.llm_model.strip()]
        chain += [
            model.strip()
            for model in self.llm_fallback_models.split(",")
            if model.strip()
        ]
        return list(dict.fromkeys(chain))

    @property
    def telegram_enabled(self) -> bool:
        return bool(self.telegram_bot_token.strip())


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
