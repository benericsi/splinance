"""The app's demo database: one day's extract into raw/, then clean/ rebuilt from every day.

`ingest_day` stores what the views returned for the day's window, unchanged. `build` replays
all raw days: the newest version of each row wins, whatever order the days arrived in, so a
row that moved to another month, became a stub (made private) or belongs to a deleted
sandbox simply ends up where it is now. Reading every raw day costs O(history); at demo scale
that is a few hundred small files (docs/data-track.md, "Postgres").
"""

import io
from datetime import date
from typing import Any

import polars as pl
import psycopg

from splinance_data.extract.splinance_db import Window, extract
from splinance_data.lake.paths import (
    clean_key,
    clean_month_prefix,
    clean_snapshot_key,
    raw_daily_key,
    raw_daily_source_prefix,
)
from splinance_data.lake.store import Lake
from splinance_data.parse.splinance_db import (
    DATASETS,
    Dataset,
    InvalidExtractError,
    Mode,
    check_frame,
)

SOURCE = "splinance"
# Written last by ingest_day: a day with this file holds every view.
COMPLETE = "households"


def ingest_day(lake: Lake, conn: psycopg.Connection[Any], day: date) -> list[str]:
    """Store the day's extract of every view in raw/; returns the keys written.

    Every view is checked before anything is written, so a bad extract leaves raw/ as it was.
    A rerun of the same day overwrites its own keys.
    """
    frames = extract(conn, Window.for_day(day))
    for name, frame in frames.items():
        check_frame(DATASETS[name], frame)

    keys = []
    # households last: its file marks the day as complete (see _raw_days), so a run that
    # fails halfway never leaves a day that build would read.
    for name in sorted(frames, key=lambda n: n == COMPLETE):
        frame = frames[name]
        key = raw_daily_key(SOURCE, day, name, "parquet")
        lake.put(key, _parquet(frame))
        keys.append(key)
    return keys


def build(lake: Lake) -> dict[str, int]:
    """Rebuild clean/ from every raw day; returns the rows now in clean/ per dataset.

    Only files whose bytes change are written, so a build without new data writes nothing.
    """
    days = _raw_days(lake)
    if not days:
        return {}
    newest_day = days[-1]

    counts: dict[str, int] = {}
    for dataset in DATASETS.values():
        if dataset.mode is Mode.SNAPSHOT:
            frame = _read_raw(lake, dataset, newest_day)
            _put_if_changed(
                lake, clean_snapshot_key(dataset.name), _parquet(_sorted(dataset, frame))
            )
            counts[dataset.name] = frame.height

    # Sandboxes deleted since are missing from the newest snapshot: their rows leave clean/.
    live = _read_raw(lake, DATASETS[COMPLETE], newest_day)["household_id"]

    transactions = _newest(lake, DATASETS["transactions"], days)
    splits = _current_splits(_newest(lake, DATASETS["transaction_splits"], days), transactions)
    facts = {
        "transactions": transactions.filter(~pl.col("redacted")),
        "transaction_splits": splits,
        "settlements": _newest(lake, DATASETS["settlements"], days),
        "import_batches": _newest(lake, DATASETS["import_batches"], days),
    }
    for name, frame in facts.items():
        frame = frame.filter(pl.col("household_id").is_in(live.implode()))
        _write_months(lake, DATASETS[name], frame)
        counts[name] = frame.height
    return counts


def _raw_days(lake: Lake) -> list[str]:
    """The `date=` folders that hold a complete extract, oldest first."""
    prefix = raw_daily_source_prefix(SOURCE)
    marker = f"/{COMPLETE}.parquet"
    return sorted(
        key.removeprefix(prefix).removesuffix(marker)
        for key in lake.keys(prefix)
        if key.endswith(marker)
    )


def _read_raw(lake: Lake, dataset: Dataset, day: str) -> pl.DataFrame:
    key = raw_daily_key(SOURCE, date.fromisoformat(day), dataset.name, "parquet")
    frame = pl.read_parquet(io.BytesIO(lake.get(key)))
    if frame.schema != dataset.schema:
        # The views changed shape between days: rebuilding would mix two contracts.
        raise InvalidExtractError(dataset.name, [f"{key} has schema {frame.schema}"])
    return frame


def _newest(lake: Lake, dataset: Dataset, days: list[str]) -> pl.DataFrame:
    """Every raw day of the dataset, one row per key: its newest version."""
    frame = pl.concat([_read_raw(lake, dataset, day) for day in days])
    return frame.sort(dataset.newest, descending=True).unique(
        subset=list(dataset.key), keep="first", maintain_order=True
    )


def _current_splits(splits: pl.DataFrame, transactions: pl.DataFrame) -> pl.DataFrame:
    """The share set that belongs to each transaction's newest version.

    An edit replaces all shares, so the set travels with the transaction's updated_at: older
    sets (and the shares of someone dropped from the split) are left behind. A transaction
    whose newest version is a stub keeps no shares.
    """
    current = transactions.filter(~pl.col("redacted")).select(
        "transaction_id", transaction_updated_at="updated_at"
    )
    return splits.join(current, on=["transaction_id", "transaction_updated_at"], how="semi")


def _write_months(lake: Lake, dataset: Dataset, frame: pl.DataFrame) -> None:
    if dataset.month is None:
        raise ValueError(f"{dataset.name} has no month column")
    month = pl.col(dataset.month)
    if frame.schema[dataset.month] != pl.Date():
        month = month.dt.date()
    months = frame.with_columns(_month=month.dt.truncate("1mo"))

    written = set()
    for (first_day,), part in months.partition_by("_month", as_dict=True).items():
        key = clean_key(dataset.name, first_day)
        _put_if_changed(lake, key, _parquet(_sorted(dataset, part.drop("_month"))))
        written.add(key)
    # A month whose rows all left (a sandbox deleted, a row moved) becomes an empty file:
    # the lake user may not delete in clean/, and an empty month is the truthful answer.
    for key in set(lake.keys(clean_month_prefix(dataset.name))) - written:
        _put_if_changed(lake, key, _parquet(frame.clear()))


def _sorted(dataset: Dataset, frame: pl.DataFrame) -> pl.DataFrame:
    # Same rows, same order, same bytes: what makes "only write what changed" work.
    return frame.sort(dataset.key)


def _put_if_changed(lake: Lake, key: str, data: bytes) -> None:
    if key in lake.keys(key) and lake.get(key) == data:
        return
    lake.put(key, data)


def _parquet(frame: pl.DataFrame) -> bytes:
    buffer = io.BytesIO()
    frame.write_parquet(buffer, compression="zstd", statistics=True)
    return buffer.getvalue()
