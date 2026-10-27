"""ECB rates: one day from the API into raw/, one month from raw/ into clean/.

Two steps on purpose: raw/ keeps exactly what the ECB sent, so after a parser fix only the
month is rebuilt; the API is not called again.
"""

import io
from datetime import date

import httpx
import polars as pl

from splinance_data.extract.ecb_rates import fetch_daily_rates
from splinance_data.lake.paths import clean_key, raw_daily_key, raw_daily_month_prefix
from splinance_data.lake.store import Lake
from splinance_data.parse.ecb_rates import SCHEMA, InvalidRatesError, parse_rates

SOURCE = "ecb"
DATASET = "fx_rates"


def ingest_day(lake: Lake, client: httpx.Client, day: date, currency: str = "HUF") -> str | None:
    """Store the day's response in raw/ unchanged; returns its key, or None if no rate that day."""
    content = fetch_daily_rates(client, day, currency)
    if content is None:
        return None
    key = raw_daily_key(SOURCE, day, currency.lower(), "csv")
    lake.put(key, content)
    return key


def build_month(lake: Lake, month: date) -> int:
    """Rebuild the month's clean Parquet from every raw day of it; returns the row count.

    The whole month is rewritten, so running it twice gives the same file, never duplicates.
    A month without any raw day yet writes nothing.
    """
    keys = lake.keys(raw_daily_month_prefix(SOURCE, month))
    if not keys:
        return 0

    rates = pl.concat([parse_rates(lake.get(key)) for key in keys]).sort("rate_date", "currency")
    _check_month(rates, month)

    buffer = io.BytesIO()
    rates.write_parquet(buffer, compression="zstd", statistics=True)
    lake.put(clean_key(DATASET, month), buffer.getvalue())
    return rates.height


def _check_month(rates: pl.DataFrame, month: date) -> None:
    # parse_rates checks each file; these checks span the files of the month.
    problems = []
    if rates.schema != SCHEMA:
        problems.append(f"unexpected schema {rates.schema}")
    outside = rates.filter(
        (pl.col("rate_date").dt.year() != month.year)
        | (pl.col("rate_date").dt.month() != month.month)
    )
    if outside.height:
        problems.append(f"{outside.height} rows outside {month:%Y-%m}")
    if rates.select(pl.struct("rate_date", "currency").is_duplicated().any()).item():
        problems.append("the same day and currency in more than one file")
    if problems:
        raise InvalidRatesError(problems)
