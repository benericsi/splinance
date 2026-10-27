# Airflow plus the splinance_data package, so DAGs call the same tested functions as the CLI.
FROM apache/airflow:3.3.2-python3.13

# The exact versions Airflow 3.3.2 was tested with. Installing within them keeps our package
# from upgrading a library Airflow depends on.
ARG AIRFLOW_CONSTRAINTS=https://raw.githubusercontent.com/apache/airflow/constraints-3.3.2/constraints-3.13.txt

COPY --chown=airflow:root pyproject.toml README.md /opt/splinance-data/
COPY --chown=airflow:root src /opt/splinance-data/src

# Editable: docker-compose mounts ./src over this folder, so code changes apply without a
# rebuild. Rebuild only when dependencies change.
RUN uv pip install --no-cache --editable /opt/splinance-data --constraint "${AIRFLOW_CONSTRAINTS}"
