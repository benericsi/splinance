"""The demo-database pipeline without a database: raw days are written by hand."""

import io
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import polars as pl
import pytest

from splinance_data import cli
from splinance_data.extract.splinance_db import OVERLAP, Window
from splinance_data.lake.paths import raw_daily_key
from splinance_data.lake.store import LocalLake
from splinance_data.parse.splinance_db import DATASETS, InvalidExtractError, check_frame
from splinance_data.pipelines import splinance_db
from splinance_data.pipelines.splinance_db import build, ingest_day

H1, H2 = "h1", "h2"
ANNA, BEN = "anna", "ben"
T0 = datetime(2026, 10, 20, 12, tzinfo=UTC)


class RecordingLake(LocalLake):
    """A local lake that remembers what was written."""

    def __init__(self, root: Path) -> None:
        super().__init__(root)
        self.written: list[str] = []

    def put(self, key: str, data: bytes) -> None:
        self.written.append(key)
        super().put(key, data)


def at(minutes: int) -> datetime:
    return T0 + timedelta(minutes=minutes)


def household(household_id: str) -> dict[str, Any]:
    return {
        "household_id": household_id,
        "name": "Doe household",
        "base_currency": "HUF",
        "created_by": ANNA,
        "archived_at": None,
        "created_at": T0,
        "updated_at": T0,
        "origin": "seeded",
    }


def transaction(
    transaction_id: str,
    updated: int,
    *,
    occurred_on: date = date(2026, 10, 5),
    amount: int = 1000,
    version: int = 1,
    redacted: bool = False,
    household_id: str = H1,
) -> dict[str, Any]:
    content = not redacted
    return {
        "transaction_id": transaction_id,
        "household_id": household_id,
        "visibility": "private" if redacted else "shared",
        "redacted": redacted,
        "origin": "seeded",
        "kind": "expense" if content else None,
        "amount": amount if content else None,
        "currency": "HUF" if content else None,
        "occurred_on": occurred_on if content else None,
        "category_id": None,
        "split_method": "equal" if content else None,
        "paid_by": ANNA if content else None,
        "created_by": ANNA if content else None,
        "import_batch_id": None,
        "description": "Tesco" if content else None,
        "counterparty": None,
        "import_fingerprint": None,
        "version": version,
        "deleted_at": None,
        "created_at": T0,
        "updated_at": at(updated),
    }


def share(transaction_id: str, user_id: str, amount: int, updated: int) -> dict[str, Any]:
    return {
        "transaction_id": transaction_id,
        "household_id": H1,
        "user_id": user_id,
        "amount": amount,
        "basis_points": None,
        "transaction_updated_at": at(updated),
        "occurred_on": date(2026, 10, 5),
    }


def frame(name: str, rows: list[dict[str, Any]] | None = None) -> pl.DataFrame:
    return pl.DataFrame(rows or [], schema=DATASETS[name].schema, orient="row")


def write_day(lake: LocalLake, day: date, **rows: list[dict[str, Any]]) -> None:
    """One raw day as ingest_day would store it; households default to H1 only."""
    rows.setdefault("households", [household(H1)])
    for name in DATASETS:
        buffer = io.BytesIO()
        frame(name, rows.get(name)).write_parquet(buffer)
        lake.put(raw_daily_key("splinance", day, name, "parquet"), buffer.getvalue())


def clean(lake: LocalLake, dataset: str, month: str) -> pl.DataFrame:
    return pl.read_parquet(lake.root / f"clean/{dataset}/month={month}/part.parquet")


def test_the_newest_version_wins_whatever_day_it_came_in(tmp_path: Path) -> None:
    lake = LocalLake(tmp_path)
    # A backfill rerun of an old day can hold a newer version than a later day.
    write_day(
        lake, date(2026, 10, 20), transactions=[transaction("t1", 30, amount=2000, version=2)]
    )
    write_day(lake, date(2026, 10, 21), transactions=[transaction("t1", 0, amount=1000)])

    assert build(lake)["transactions"] == 1
    assert clean(lake, "transactions", "2026-10")["amount"].to_list() == [2000]


