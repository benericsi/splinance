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

# Regressions for ecb_rates: both were real bugs before they were checked.
ecb = bag.dags.get("ecb_rates")
if ecb is None:
    problems.append("ecb_rates: missing")
else:
    # "@daily" is a point in time in Airflow 3: the run would fetch a day before it is published.
    if not isinstance(ecb.timetable, CronDataIntervalTimetable):
        problems.append("ecb_rates: needs CronDataIntervalTimetable (a data interval per day)")
    # Parallel month builds race and can drop a day.
    if ecb.get_task("build").max_active_tis_per_dag != 1:
        problems.append("ecb_rates.build: must run one at a time (max_active_tis_per_dag=1)")
    if "build" not in ecb.get_task("ingest").downstream_task_ids:
        problems.append("ecb_rates: ingest must run before build")

for problem in problems:
    print(f"FAIL {problem}")
print(f"{len(bag.dags)} DAGs loaded, {len(problems)} problems")
sys.exit(1 if problems else 0)
