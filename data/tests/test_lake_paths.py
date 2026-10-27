from datetime import date

import pytest

from splinance_data.lake.paths import (
    clean_key,
    content_sha256,
    quarantine_key,
    raw_daily_key,
    raw_daily_month_prefix,
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


def test_quarantine_key() -> None:
    assert quarantine_key("kh", SHA, "csv") == f"quarantine/source=kh/{SHA}.csv"


def test_clean_key_partitions_by_month() -> None:
    # Any day of the month maps to the same partition: a rerun overwrites it.
    assert clean_key("fx_rates", date(2026, 10, 1)) == "clean/fx_rates/month=2026-10/part.parquet"
    assert clean_key("fx_rates", date(2026, 10, 31)) == clean_key("fx_rates", date(2026, 10, 1))


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
