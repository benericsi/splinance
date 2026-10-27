"""ECB rates CSV -> typed rows: one row per day and currency, `rate` units per 1 EUR."""

import io

import polars as pl

# Exact decimal, not float: 366.43 has no exact binary float, and rates feed money conversion.
RATE = pl.Decimal(18, 6)

SCHEMA = pl.Schema({"rate_date": pl.Date(), "currency": pl.String(), "rate": RATE})

# Daily (D) spot (SP00) average (A) rates of a currency against the euro.
_EXPECTED = {"FREQ": "D", "CURRENCY_DENOM": "EUR", "EXR_TYPE": "SP00", "EXR_SUFFIX": "A"}
_REQUIRED = {*_EXPECTED, "CURRENCY", "TIME_PERIOD", "OBS_VALUE"}


class InvalidRatesError(ValueError):
    def __init__(self, problems: list[str]) -> None:
        super().__init__("; ".join(problems))
        self.problems = problems


def parse_rates(content: bytes) -> pl.DataFrame:
    """Parse and validate; raises InvalidRatesError listing every problem found."""
    # Everything as text first: types are decided here, not guessed by the CSV reader.
    raw = pl.read_csv(io.BytesIO(content), infer_schema=False)

    missing = sorted(_REQUIRED - set(raw.columns))
    if missing:
        raise InvalidRatesError([f"missing columns: {', '.join(missing)}"])

    problems = [
        f"{column} must be {value}"
        for column, value in _EXPECTED.items()
        if not (raw[column] == value).all()
    ]

    rates = raw.select(
        rate_date=pl.col("TIME_PERIOD").str.to_date("%Y-%m-%d", strict=False),
        currency=pl.col("CURRENCY"),
        rate=pl.col("OBS_VALUE").cast(RATE, strict=False),
    )

    if (bad_dates := rates["rate_date"].null_count()) > 0:
        problems.append(f"{bad_dates} rows with an unreadable date")
    if (bad_rates := rates.filter(pl.col("rate").is_null() | (pl.col("rate") <= 0)).height) > 0:
        problems.append(f"{bad_rates} rows with a missing or non-positive rate")
    if not rates["currency"].str.contains(r"^[A-Z]{3}$").all():
        problems.append("currency must be a 3-letter ISO code")
    if rates.select(pl.struct("rate_date", "currency").is_duplicated().any()).item():
        problems.append("duplicate rows for the same day and currency")

    if problems:
        raise InvalidRatesError(problems)
    return rates.sort("rate_date", "currency")
