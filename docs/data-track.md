# Data track

A data platform next to the Splinance app: Python pipelines that extract from the app's database, a public API and bank export files, land them in an S3 data lake, and model reports with dbt. It is built as a portfolio project for data engineering, so every choice below is written down with its reason and its tradeoff.

The pipeline only **reads** from the app. Nothing it does changes the app's data or behavior.

## Contents

1. [Architecture](#1-architecture)
2. [Status](#2-status)
3. [Lake layout](#3-lake-layout)
4. [Decisions](#4-decisions)
5. [Local development](#5-local-development)
6. [Infrastructure (Terraform)](#6-infrastructure-terraform)
7. [Security and privacy](#7-security-and-privacy)
8. [Pipelines](#8-pipelines)
9. [Airflow](#9-airflow)

---

## 1. Architecture

```
 Sources                         Lake (S3, eu-central-1)                 Models (dbt on DuckDB)
 -------                         -----------------------                 ----------------------
 Splinance Postgres (demo DB) -> landing/ -> raw/ -> clean/ (Parquet) -> staging -> intermediate -> marts
 ECB rates API (HUF/EUR)      ->              \-> quarantine/
 Bank CSVs (Revolut, K&H)     ->

 Orchestration: Airflow 3 (local Docker, LocalExecutor)    Infrastructure: Terraform
```

- **Three source types**, one of each kind a pipeline usually meets: a database (Postgres, read through `analytics` views with a read-only role), an API (ECB daily exchange rates, no key), and files (bank exports).
- **Layers:** `landing/` is the drop zone; `raw/` keeps every file byte for byte and is never changed; `clean/` holds typed Parquet; dbt builds the report tables (marts) from `clean/`.
- **Synthetic bank files** come from the app's demo story (`packages/shared/src/demo`): `pnpm --filter @splinance/api demo:bank-files --out <dir> --seed <n> --today <date>` writes the monthly Revolut and K&H exports that the demo household with that seed and day was seeded from, so the bank files and the demo database reconcile. A long-lived showcase household for the pipeline is made on the demo instance with `pnpm --filter @splinance/api demo:create --seed <n> --days 3650`, next to the visitors' sandboxes that come and go. Rows the import leaves out on purpose (own transfers, cash withdrawals, payments between the two people, which the app records as settlements) are in the files too.
- **Python** lives only in `data/` and never imports app code; the app never imports Python. They meet at Postgres (SQL), S3 (files) and shared CSV fixtures (a contract test that Python fingerprints match the TypeScript parsers).

## 2. Status

| PR  | Scope                                                                                       | State   |
| --- | ------------------------------------------------------------------------------------------- | ------- |
| D1  | `data/` scaffold (uv, ruff, mypy, pytest), CI job, this document                            | done    |
| D2  | Terraform: state bucket, lake bucket, Airflow IAM user and policy, budgets                  | done    |
| D3  | ECB rates: extract, validate, write Parquet                                                 | done    |
| D4  | Airflow 3 in Docker Compose, `ecb_rates` DAG, backfills                                     | done    |
| D5  | Postgres extract: incremental by `updated_at`, month partitions rewritten (needs demo mode) | planned |
| D6  | Bank files: Python parsers, fingerprint contract test, raw by hash, quarantine              | planned |
| D7  | dbt: staging, intermediate, marts, tests, source freshness, data-triggered DAG              | planned |
| D8  | Portfolio README, dbt docs on GitHub Pages                                                  | planned |

Between D4 and D5 the app gets demo mode, the deploy, and the `analytics` views (separate plans).

## 3. Lake layout

Built only by `splinance_data.lake.paths`, so the layout lives in one place:

```
landing/<source>/<file>                                     uploads waiting to be processed (expire after 7 days)
raw/source=<source>/ingest_date=YYYY-MM-DD/<sha256>.<ext>   files: exact bytes, named by content hash
raw/source=<source>/date=YYYY-MM-DD/<name>.<ext>            API pulls: exact response, one per day, replaced on rerun
quarantine/source=<source>/<sha256>.<ext>                   failed validation, reason stored next to it
clean/<dataset>/month=YYYY-MM/part.parquet                  one file per month, rewritten whole
```

- **Content-addressed raw files.** A file's key is its SHA-256, so the same file uploaded twice lands on the same key: "already ingested?" is a key lookup.
- **The month is the unit of overwrite.** A run rewrites the whole month it touches, so reruns and backfills never append duplicates. At this data size one file per dataset would be faster; month partitions are there for idempotency and to model the pattern.

## 4. Decisions

1. **Read from the app, never write back.** An earlier draft sent files into the app through a new import API. That is mostly TypeScript work, adds long-lived tokens, and would upload bank files the app deliberately never stores. Writing back stays a stretch goal.
2. **S3 only, no Dropbox.** The API source is covered by the ECB rates; Dropbox OAuth would add secrets without teaching anything new.
3. **Airflow 3 locally, not MWAA.** Managed Airflow costs hundreds a month. The DAG code is the same either way; locally, `catchup` fills the days the laptop was off. LocalExecutor: one machine needs no task queue (Celery, Redis, workers).
4. **dbt on DuckDB.** Free, runs in CI without AWS credentials, and reads Parquet straight from S3. Athena is a later option.
5. **Polars, not Pandas.** Money is integer minor units; classic Pandas turns an integer column with a missing value into floats, Polars keeps `Int64` with nulls and refuses mixed types.
6. **Demo data only.** Production and the demo are separate instances; the lake reads only the demo database, so no real person's data reaches it.
7. **AWS access.** Humans use `aws login` (short-lived console credentials, no stored keys). The account is on the Free plan, which rules out IAM Identity Center. Airflow uses an IAM user limited to the lake bucket; its access key is created by hand, kept in a gitignored `.env`, and never appears in Terraform state.

## 5. Local development

Install [uv](https://docs.astral.sh/uv/) (Windows: `winget install --id astral-sh.uv -e`). It installs the pinned Python version itself.

```bash
cd data
uv sync              # creates data/.venv from uv.lock
uv run pytest        # tests
```

From the repository root, `pnpm check:data` runs the same steps as the CI job: `ruff format --check`, `ruff check`, `mypy` (strict) and `pytest`.

Add a dependency with `uv add <package>` (or `uv add --dev <package>`); commit `pyproject.toml` and `uv.lock` together.

Pipeline steps also run by hand with the CLI (`uv run splinance-data --help`). `--lake` takes `s3://<bucket>` or a local folder; the default is `.lake` (gitignored), so experiments need no AWS access:

```bash
uv run splinance-data ecb-rates 2026-10-01 --until 2026-10-27                                  # local .lake
uv run splinance-data --lake s3://splinance-lake-bener ecb-rates 2026-10-01 --until 2026-10-27  # after aws login
```

boto3 reads `aws login` credentials only with `botocore[crt]`, a dev dependency; Airflow uses an access key and does not need it.

## 6. Infrastructure (Terraform)

AWS account on the Free plan, region `eu-central-1` (Frankfurt). Two stacks in `infra/`, plus a module both use:

| Path                           | What                                                                                         | State                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `infra/modules/private-bucket` | A bucket with versioning, SSE-S3, public access blocked, TLS required, `prevent_destroy`     | -                                           |
| `infra/bootstrap`              | `bener-tfstate`: holds Terraform state for every stack in the account                        | local file (gitignored)                     |
| `infra/main`                   | Lake bucket `splinance-lake-bener`, IAM user `splinance-airflow` and its policy, two budgets | `s3://bener-tfstate/splinance/main.tfstate` |

- **Bootstrap first.** The state bucket cannot hold its own state, so `infra/bootstrap` keeps a local state file. It was applied once; if that file is lost, `terraform import` brings the bucket back under Terraform.
- **Locking:** `use_lockfile = true` writes a lock object next to the state while a plan or apply runs (Terraform 1.10+, no DynamoDB table).
- **Tags:** `default_tags` puts `project=splinance`, `env=dev` and `managed-by=terraform` on every resource of the main stack.
- **Budgets:** `zero-spend` (anything above one cent) was created in the console and imported; `monthly-5usd` alerts at 85% and 100% actual and 100% forecast. Both exclude credits (`include_credit = false`): with credits counted, the Free plan's credits would hide every cost and the alerts would never fire.
- **Airflow's permissions:** list, get and put in `landing/`, `raw/`, `clean/`, `quarantine/`; delete only in `landing/`; no `s3:DeleteObjectVersion`, so versioning keeps `raw/` history even if a file is overwritten. Checked with `aws iam simulate-principal-policy`.

Workflow (credentials from `aws login`, never stored keys):

```bash
cd infra/main
cp terraform.tfvars.example terraform.tfvars   # once; personal values, gitignored
terraform init
terraform plan -out=main.tfplan
terraform apply main.tfplan                    # applies exactly what was reviewed
```

CI only checks formatting and validates both stacks (`init -backend=false`, no credentials); plan and apply run locally.

**The Airflow access key** is created by hand, never in Terraform (state would hold the secret in plain text). This PowerShell line (repository root, after `aws login`) writes it straight into `data/.env` (gitignored) without printing the secret; `WriteAllLines` avoids the byte-order mark that `Set-Content` adds in Windows PowerShell, which Docker would read as part of the first variable name:

```powershell
$k = aws iam create-access-key --user-name splinance-airflow --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text; $id, $secret = $k -split '\s+'; [IO.File]::WriteAllLines("$PWD\data\.env", @("AWS_ACCESS_KEY_ID=$id", "AWS_SECRET_ACCESS_KEY=$secret", "AWS_DEFAULT_REGION=eu-central-1")); Remove-Variable k, secret
```

The key exists only there and in the Airflow scheduler container. Rotate by creating a second key, switching `.env` over, then deleting the old one (`aws iam delete-access-key`).

## 7. Security and privacy

- No real bank files or personal data in the repository, test fixtures or docs: fixtures are synthetic.
- No credentials in code, logs, DAG files or Terraform state; local secrets live in gitignored `.env` files.
- The lake bucket blocks public access, requires TLS, is encrypted (SSE-S3) and versioned; the Airflow user cannot delete object versions, so `raw/` cannot lose history.
- The Postgres extract uses a read-only role with `SELECT` on `analytics` views only (no emails, no password hashes).

## 8. Pipelines

Code layout in `data/src/splinance_data/`: `extract/` (talks to a source), `parse/` (bytes to typed, validated Polars frames), `pipelines/` (the steps a DAG task calls), `lake/` (keys and storage), `cli.py`. Every step takes a `Lake` (`LocalLake` in tests, `S3Lake` in real runs) and is a plain function, so it is tested without Airflow.

### ECB rates (`pipelines/ecb_rates.py`)

| Step          | Does                                                                                                | Output                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `ingest_day`  | One API request for one day; stores the response unchanged and unvalidated                          | `raw/source=ecb/date=YYYY-MM-DD/huf.csv`, or nothing if no rate that day |
| `build_month` | Parses and validates every raw day of the month, checks the month as a whole, writes it as one file | `clean/fx_rates/month=YYYY-MM/part.parquet`                              |

- **Source behavior (checked, not assumed):** a day without a rate (weekend, TARGET holiday, not published yet; rates appear around 16:00 CET) is `200` with an empty body; an unknown series is `404`. Empty means "no rate", any HTTP error fails the step.
- **Raw before validation.** `raw/` keeps what the ECB sent even if it is broken; validation runs in `build_month`. After a parser fix only the month is rebuilt, the API is not called again. A failed build leaves the previous clean file in place.
- **Schema:** `rate_date` (Date), `currency` (String), `rate` (Decimal(18,6), units per 1 EUR). Decimal, not float: `366.43` has no exact binary float and rates feed money conversion. The CSV is read as text and cast explicitly, so nothing is guessed.
- **Checks:** required columns; daily (`FREQ=D`) spot (`SP00`) rates against EUR; readable dates; positive rates; ISO currency codes; no duplicate day and currency, within a file and across the month; no rows outside the month.
- **Idempotent:** a rerun rewrites the same keys; rebuilding a month gives a byte-identical file (tested).
- Weekend and holiday gaps are filled later in dbt (forward fill over a date spine), not here: clean data records what was published.

## 9. Airflow

Airflow 3.3 runs locally in Docker Compose (`data/docker-compose.yml`), based on Airflow's official compose file and trimmed to the LocalExecutor.

```bash
cd data
docker compose up -d --build      # first start: migrates the metadata DB, creates user airflow/airflow
docker compose ps                 # all healthy after about a minute
docker compose down               # stop; add -v to also drop the metadata DB and logs
```

UI: http://localhost:8080 (user `airflow`, password `airflow`; the port listens on 127.0.0.1 only).

| Service                 | Role                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `postgres`              | Airflow's metadata (runs, task states); separate from the app's database, no host port |
| `airflow-init`          | Migrates the metadata database and creates the admin user, then exits                  |
| `airflow-apiserver`     | UI and REST API; tasks report their state through it                                   |
| `airflow-scheduler`     | Schedules runs and, with the LocalExecutor, runs tasks as subprocesses                 |
| `airflow-dag-processor` | Parses the files in `dags/` every few seconds                                          |

- **Image:** `data/Dockerfile` extends `apache/airflow:3.3.2-python3.13` with `splinance_data`, installed within Airflow's constraints file (the versions Airflow was tested with). That pins Polars to 1.44, so the local environment uses the same version. `src/` is mounted over the editable install: code changes apply without a rebuild; rebuild when dependencies change. `.dockerignore` allows only `pyproject.toml`, `README.md` and `src/` into the build, so `.env` can never end up in an image.
- **Credentials:** only the scheduler gets `data/.env` (the `splinance-airflow` key), since tasks run there. The UI and the dag-processor never see it.
- **DAGs are thin:** each task imports and calls a function from `splinance_data` (tested without Airflow). Imports sit inside the tasks, because the dag-processor re-reads every DAG file every few seconds.

### `ecb_rates`

`ingest` (API to `raw/`) then `build` (month to `clean/`), daily since 2024-01-01 with `catchup`, 3 retries with exponential backoff. Unpausing the DAG runs every missed day: that is the backfill. `build` updates the `fx_rates` asset, which the dbt DAG will be scheduled on.

Two decisions that were bugs first (`data/scripts/check_dags.py` now guards both):

- **`CronDataIntervalTimetable`, not `schedule="@daily"`.** In Airflow 3, `@daily` is a `CronTriggerTimetable`: each run is a point in time, so the run for 27 October starts at 27 October 00:00 with no data interval, 16 hours before that day's rate is published. `CronDataIntervalTimetable` gives each run the interval [day, day + 1) and starts it when the day is over (Airflow 2's default behavior; Airflow 3 turned it off with `create_cron_data_intervals = False`).
- **One month build at a time** (`max_active_tis_per_dag=1` on `build`). During a backfill up to 8 runs go in parallel. Two builds of the same month each read the raw days present when they start, and the one that writes last could drop a day the other had just ingested. Serialized, the last build always sees every day ingested before it; ingests still run in parallel.

### Running and testing by hand

Commands run in `data/` (in the repository root, `docker compose` finds the app's compose file instead):

```bash
docker compose exec airflow-scheduler airflow dags test ecb_rates             # safe: the previous full day
docker compose exec airflow-scheduler airflow dags list-runs ecb_rates
docker compose exec airflow-scheduler airflow backfill create --dag-id ecb_rates --from-date 2025-01-01 --to-date 2025-01-31
```

- **A manual run covers the interval that ended at its logical date.** `dags test ecb_rates 2026-10-26` fetches 25 October; to test day D, pass D + 1. The code always reads `data_interval_start`, which the log line `DagRun Finished` shows.
- **A manual run with an explicit logical date blocks the scheduled run of that date.** A DAG cannot have two runs with the same logical date: after `dags test ecb_rates 2026-10-26`, the scheduler logged `run already exists; skipping dagrun creation` every second and daily scheduling stopped. Without a date (`dags test ecb_rates`) the logical date carries the time of day and cannot collide with a midnight run. If an explicit date was used, delete that run afterwards (UI: Dag runs, the `manual` run, delete).
- **First backfill:** unpausing ran 1,029 days (2024-01-01 to 2026-10-25) in about 45 minutes, 8 runs at a time; `clean/fx_rates` then held 721 business days in 34 monthly files (45 KB, against 395 KB for the same days as raw CSV). The 16 weekdays without a rate were all TARGET holidays.

### Checking DAGs

Airflow is not in the local test environment, so DAGs are loaded inside the image, the way the dag-processor does. The `Airflow DAGs` CI job runs this on every PR; locally:

```bash
cd data
docker build -t splinance-airflow:dev .
docker run --rm -v "$PWD/dags:/opt/airflow/dags:ro" -v "$PWD/scripts:/opt/splinance-scripts:ro" --entrypoint python splinance-airflow:dev /opt/splinance-scripts/check_dags.py
```

It fails on import errors, tasks without retries, and the two `ecb_rates` regressions above.