def test_rows_read_twice_in_the_overlap_are_kept_once(tmp_path: Path) -> None:
    lake = LocalLake(tmp_path)
    write_day(lake, date(2026, 10, 20), transactions=[transaction("t1", 0)])
    write_day(lake, date(2026, 10, 21), transactions=[transaction("t1", 0)])

    assert build(lake)["transactions"] == 1


def test_a_row_moved_to_another_month_leaves_the_old_one(tmp_path: Path) -> None:
    lake = LocalLake(tmp_path)
    write_day(
        lake, date(2026, 10, 20), transactions=[transaction("t1", 0, occurred_on=date(2026, 9, 30))]
    )
    build(lake)
    assert clean(lake, "transactions", "2026-09").height == 1

    write_day(
        lake,
        date(2026, 10, 21),
        transactions=[transaction("t1", 60, occurred_on=date(2026, 10, 1), version=2)],
    )
    build(lake)
    assert clean(lake, "transactions", "2026-09").height == 0
    assert clean(lake, "transactions", "2026-10")["transaction_id"].to_list() == ["t1"]


def test_a_transaction_made_private_leaves_clean_with_its_shares(tmp_path: Path) -> None:
    lake = LocalLake(tmp_path)
    write_day(
        lake,
        date(2026, 10, 20),
        transactions=[transaction("t1", 0)],
        transaction_splits=[share("t1", ANNA, 500, 0), share("t1", BEN, 500, 0)],
    )
    assert build(lake)["transaction_splits"] == 2

    write_day(lake, date(2026, 10, 21), transactions=[transaction("t1", 60, redacted=True)])
    counts = build(lake)
    assert counts["transactions"] == 0
    assert counts["transaction_splits"] == 0
    assert clean(lake, "transactions", "2026-10").height == 0


def test_an_edit_replaces_the_whole_share_set(tmp_path: Path) -> None:
    lake = LocalLake(tmp_path)
    write_day(
        lake,
        date(2026, 10, 20),
        transactions=[transaction("t1", 0)],
        transaction_splits=[share("t1", ANNA, 500, 0), share("t1", BEN, 500, 0)],
    )
    # Ben is no longer in the split: his old share must not survive.
    write_day(
        lake,
        date(2026, 10, 21),
        transactions=[transaction("t1", 60, version=2)],
        transaction_splits=[share("t1", ANNA, 1000, 60)],
    )
    build(lake)
    shares = clean(lake, "transaction_splits", "2026-10")
    assert shares.select("user_id", "amount").rows() == [(ANNA, 1000)]


def test_a_deleted_sandbox_leaves_clean(tmp_path: Path) -> None:
    lake = LocalLake(tmp_path)
    write_day(
        lake,
        date(2026, 10, 20),
        households=[household(H1), household(H2)],
        transactions=[transaction("t1", 0), transaction("t2", 0, household_id=H2)],
    )
    assert build(lake)["transactions"] == 2

    # H2 expired: it is missing from the next snapshot, and its rows are never extracted again.
    write_day(lake, date(2026, 10, 21))
    assert build(lake)["transactions"] == 1
    assert clean(lake, "transactions", "2026-10")["household_id"].to_list() == [H1]


def test_small_tables_come_from_the_newest_day(tmp_path: Path) -> None:
    lake = LocalLake(tmp_path)
    write_day(lake, date(2026, 10, 20), households=[household(H1), household(H2)])
    write_day(lake, date(2026, 10, 21), households=[household(H1)])

    assert build(lake)["households"] == 1
    snapshot = pl.read_parquet(tmp_path / "clean/households/part.parquet")
    assert snapshot["household_id"].to_list() == [H1]


