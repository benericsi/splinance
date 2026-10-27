"""Object keys for the S3 data lake.

Every key is built here, so the layout lives in one place:

- `raw/`: files exactly as they arrived, named by their SHA-256, never changed
- `clean/`: typed Parquet, one file per dataset and month (Hive-style `month=YYYY-MM`)
- `quarantine/`: files that failed validation, kept for inspection

Keys are deterministic: the same input always gives the same key. A rerun therefore
overwrites its own output instead of adding a duplicate, and a file that was ingested
before is recognized by its key alone.
"""

import hashlib
import re
from datetime import date
from enum import StrEnum

_NAME = re.compile(r"[a-z][a-z0-9_]*")
_SHA256 = re.compile(r"[0-9a-f]{64}")
_EXTENSION = re.compile(r"[a-z0-9]+")


class Layer(StrEnum):
    LANDING = "landing"
    RAW = "raw"
    CLEAN = "clean"
    QUARANTINE = "quarantine"


def content_sha256(content: bytes) -> str:
    """Hex SHA-256 of a file's bytes: its identity in `raw/` and `quarantine/`."""
    return hashlib.sha256(content).hexdigest()


def raw_file_key(source: str, ingested_on: date, sha256: str, extension: str) -> str:
    """`raw/source=revolut/ingest_date=2026-10-27/<sha256>.csv`"""
    _check(source, sha256, extension)
    return f"{Layer.RAW}/source={source}/ingest_date={ingested_on:%Y-%m-%d}/{sha256}.{extension}"


def raw_daily_key(source: str, day: date, name: str, extension: str) -> str:
    """`raw/source=ecb/date=2026-10-23/huf.csv`: one API pull per day, replaced on rerun."""
    _check_name("source", source)
    _check_name("name", name)
    _check_extension(extension)
    return f"{Layer.RAW}/source={source}/date={day:%Y-%m-%d}/{name}.{extension}"


def raw_daily_month_prefix(source: str, month: date) -> str:
    """`raw/source=ecb/date=2026-10-`: every daily pull of one month."""
    _check_name("source", source)
    return f"{Layer.RAW}/source={source}/date={month:%Y-%m}-"


def quarantine_key(source: str, sha256: str, extension: str) -> str:
    """`quarantine/source=revolut/<sha256>.csv`; the reason is stored next to it."""
    _check(source, sha256, extension)
    return f"{Layer.QUARANTINE}/source={source}/{sha256}.{extension}"


def clean_key(dataset: str, month: date) -> str:
    """`clean/transactions/month=2026-10/part.parquet`: the whole month, rewritten on every run."""
    _check_name("dataset", dataset)
    return f"{Layer.CLEAN}/{dataset}/month={month:%Y-%m}/part.parquet"


def _check(source: str, sha256: str, extension: str) -> None:
    _check_name("source", source)
    if not _SHA256.fullmatch(sha256):
        raise ValueError(f"sha256 must be 64 lowercase hex characters, got {sha256!r}")
    _check_extension(extension)


def _check_extension(extension: str) -> None:
    if not _EXTENSION.fullmatch(extension):
        raise ValueError(f"extension must be lowercase letters or digits, got {extension!r}")


def _check_name(field: str, value: str) -> None:
    # Names end up in object keys and partition values: no slashes, dots or spaces.
    if not _NAME.fullmatch(value):
        raise ValueError(f"{field} must be lowercase snake_case, got {value!r}")
