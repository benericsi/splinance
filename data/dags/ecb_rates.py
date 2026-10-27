"""ECB HUF/EUR reference rates into the lake, one run per day.

A run covers one day and starts once that day is over, so the ECB's 16:00 CET publication is
always in. The logic lives in `splinance_data.pipelines.ecb_rates` (tested without Airflow);
this file only wires it to a schedule. Unpausing it runs every day since `start_date`
(catchup), which is the backfill.
"""

import os
from datetime import date, timedelta

import pendulum
from airflow.sdk import Asset, dag, get_current_context, task
from airflow.timetables.interval import CronDataIntervalTimetable

LAKE = os.environ.get("SPLINANCE_LAKE", "s3://splinance-lake-bener")

# Updated by every successful build; the dbt DAG will be scheduled on it.
FX_RATES = Asset(f"{LAKE}/clean/fx_rates")


def _day() -> date:
    """The day this run covers: its data interval, never the wall clock (that is what makes
    backfills work)."""
    start = get_current_context().get("data_interval_start")
    if start is None:
        raise ValueError("trigger ecb_rates with a logical date: it needs the day to fetch")
    return start.date()


@dag(
    # Not schedule="@daily": in Airflow 3 that is a CronTriggerTimetable, a point in time
    # whose run for 27 Oct starts at 27 Oct 00:00, before that day's rate exists. This one
    # gives each run a data interval [day, day + 1) and starts it when the day is over.
    schedule=CronDataIntervalTimetable("@daily", timezone="UTC"),
    start_date=pendulum.datetime(2024, 1, 1, tz="UTC"),
    catchup=True,
    # Backfills fetch a few days at once; the ECB API is public, so stay polite.
    max_active_runs=8,
    default_args={
        "retries": 3,
        "retry_delay": timedelta(minutes=5),
        "retry_exponential_backoff": True,
    },
    tags=["lake", "source:ecb"],
    doc_md=__doc__,
)
def ecb_rates() -> None:
    # Imports inside tasks: the dag-processor re-reads this file every few seconds, and Polars
    # and boto3 would slow down every parse.

    @task
    def ingest() -> str | None:
        """API -> raw/: the day's response unchanged, or nothing on weekends and holidays."""
        from splinance_data.extract.ecb_rates import make_client
        from splinance_data.lake.store import open_lake
        from splinance_data.pipelines.ecb_rates import ingest_day

        with make_client() as client:
            return ingest_day(open_lake(LAKE), client, _day())

    # One month build at a time across all runs. Parallel backfill runs of the same month
    # would otherwise race: each reads the raw days present when it starts, and the one that
    # writes last could drop a day the other had just ingested. Serialized, the last build
    # always sees every day ingested before it.
    @task(max_active_tis_per_dag=1, outlets=[FX_RATES])
    def build() -> int:
        """raw/ -> clean/: rebuild the whole month (idempotent, so also self-healing)."""
        from splinance_data.lake.store import open_lake
        from splinance_data.pipelines.ecb_rates import build_month

        return build_month(open_lake(LAKE), _day().replace(day=1))

    ingest() >> build()


ecb_rates()
