"""ECB euro reference exchange rates, one day per request.

The ECB publishes them around 16:00 CET on TARGET business days. Weekends, TARGET holidays
and days not published yet return 200 with an empty body; an unknown series returns 404.
"""

import re
from datetime import date

import httpx

URL = "https://data-api.ecb.europa.eu/service/data/EXR/D.{currency}.EUR.SP00.A"

_CURRENCY = re.compile(r"[A-Z]{3}")


def make_client() -> httpx.Client:
    return httpx.Client(timeout=30, headers={"User-Agent": "splinance-data"})


def fetch_daily_rates(client: httpx.Client, day: date, currency: str = "HUF") -> bytes | None:
    """The CSV for one day exactly as the ECB sent it, or None when there is no rate that day."""
    if not _CURRENCY.fullmatch(currency):
        raise ValueError(f"currency must be a 3-letter ISO code, got {currency!r}")

    response = client.get(
        URL.format(currency=currency),
        params={"startPeriod": day.isoformat(), "endPeriod": day.isoformat(), "format": "csvdata"},
    )
    # 404 (wrong series) and 5xx are failures for the caller to retry or report, not a quiet day.
    response.raise_for_status()
    return response.content or None
