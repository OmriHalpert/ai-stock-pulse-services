"""Container healthcheck: the worker is healthy while its heartbeat is fresh."""

from __future__ import annotations

import sys
import time

from .config import HEARTBEAT_PATH, get_settings


def main() -> int:
    if not HEARTBEAT_PATH.exists():
        print("no heartbeat file yet", file=sys.stderr)
        return 1

    settings = get_settings()
    # One fully missed cycle is tolerated before the container is marked down.
    max_age = settings.poll_interval_seconds * 2 + 60
    age = time.time() - HEARTBEAT_PATH.stat().st_mtime

    if age > max_age:
        print(f"heartbeat is {age:.0f}s old (max {max_age}s)", file=sys.stderr)
        return 1

    print(f"ok (heartbeat {age:.0f}s old)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
