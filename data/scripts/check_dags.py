"""Load every DAG the way Airflow's dag-processor does, then check the rules DAGs here follow.

Runs inside the Airflow image (CI job "Airflow DAGs"; locally see docs/data-track.md), because
Airflow is not part of the local test environment. Exits 1 and lists every problem found.
"""

import sys

from airflow.dag_processing.dagbag import DagBag
from airflow.timetables.interval import CronDataIntervalTimetable

bag = DagBag(dag_folder="/opt/airflow/dags")
problems = [f"{path}: {error}" for path, error in bag.import_errors.items()]
if not bag.dags:
    problems.append("no DAGs found")

for dag_id, dag in bag.dags.items():
    for task in dag.tasks:
        if task.retries < 1:
            problems.append(f"{dag_id}.{task.task_id}: no retries")

# Daily ingest -> build DAGs. Both rules were real bugs in ecb_rates before they were checked.
for dag_id in ("ecb_rates", "splinance_db"):
    daily = bag.dags.get(dag_id)
    if daily is None:
        problems.append(f"{dag_id}: missing")
        continue
    # "@daily" is a point in time in Airflow 3: the run would read a day before it is over.
    if not isinstance(daily.timetable, CronDataIntervalTimetable):
        problems.append(f"{dag_id}: needs CronDataIntervalTimetable (a data interval per day)")
    # Parallel builds race: the one that writes last can undo a day the other just added.
    if daily.get_task("build").max_active_tis_per_dag != 1:
        problems.append(f"{dag_id}.build: must run one at a time (max_active_tis_per_dag=1)")
    if "build" not in daily.get_task("ingest").downstream_task_ids:
        problems.append(f"{dag_id}: ingest must run before build")

db = bag.dags.get("splinance_db")
if db is not None:
    from splinance_data.parse.splinance_db import DATASETS

    # Every clean dataset is an asset the dbt DAG can wait for, and no stale ones.
    outlets = {asset.uri.rsplit("/", 1)[-1] for asset in db.get_task("build").outlets}
    if outlets != set(DATASETS):
        problems.append(f"splinance_db.build: outlets {sorted(outlets)} != {sorted(DATASETS)}")
    # The reader role allows 3 connections; parallel runs beyond that fail to connect.
    if db.max_active_runs > 2:
        problems.append("splinance_db: at most 2 runs at once (the reader has 3 connections)")

for problem in problems:
    print(f"FAIL {problem}")
print(f"{len(bag.dags)} DAGs loaded, {len(problems)} problems")
sys.exit(1 if problems else 0)
