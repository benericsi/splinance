"""The app's demo database, read through its `analytics` views (never the tables).

The role it connects as can read those views and nothing else, and every session is read-only
(docs/data-model.md, "analytics schema"). All views of one run come from one snapshot, so the
splits always match their transactions.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

import polars as pl
import psycopg
from psycopg import sql

from splinance_data.parse.splinance_db import DATASETS, Dataset, Mode

# The app takes updated_at before its transaction commits, so a row can become visible after
# a run has read past its timestamp. Each window reaches this far back into the previous one;
# rows read twice are deduplicated when clean/ is built.
OVERLAP = timedelta(minutes=10)


@dataclass(frozen=True)
class Window:
    """Rows changed in [start, end): the run's data interval, reaching back by OVERLAP."""

    start: datetime
    end: datetime

    @classmethod
    def for_day(cls, day: date) -> "Window":
        start = datetime.combine(day, time(), UTC)
        return cls(start - OVERLAP, start + timedelta(days=1))


def connect(dsn: str) -> psycopg.Connection[tuple[Any, ...]]:
    # Repeatable read: every view sees the same moment. Read-only: the role is read-only
    # anyway; this makes the intent explicit and fails fast if it ever is not.
    conn = psycopg.connect(dsn, application_name="splinance-data", connect_timeout=10)
    conn.isolation_level = psycopg.IsolationLevel.REPEATABLE_READ
    conn.read_only = True
    return conn


def extract(conn: psycopg.Connection[Any], window: Window) -> dict[str, pl.DataFrame]:
    """Every view in one transaction: snapshots whole, incremental views within the window."""
    with conn.transaction():
        return read_views(conn, window)


def read_views(conn: psycopg.Connection[Any], window: Window) -> dict[str, pl.DataFrame]:
    """The reads themselves, inside whatever transaction the caller holds."""
    return {name: _read(conn, dataset, window) for name, dataset in DATASETS.items()}


def _read(conn: psycopg.Connection[Any], dataset: Dataset, window: Window) -> pl.DataFrame:
    # Names come from DATASETS, never from input, and are quoted anyway.
    columns = sql.SQL(", ").join(sql.Identifier(c) for c in dataset.schema.names())
    query = sql.SQL("SELECT {} FROM {}").format(columns, sql.Identifier("analytics", dataset.name))
    params: Sequence[datetime] = ()
    if dataset.mode is Mode.INCREMENTAL:
        if dataset.changed is None:
            raise ValueError(f"{dataset.name}: an incremental dataset needs a changed column")
        changed = sql.Identifier(dataset.changed)
        query += sql.SQL(" WHERE {} >= %s AND {} < %s").format(changed, changed)
        params = (window.start, window.end)
    query += sql.SQL(" ORDER BY {}").format(
        sql.SQL(", ").join(sql.Identifier(c) for c in dataset.key)
    )

    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = [tuple(_plain(value) for value in row) for row in cur]
    return pl.DataFrame(rows, schema=dataset.schema, orient="row")


def _plain(value: object) -> object:
    # Ids as their canonical text; everything else (datetimes, dates, ints) Polars types itself.
    return str(value) if isinstance(value, uuid.UUID) else value