def test_a_build_without_new_data_writes_nothing(tmp_path: Path) -> None:
    lake = RecordingLake(tmp_path)
    write_day(lake, date(2026, 10, 20), transactions=[transaction("t1", 0)])
    build(lake)
    first = {key: lake.get(key) for key in lake.keys("clean/")}

    lake.written.clear()
    build(lake)
    assert lake.written == []
    assert {key: lake.get(key) for key in lake.keys("clean/")} == first


def test_an_unfinished_day_is_ignored(tmp_path: Path) -> None:
    lake = LocalLake(tmp_path)
    write_day(lake, date(2026, 10, 20), transactions=[transaction("t1", 0)])
    # A run that died before writing households (its last file) left only a transactions file.
    buffer = io.BytesIO()
    frame("transactions", [transaction("t9", 60)]).write_parquet(buffer)
    lake.put(
        raw_daily_key("splinance", date(2026, 10, 21), "transactions", "parquet"), buffer.getvalue()
    )

    assert build(lake)["transactions"] == 1


def test_a_raw_day_with_another_schema_fails_the_build(tmp_path: Path) -> None:
    lake = LocalLake(tmp_path)
    write_day(lake, date(2026, 10, 20))
    buffer = io.BytesIO()
    frame("transactions").drop("origin").write_parquet(buffer)
    lake.put(
        raw_daily_key("splinance", date(2026, 10, 20), "transactions", "parquet"), buffer.getvalue()
    )

    with pytest.raises(InvalidExtractError, match="transactions"):
        build(lake)


def test_an_empty_lake_builds_nothing(tmp_path: Path) -> None:
    assert build(LocalLake(tmp_path)) == {}


def test_ingest_day_writes_every_view_and_households_last(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    windows: list[Window] = []

    def fake_extract(conn: object, window: Window) -> dict[str, pl.DataFrame]:
        windows.append(window)
        return {name: frame(name) for name in DATASETS}

    monkeypatch.setattr(splinance_db, "extract", fake_extract)
    lake = RecordingLake(tmp_path)
    keys = ingest_day(lake, None, date(2026, 10, 28))  # type: ignore[arg-type]

    assert len(keys) == len(DATASETS)
    assert lake.written[-1] == "raw/source=splinance/date=2026-10-28/households.parquet"
    assert windows == [Window.for_day(date(2026, 10, 28))]


def test_ingest_day_writes_nothing_when_a_view_is_invalid(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def bad_extract(conn: object, window: Window) -> dict[str, pl.DataFrame]:
        frames = {name: frame(name) for name in DATASETS}
        frames["transactions"] = frame("transactions", [transaction("t1", 0)] * 2)
        return frames

    monkeypatch.setattr(splinance_db, "extract", bad_extract)
    lake = RecordingLake(tmp_path)
    with pytest.raises(InvalidExtractError, match="duplicate"):
        ingest_day(lake, None, date(2026, 10, 28))  # type: ignore[arg-type]
    assert lake.written == []


def test_the_window_is_the_day_plus_the_overlap() -> None:
    window = Window.for_day(date(2026, 10, 28))
    assert window.start == datetime(2026, 10, 28, tzinfo=UTC) - OVERLAP
    assert window.end == datetime(2026, 10, 29, tzinfo=UTC)
    # Consecutive windows overlap, never leave a gap.
    assert Window.for_day(date(2026, 10, 29)).start < window.end


def test_check_frame_rejects_stubs_with_content() -> None:
    leaky = transaction("t1", 0, redacted=True) | {"amount": 1000}
    with pytest.raises(InvalidExtractError, match="amount"):
        check_frame(DATASETS["transactions"], frame("transactions", [leaky]))
    check_frame(
        DATASETS["transactions"], frame("transactions", [transaction("t2", 0, redacted=True)])
    )


def test_check_frame_rejects_another_schema() -> None:
    with pytest.raises(InvalidExtractError, match="schema"):
        check_frame(DATASETS["households"], frame("households").drop("name"))


def test_the_cli_needs_a_database(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SPLINANCE_DEMO_DSN", raising=False)
    with pytest.raises(SystemExit):
        cli.main(["splinance-db", "2026-10-28"])
