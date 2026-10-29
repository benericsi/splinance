"""The app's `analytics` views as typed frames: the contract D5 reads, one entry per view.

The columns and types mirror the views (docs/data-model.md, "analytics schema"); the app pins
the same list in `apps/api/src/db/analytics.test.ts`, and the integration tests check this one
against a real database. A view that changes fails the extract instead of silently changing
a column in the lake.
"""

from dataclasses import dataclass
from enum import StrEnum

import polars as pl

UUID = pl.String()
TEXT = pl.String()
# Postgres enums arrive as their labels.
ENUM = pl.String()
MONEY = pl.Int64()
INT = pl.Int32()
BOOL = pl.Boolean()
DATE = pl.Date()
TIMESTAMP = pl.Datetime("us", "UTC")


class Mode(StrEnum):
    # The whole view every run (small tables; also how deleted sandboxes show: ids go missing).
    SNAPSHOT = "snapshot"
    # Rows whose `changed` column falls in the run's window.
    INCREMENTAL = "incremental"


@dataclass(frozen=True)
class Dataset:
    name: str
    schema: pl.Schema
    mode: Mode
    key: tuple[str, ...]
    # INCREMENTAL only: the column the window filters on, and what decides the newest version.
    changed: str | None = None
    newest: tuple[str, ...] = ()
    # The column whose month partitions clean/ (None: one file, the current state).
    month: str | None = None


DATASETS: dict[str, Dataset] = {
    d.name: d
    for d in [
        Dataset(
            "households",
            pl.Schema(
                {
                    "household_id": UUID,
                    "name": TEXT,
                    "base_currency": ENUM,
                    "created_by": UUID,
                    "archived_at": TIMESTAMP,
                    "created_at": TIMESTAMP,
                    "updated_at": TIMESTAMP,
                    "origin": TEXT,
                }
            ),
            Mode.SNAPSHOT,
            key=("household_id",),
        ),
        Dataset(
            "members",
            pl.Schema(
                {
                    "household_id": UUID,
                    "user_id": UUID,
                    "role": ENUM,
                    "joined_at": TIMESTAMP,
                    "left_at": TIMESTAMP,
                }
            ),
            Mode.SNAPSHOT,
            key=("household_id", "user_id"),
        ),
        Dataset(
            "users",
            pl.Schema({"user_id": UUID, "display_name": TEXT, "created_at": TIMESTAMP}),
            Mode.SNAPSHOT,
            key=("user_id",),
        ),
        Dataset(
            "demos",
            pl.Schema(
                {
                    "demo_id": UUID,
                    "household_id": UUID,
                    "visitor_id": UUID,
                    "partner_id": UUID,
                    "seed": INT,
                    "anchor_on": DATE,
                    "created_at": TIMESTAMP,
                    "seeded_at": TIMESTAMP,
                    "expires_at": TIMESTAMP,
                }
            ),
            Mode.SNAPSHOT,
            key=("demo_id",),
        ),
        Dataset(
            "categories",
            pl.Schema(
                {
                    "category_id": UUID,
                    "household_id": UUID,
                    "name": TEXT,
                    "kind": ENUM,
                    "icon": TEXT,
                    "color": TEXT,
                    "archived_at": TIMESTAMP,
                    "created_at": TIMESTAMP,
                    "updated_at": TIMESTAMP,
                    "origin": TEXT,
                }
            ),
            Mode.SNAPSHOT,
            key=("category_id",),
        ),
        Dataset(
            "budgets",
            pl.Schema(
                {
                    "budget_id": UUID,
                    "household_id": UUID,
                    "category_id": UUID,
                    "user_id": UUID,
                    "starts_on": DATE,
                    "amount": MONEY,
                    "created_by": UUID,
                    "created_at": TIMESTAMP,
                    "updated_at": TIMESTAMP,
                    "origin": TEXT,
                }
            ),
            Mode.SNAPSHOT,
            key=("budget_id",),
        ),
        Dataset(
            "transactions",
            pl.Schema(
                {
                    "transaction_id": UUID,
                    "household_id": UUID,
                    "visibility": ENUM,
                    "redacted": BOOL,
                    "origin": TEXT,
                    "kind": ENUM,
                    "amount": MONEY,
                    "currency": ENUM,
                    "occurred_on": DATE,
                    "category_id": UUID,
                    "split_method": ENUM,
                    "paid_by": UUID,
                    "created_by": UUID,
                    "import_batch_id": UUID,
                    "description": TEXT,
                    "counterparty": TEXT,
                    "import_fingerprint": TEXT,
                    "version": INT,
                    "deleted_at": TIMESTAMP,
                    "created_at": TIMESTAMP,
                    "updated_at": TIMESTAMP,
                }
            ),
            Mode.INCREMENTAL,
            key=("transaction_id",),
            changed="updated_at",
            newest=("updated_at", "version"),
            month="occurred_on",
        ),
        Dataset(
            "transaction_splits",
            pl.Schema(
                {
                    "transaction_id": UUID,
                    "household_id": UUID,
                    "user_id": UUID,
                    "amount": MONEY,
                    "basis_points": INT,
                    "transaction_updated_at": TIMESTAMP,
                    "occurred_on": DATE,
                }
            ),
            Mode.INCREMENTAL,
            key=("transaction_id", "user_id"),
            changed="transaction_updated_at",
            newest=("transaction_updated_at",),
            month="occurred_on",
        ),
        Dataset(
            "settlements",
            pl.Schema(
                {
                    "settlement_id": UUID,
                    "household_id": UUID,
                    "from_user_id": UUID,
                    "to_user_id": UUID,
                    "amount": MONEY,
                    "currency": ENUM,
                    "settled_on": DATE,
                    "note": TEXT,
                    "created_by": UUID,
                    "deleted_at": TIMESTAMP,
                    "created_at": TIMESTAMP,
                    "updated_at": TIMESTAMP,
                    "origin": TEXT,
                }
            ),
            Mode.INCREMENTAL,
            key=("settlement_id",),
            changed="updated_at",
            newest=("updated_at",),
            month="settled_on",
        ),
        Dataset(
            "import_batches",
            pl.Schema(
                {
                    "import_batch_id": UUID,
                    "household_id": UUID,
                    "created_by": UUID,
                    "source": ENUM,
                    "row_count": INT,
                    "undone_at": TIMESTAMP,
                    "created_at": TIMESTAMP,
                    "changed_at": TIMESTAMP,
                    "origin": TEXT,
                }
            ),
            Mode.INCREMENTAL,
            key=("import_batch_id",),
            changed="changed_at",
            newest=("changed_at",),
            month="created_at",
        ),
    ]
}

