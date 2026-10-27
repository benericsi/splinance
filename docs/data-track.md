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
- **Python** lives only in `data/` and never imports app code; the app never imports Python. They meet at Postgres (SQL), S3 (files) and shared CSV fixtures (a contract test that Python fingerprints match the TypeScript parsers).

## 2. Status

| PR  | Scope                                                                                       | State   |
| --- | ------------------------------------------------------------------------------------------- | ------- |
| D1  | `data/` scaffold (uv, ruff, mypy, pytest), CI job, this document                            | done    |
| D2  | Terraform: state bucket, lake bucket, Airflow IAM user and policy, budgets                  | done    |
| D3  | ECB rates: extract, validate, write Parquet                                                 | planned |
| D4  | Airflow 3 in Docker Compose, `ecb_rates` DAG, backfills                                     | planned |
| D5  | Postgres extract: incremental by `updated_at`, month partitions rewritten (needs demo mode) | planned |
| D6  | Bank files: Python parsers, fingerprint contract test, raw by hash, quarantine              | planned |
| D7  | dbt: staging, intermediate, marts, tests, source freshness, data-triggered DAG              | planned |
| D8  | Portfolio README, dbt docs on GitHub Pages                                                  | planned |

Between D4 and D5 the app gets demo mode, the deploy, and the `analytics` views (separate plans).

## 3. Lake layout

Built only by `splinance_data.lake.paths`, so the layout lives in one place:

```
landing/<source>/<file>                                     uploads waiting to be processed (expire after 7 days)
raw/source=<source>/ingest_date=YYYY-MM-DD/<sha256>.<ext>   exact bytes, named by content hash
quarantine/source=<source>/<sha256>.<ext>                   failed validation, reason stored next to it
clean/<dataset>/month=YYYY-MM/part.parquet                  one file per month, rewritten whole
```

- **Content-addressed raw files.** A file's key is its SHA-256, so the same file uploaded twice lands on the same key: "already ingested?" is a key lookup.
- **The month is the unit of overwrite.** A run rewrites the whole month it touches, so reruns and backfills never append duplicates. At this data size one file per dataset would be faster; month partitions are there for idempotency and to model the pattern.

## 4. Decisions

1. **Read from the app, never write back.** An earlier draft sent files into the app through a new import API. That is mostly TypeScript work, adds long-lived tokens, and would upload bank files the app deliberately never stores. Writing back stays a stretch goal.
2. **S3 only, no Dropbox.** The API source is covered by the ECB rates; Dropbox OAuth would add secrets without teaching anything new.
3. **Airflow 3 locally, not MWAA.** Managed Airflow costs hundreds a month. The DAG code is the same either way; locally, `catchup` fills the days the laptop was off.
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

**The Airflow access key** is created by hand when Airflow first needs it (D4), never in Terraform (state would hold the secret in plain text):

```bash
aws iam create-access-key --user-name splinance-airflow
```

It goes into `data/.env` (gitignored) and nowhere else. Rotate by creating a second key, switching Airflow over, then deleting the old one.

## 7. Security and privacy

- No real bank files or personal data in the repository, test fixtures or docs: fixtures are synthetic.
- No credentials in code, logs, DAG files or Terraform state; local secrets live in gitignored `.env` files.
- The lake bucket blocks public access, requires TLS, is encrypted (SSE-S3) and versioned; the Airflow user cannot delete object versions, so `raw/` cannot lose history.
- The Postgres extract uses a read-only role with `SELECT` on `analytics` views only (no emails, no password hashes).
