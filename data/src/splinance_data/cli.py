"""Run pipeline steps by hand: `uv run splinance-data --help`."""

import argparse
import os
from collections.abc import Sequence
from datetime import date, timedelta

from splinance_data.extract.ecb_rates import make_client
from splinance_data.lake.paths import clean_key
from splinance_data.lake.store import open_lake
from splinance_data.pipelines import ecb_rates

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
    ecb.add_argument("start", type=date.fromisoformat, help="first day, YYYY-MM-DD")
    ecb.add_argument("--until", type=date.fromisoformat, help="last day, inclusive")

    args = parser.parse_args(argv)
    start: date = args.start
    until: date = args.until or start
    if until < start:
        parser.error("--until is before start")
    if (until - start).days >= MAX_DAYS:
        parser.error(f"at most {MAX_DAYS} days per run")

    lake = open_lake(args.lake)
    months: set[date] = set()
    with make_client() as client:
        day = start
        while day <= until:
            key = ecb_rates.ingest_day(lake, client, day)
            print(f"{day}  {key or 'no rate (weekend, holiday or not published yet)'}")
            months.add(day.replace(day=1))
            day += timedelta(days=1)

    for month in sorted(months):
        rows = ecb_rates.build_month(lake, month)
        target = clean_key(ecb_rates.DATASET, month) if rows else "nothing to write"
        print(f"{month:%Y-%m}  {rows} rows  {target}")
    return 0
