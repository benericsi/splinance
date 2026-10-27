from collections.abc import Callable
from datetime import date
from decimal import Decimal
from pathlib import Path

import httpx
import polars as pl
import pytest

from splinance_data import cli
from splinance_data.lake.store import LocalLake
from splinance_data.parse.ecb_rates import InvalidRatesError
from splinance_data.pipelines.ecb_rates import build_month, ingest_day
from tests.helpers import fixture_bytes

OCTOBER = date(2026, 10, 1)
CLEAN = "clean/fx_rates/month=2026-10/part.parquet"
RESPONSES = {
    "2026-10-22": fixture_bytes("ecb_huf_2026-10-22.csv"),
    "2026-10-23": fixture_bytes("ecb_huf_2026-10-23.csv"),
}

ClientFactory = Callable[[dict[str, bytes]], httpx.Client]


def ingest(lake: LocalLake, client: httpx.Client, *days: int) -> list[str | None]:
    return [ingest_day(lake, client, date(2026, 10, day)) for day in days]


def test_ingest_stores_the_response_unchanged(tmp_path: Path, ecb_client: ClientFactory) -> None:
    lake = LocalLake(tmp_path)
    with ecb_client(RESPONSES) as client:
        keys = ingest(lake, client, 23, 24)

    # The 24th is a Saturday: no rate, nothing stored.
    assert keys == ["raw/source=ecb/date=2026-10-23/huf.csv", None]
    assert lake.get("raw/source=ecb/date=2026-10-23/huf.csv") == RESPONSES["2026-10-23"]


def test_build_month_writes_one_parquet_for_the_month(
    tmp_path: Path, ecb_client: ClientFactory
) -> None:
    lake = LocalLake(tmp_path)
    with ecb_client(RESPONSES) as client:
        ingest(lake, client, 22, 23, 24)

    assert build_month(lake, OCTOBER) == 2
    rates = pl.read_parquet(tmp_path / CLEAN)
    assert rates.rows() == [
        (date(2026, 10, 22), "HUF", Decimal("366.43")),
        (date(2026, 10, 23), "HUF", Decimal("366.73")),
    ]


def test_rerunning_is_idempotent(tmp_path: Path, ecb_client: ClientFactory) -> None:
    lake = LocalLake(tmp_path)
    with ecb_client(RESPONSES) as client:
        ingest(lake, client, 22, 23)
        build_month(lake, OCTOBER)
        first = lake.get(CLEAN)

        # Same day fetched again, month rebuilt again: same file, no duplicate rows.
        ingest(lake, client, 23)
        assert build_month(lake, OCTOBER) == 2
        assert lake.get(CLEAN) == first


def test_month_without_raw_days_writes_nothing(tmp_path: Path) -> None:
    lake = LocalLake(tmp_path)
    assert build_month(lake, OCTOBER) == 0
    assert lake.keys("clean/") == []


def test_invalid_raw_day_fails_the_month_and_keeps_the_old_file(tmp_path: Path) -> None:
    lake = LocalLake(tmp_path)
    lake.put("raw/source=ecb/date=2026-10-23/huf.csv", RESPONSES["2026-10-23"])
    build_month(lake, OCTOBER)
    before = lake.get(CLEAN)

    lake.put("raw/source=ecb/date=2026-10-22/huf.csv", b"not,the,ecb,format\n1,2,3,4\n")
    with pytest.raises(InvalidRatesError, match="missing columns"):
        build_month(lake, OCTOBER)
    assert lake.get(CLEAN) == before


def test_rows_filed_under_the_wrong_month_are_rejected(tmp_path: Path) -> None:
    lake = LocalLake(tmp_path)
    # An October response stored under a November day.
    lake.put("raw/source=ecb/date=2026-11-02/huf.csv", RESPONSES["2026-10-23"])
    with pytest.raises(InvalidRatesError, match="outside 2026-11"):
        build_month(lake, date(2026, 11, 1))


def test_cli_fetches_a_range_and_rebuilds_each_month(
    tmp_path: Path,
    ecb_client: ClientFactory,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(cli, "make_client", lambda: ecb_client(RESPONSES))

    assert (
        cli.main(["--lake", str(tmp_path), "ecb-rates", "2026-10-22", "--until", "2026-10-25"]) == 0
    )

    output = capsys.readouterr().out
    assert "2026-10-24  no rate" in output
    assert f"2026-10  2 rows  {CLEAN}" in output
    assert pl.read_parquet(tmp_path / CLEAN).height == 2


@pytest.mark.parametrize(
    "args",
    [
        ["ecb-rates", "2026-10-23", "--until", "2026-10-22"],
        ["ecb-rates", "2020-01-01", "--until", "2026-01-01"],
    ],
)
def test_cli_rejects_bad_ranges(args: list[str]) -> None:
    with pytest.raises(SystemExit):
        cli.main(args)