# Columns a stub (`redacted`) always carries; everything else in it must be null.
STUB_COLUMNS = frozenset(
    {
        *("transaction_id", "household_id", "visibility", "redacted", "origin"),
        *("version", "deleted_at", "created_at", "updated_at"),
    }
)


class InvalidExtractError(ValueError):
    def __init__(self, dataset: str, problems: list[str]) -> None:
        super().__init__(f"{dataset}: " + "; ".join(problems))
        self.dataset = dataset
        self.problems = problems


def check_frame(dataset: Dataset, frame: pl.DataFrame) -> None:
    """What one extract of one view must satisfy; raises InvalidExtractError listing problems."""
    if frame.schema != dataset.schema:
        raise InvalidExtractError(dataset.name, [f"schema {frame.schema} != {dataset.schema}"])

    problems = []
    for column in dataset.key:
        if (nulls := frame[column].null_count()) > 0:
            problems.append(f"{nulls} rows without {column}")
    if frame.select(pl.struct(*dataset.key).is_duplicated().any()).item():
        problems.append(f"duplicate {', '.join(dataset.key)}")
    if dataset.name == "transactions":
        stubs = frame.filter(pl.col("redacted"))
        leaking = [
            c
            for c in frame.columns
            if c not in STUB_COLUMNS and stubs[c].null_count() < stubs.height
        ]
        if leaking:
            problems.append(f"stubs with content in {', '.join(leaking)}")
    if problems:
        raise InvalidExtractError(dataset.name, problems)
