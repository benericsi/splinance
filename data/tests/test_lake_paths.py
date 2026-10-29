from datetime import date

import pytest

from splinance_data.lake.paths import (
    clean_key,
    clean_month_prefix,
    clean_snapshot_key,
    content_sha256,
    quarantine_key,
    raw_daily_key,
    raw_daily_month_prefix,
    raw_daily_source_prefix,
    raw_file_key,
)

SHA = content_sha256(b"Date,Amount\n2026-10-01,-1200.00\n")


def test_content_sha256_is_stable_and_content_based() -> None:
    assert content_sha256(b"same") == content_sha256(b"same")
    assert content_sha256(b"same") != content_sha256(b"other")
    assert len(SHA) == 64


def test_raw_file_key() -> None:
    key = raw_file_key("revolut", date(2026, 10, 27), SHA, "csv")
    assert key == f"raw/source=revolut/ingest_date=2026-10-27/{SHA}.csv"


def test_raw_daily_key_and_month_prefix() -> None:
    key = raw_daily_key("ecb", date(2026, 10, 23), "huf", "csv")
    assert key == "raw/source=ecb/date=2026-10-23/huf.csv"
    assert key.startswith(raw_daily_month_prefix("ecb", date(2026, 10, 1)))
    assert not key.startswith(raw_daily_month_prefix("ecb", date(2026, 11, 1)))


def test_raw_daily_source_prefix_covers_every_day() -> None:
    key = raw_daily_key("splinance", date(2026, 10, 28), "transactions", "parquet")
    assert key == "raw/source=splinance/date=2026-10-28/transactions.parquet"
    assert key.startswith(raw_daily_source_prefix("splinance"))
    assert not key.startswith(raw_daily_source_prefix("ecb"))


def test_quarantine_key() -> None:
    assert quarantine_key("kh", SHA, "csv") == f"quarantine/source=kh/{SHA}.csv"


def test_clean_key_partitions_by_month() -> None:
    # Any day of the month maps to the same partition: a rerun overwrites it.
    assert clean_key("fx_rates", date(2026, 10, 1)) == "clean/fx_rates/month=2026-10/part.parquet"
    assert clean_key("fx_rates", date(2026, 10, 31)) == clean_key("fx_rates", date(2026, 10, 1))
    assert clean_key("fx_rates", date(2026, 10, 1)).startswith(clean_month_prefix("fx_rates"))


def test_clean_snapshot_key_has_no_partition() -> None:
    assert clean_snapshot_key("households") == "clean/households/part.parquet"
    # A snapshot never looks like a month partition of the same dataset.
    assert not clean_snapshot_key("households").startswith(clean_month_prefix("households"))


@pytest.mark.parametrize("name", ["", "Revolut", "../raw", "re volut", "kh/2", "1kh"])
def test_rejects_names_that_could_break_the_layout(name: str) -> None:
    with pytest.raises(ValueError, match="snake_case"):
        raw_file_key(name, date(2026, 10, 27), SHA, "csv")
    with pytest.raises(ValueError, match="snake_case"):
        clean_key(name, date(2026, 10, 1))


@pytest.mark.parametrize("sha", ["", "abc", SHA.upper(), SHA + "0"])
def test_rejects_malformed_hashes(sha: str) -> None:
    with pytest.raises(ValueError, match="sha256"):
        quarantine_key("revolut", sha, "csv")


@pytest.mark.parametrize("extension", ["", ".csv", "CSV", "tar.gz"])
def test_rejects_malformed_extensions(extension: str) -> None:
    with pytest.raises(ValueError, match="extension"):
        raw_file_key("revolut", date(2026, 10, 27), SHA, extension)
