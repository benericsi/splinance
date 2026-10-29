"""Against a real demo database: the app's views and this package's contract must agree.

Skipped unless $SPLINANCE_TEST_DSN points at a demo database as the reader role, with a
seeded sandbox in it (CI job "Data track x Postgres"; locally see docs/data-track.md). The
test that changes a row also needs $SPLINANCE_TEST_ADMIN_DSN and rolls its change back.
"""

import os
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import polars as pl
import psycopg
import pytest

from splinance_data.extract.splinance_db import Window, connect, extract, read_views
from splinance_data.lake.store import LocalLake
from splinance_data.parse.splinance_db import DATASETS, check_frame
from splinance_data.pipelines.splinance_db import build, ingest_day

pytestmark = pytest.mark.postgres

READER = "splinance_analytics_reader"
# Every row: the demo database is younger than this.
EVERYTHING = Window(datetime(2000, 1, 1, tzinfo=UTC), datetime(2100, 1, 1, tzinfo=UTC))

# How each Postgres type of a view column arrives in Polars.
POLARS_TYPE = {
    "uuid": pl.String(),
    "text": pl.String(),
    "int8": pl.Int64(),
    "int4": pl.Int32(),
    "bool": pl.Boolean(),
    "date": pl.Date(),
    "timestamptz": pl.Datetime("us", "UTC"),
}
ENUMS = {
    "currency",
    "category_kind",
    "household_role",
    "transaction_visibility",
    "split_method",
    "import_source",
}


def _dsn(variable: str) -> str:
    dsn = os.environ.get(variable)
    if not dsn:
        # The CI job that has a database sets this, so a missing variable fails it instead of
        # passing with every test skipped.
        if os.environ.get("SPLINANCE_REQUIRE_POSTGRES"):
            pytest.fail(f"${variable} is not set")
        pytest.skip(f"${variable} is not set")
    return dsn


@pytest.fixture
def conn() -> Iterator[psycopg.Connection[Any]]:
    with connect(_dsn("SPLINANCE_TEST_DSN")) as connection:
        yield connection


def test_the_views_match_the_contract(conn: psycopg.Connection[Any]) -> None:
    with conn.transaction(), conn.cursor() as cur:
        cur.execute(
            "SELECT table_name, column_name, udt_name FROM information_schema.columns "
            "WHERE table_schema = 'analytics' ORDER BY table_name, ordinal_position"
        )
        found: dict[str, dict[str, pl.DataType]] = {}
        for view, column, udt in cur:
            dtype = pl.String() if udt in ENUMS else POLARS_TYPE[udt]
            found.setdefault(view, {})[column] = dtype

    expected = {name: dict(dataset.schema) for name, dataset in DATASETS.items()}
    assert found == expected


def test_the_reader_cannot_read_the_tables(conn: psycopg.Connection[Any]) -> None:
    with pytest.raises(psycopg.errors.InsufficientPrivilege), conn.transaction():
        conn.execute("SELECT count(*) FROM public.users")


def test_a_full_extract_builds_clean(conn: psycopg.Connection[Any], tmp_path: Path) -> None:
    frames = extract(conn, EVERYTHING)
    for name, frame in frames.items():
        check_frame(DATASETS[name], frame)

    transactions = frames["transactions"]
    assert transactions.height > 50, "seed the database first (demo:create)"
    assert transactions["redacted"].any(), "private transactions arrive as stubs"
    assert transactions.filter(pl.col("redacted"))["amount"].null_count() == (
        transactions["redacted"].sum()
    )

    lake = LocalLake(tmp_path)
    ingest_day(lake, conn, datetime.now(UTC).date())
    counts = build(lake)
    # Today's window holds what changed today; the whole database is the same or more.
    assert counts["transactions"] <= transactions.filter(~pl.col("redacted")).height
    assert counts["households"] == frames["households"].height


def test_a_visitor_edit_arrives_in_the_next_window_without_its_text() -> None:
    with psycopg.connect(_dsn("SPLINANCE_TEST_ADMIN_DSN")) as admin:
        try:
            row = admin.execute(
                "SELECT transaction_id FROM analytics.transactions "
                "WHERE NOT redacted AND description IS NOT NULL LIMIT 1"
            ).fetchone()
            assert row is not None, "seed the database first (demo:create)"
            # As the app does it: new text, and updated_at moves on.
            admin.execute(
                "UPDATE public.transactions SET description = 'Typed by a visitor', "
                "updated_at = clock_timestamp() WHERE id = %s",
                row,
            )
            admin.execute(f"SET LOCAL ROLE {READER}")
            now = datetime.now(UTC)
            frames = read_views(
                admin, Window(now - timedelta(minutes=5), now + timedelta(minutes=5))
            )
        finally:
            admin.rollback()

    edited = frames["transactions"].filter(pl.col("transaction_id") == str(row[0]))
    assert edited.height == 1
    assert edited["description"].to_list() == [None]
