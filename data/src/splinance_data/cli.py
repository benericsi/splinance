"""Run pipeline steps by hand: `uv run splinance-data --help`."""

import argparse
import os
from collections.abc import Iterator, Sequence
from datetime import date, timedelta

from splinance_data.extract.ecb_rates import make_client
from splinance_data.extract.splinance_db import connect
from splinance_data.lake.paths import clean_key
from splinance_data.lake.store import Lake, open_lake
from splinance_data.pipelines import ecb_rates, splinance_db

# Keeps a typo in a date from turning into thousands of API calls.
MAX_DAYS = 3 * 366


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="splinance-data")
    parser.add_argument(
        "--lake",
        default=os.environ.get("SPLINANCE_LAKE", ".lake"),
        help="s3://<bucket> or a local folder (default: $SPLINANCE_LAKE, else .lake)",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    ecb = commands.add_parser(
        "ecb-rates", help="fetch ECB HUF/EUR rates for a day or range, then rebuild their months"
    )
    _add_days(ecb)

    db = commands.add_parser(
        "splinance-db",
        help="extract the demo database's analytics views for a day or range, then rebuild clean/",
    )
    _add_days(db)
    db.add_argument(
        "--dsn",
        default=os.environ.get("SPLINANCE_DEMO_DSN"),
        help="postgresql:// URL of the demo database as the reader (default: $SPLINANCE_DEMO_DSN)",
    )

    args = parser.parse_args(argv)
    start: date = args.start
    until: date = args.until or start
    if until < start:
        parser.error("--until is before start")
    if (until - start).days >= MAX_DAYS:
        parser.error(f"at most {MAX_DAYS} days per run")

    lake = open_lake(args.lake)
    if args.command == "ecb-rates":
        return _ecb_rates(lake, start, until)
    if not args.dsn:
        parser.error("splinance-db needs --dsn or $SPLINANCE_DEMO_DSN")
    return _splinance_db(lake, args.dsn, start, until)


def _add_days(command: argparse.ArgumentParser) -> None:
    command.add_argument("start", type=date.fromisoformat, help="first day, YYYY-MM-DD")
    command.add_argument("--until", type=date.fromisoformat, help="last day, inclusive")


def _days(start: date, until: date) -> Iterator[date]:
    day = start
    while day <= until:
        yield day
        day += timedelta(days=1)


def _ecb_rates(lake: Lake, start: date, until: date) -> int:
    months: set[date] = set()
    with make_client() as client:
        for day in _days(start, until):
            key = ecb_rates.ingest_day(lake, client, day)
            print(f"{day}  {key or 'no rate (weekend, holiday or not published yet)'}")
            months.add(day.replace(day=1))

    for month in sorted(months):
        rows = ecb_rates.build_month(lake, month)
        target = clean_key(ecb_rates.DATASET, month) if rows else "nothing to write"
        print(f"{month:%Y-%m}  {rows} rows  {target}")
    return 0


def _splinance_db(lake: Lake, dsn: str, start: date, until: date) -> int:
    with connect(dsn) as conn:
        for day in _days(start, until):
            keys = splinance_db.ingest_day(lake, conn, day)
            print(f"{day}  {len(keys)} views  raw/source={splinance_db.SOURCE}/date={day}/")

    for dataset, rows in splinance_db.build(lake).items():
        print(f"{dataset:<20} {rows:>7} rows in clean/")
    return 0
