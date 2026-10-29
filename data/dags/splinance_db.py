"""The app's demo database into the lake, one run per day.

A run reads the rows that changed on its day through the `analytics` views (plus a 10-minute
overlap into the day before), stores them in raw/, then rebuilds clean/ from every raw day.
The logic lives in `splinance_data.pipelines.splinance_db` (tested without Airflow); this
file only wires it to a schedule. Unpausing it runs every day since `start_date` (catchup):
every row was last changed after the demo database existed, so that is the initial load.

The database URL comes from the connection `splinance_demo` (`AIRFLOW_CONN_SPLINANCE_DEMO`
in data/.env, the reader role; see docs/data-track.md).
"""

import os
from datetime import date, timedelta

import pendulum
from airflow.sdk import Asset, Connection, dag, get_current_context, task
from airflow.timetables.interval import CronDataIntervalTimetable

LAKE = os.environ.get("SPLINANCE_LAKE", "s3://splinance-lake-bener")
CONNECTION = "splinance_demo"

# Updated by every successful build; the dbt DAG will be scheduled on them.
DATASETS = [
    "households",
    "members",
    "users",
    "demos",
    "categories",
    "budgets",
    "transactions",
    "transaction_splits",
    "settlements",
    "import_batches",
]
CLEAN = [Asset(f"{LAKE}/clean/{name}") for name in DATASETS]


def _day() -> date:
    """The day this run covers: its data interval, never the wall clock."""
    start = get_current_context().get("data_interval_start")
    if start is None:
        raise ValueError("trigger splinance_db with a logical date: it needs the day to read")
    return start.date()


@dag(
    # A data interval per day, started once the day is over (see ecb_rates for why not
    # schedule="@daily").
    schedule=CronDataIntervalTimetable("@daily", timezone="UTC"),
    # Before the demo database existed: catchup from here reads every row once.
    start_date=pendulum.datetime(2026, 10, 1, tz="UTC"),
    catchup=True,
    # The reader role allows 3 connections; leave one for a person with psql.
    max_active_runs=2,
    default_args={
        "retries": 3,
        "retry_delay": timedelta(minutes=5),
        "retry_exponential_backoff": True,
    },
    tags=["lake", "source:splinance"],
    doc_md=__doc__,
)
def splinance_db() -> None:
    # Imports inside tasks: the dag-processor re-reads this file every few seconds.

    @task
    def ingest() -> int:
        """analytics views -> raw/: the day's window, one Parquet file per view."""
        from splinance_data.extract.splinance_db import connect
        from splinance_data.lake.store import open_lake
        from splinance_data.pipelines.splinance_db import ingest_day

        with connect(Connection.get(CONNECTION).get_uri()) as conn:
            return len(ingest_day(open_lake(LAKE), conn, _day()))

    # One build at a time: two builds would each replay the raw days present when they
    # start, and the one that writes last could undo a day the other had just added.
    @task(max_active_tis_per_dag=1, outlets=CLEAN)
    def build() -> dict[str, int]:
        """raw/ -> clean/: replay every raw day; writes only files whose content changed."""
        from splinance_data.lake.store import open_lake
        from splinance_data.pipelines.splinance_db import build as build_clean

        return build_clean(open_lake(LAKE))

    ingest() >> build()


splinance_db()
