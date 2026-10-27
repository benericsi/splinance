from datetime import date
from decimal import Decimal

import pytest

from splinance_data.parse.ecb_rates import SCHEMA, InvalidRatesError, parse_rates
from tests.helpers import fixture_bytes

HEADER = "FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE"


def csv(*rows: str) -> bytes:
    return "\n".join([HEADER, *rows]).encode()


def test_parses_the_recorded_response() -> None:
    rates = parse_rates(fixture_bytes("ecb_huf_2026-10-23.csv"))

    assert rates.schema == SCHEMA
    assert rates.rows() == [(date(2026, 10, 23), "HUF", Decimal("366.73"))]


def test_keeps_the_rate_exact() -> None:
    rates = parse_rates(csv("D,HUF,EUR,SP00,A,2026-10-23,366.123456"))
    assert rates["rate"][0] == Decimal("366.123456")


def test_sorts_by_day() -> None:
    rates = parse_rates(
        csv("D,HUF,EUR,SP00,A,2026-10-23,366.73", "D,HUF,EUR,SP00,A,2026-10-22,366.43")
    )
    assert rates["rate_date"].to_list() == [date(2026, 10, 22), date(2026, 10, 23)]


def test_reports_missing_columns() -> None:
    with pytest.raises(InvalidRatesError, match="missing columns: OBS_VALUE"):
        parse_rates(b"FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD\n")


@pytest.mark.parametrize(
    ("row", "problem"),
    [
        ("M,HUF,EUR,SP00,A,2026-10,366.73", "FREQ must be D"),
        ("D,HUF,USD,SP00,A,2026-10-23,366.73", "CURRENCY_DENOM must be EUR"),
        ("D,HUF,EUR,SP00,A,23/10/2026,366.73", "unreadable date"),
        ("D,HUF,EUR,SP00,A,2026-10-23,", "missing or non-positive rate"),
        ("D,HUF,EUR,SP00,A,2026-10-23,-1", "missing or non-positive rate"),
        ("D,HUF,EUR,SP00,A,2026-10-23,n/a", "missing or non-positive rate"),
        ("D,huf,EUR,SP00,A,2026-10-23,366.73", "3-letter ISO code"),
    ],
)
def test_rejects_invalid_rows(row: str, problem: str) -> None:
    with pytest.raises(InvalidRatesError, match=problem):
        parse_rates(csv(row))


def test_rejects_duplicates_and_lists_every_problem() -> None:
    with pytest.raises(InvalidRatesError) as error:
        parse_rates(csv("D,HUF,EUR,SP00,A,2026-10-23,366.73", "D,HUF,EUR,SP00,A,2026-10-23,0"))
    assert len(error.value.problems) == 2
