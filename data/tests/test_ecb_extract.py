from datetime import date

import httpx
import pytest

from splinance_data.extract.ecb_rates import fetch_daily_rates
from tests.helpers import fixture_bytes


def test_requests_one_day_of_the_huf_series() -> None:
    seen: list[httpx.URL] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url)
        return httpx.Response(200, content=fixture_bytes("ecb_huf_2026-10-23.csv"))

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        content = fetch_daily_rates(client, date(2026, 10, 23))

    assert content == fixture_bytes("ecb_huf_2026-10-23.csv")
    assert seen[0].path == "/service/data/EXR/D.HUF.EUR.SP00.A"
    assert dict(seen[0].params) == {
        "startPeriod": "2026-10-23",
        "endPeriod": "2026-10-23",
        "format": "csvdata",
    }


def test_empty_body_means_no_rate_that_day() -> None:
    transport = httpx.MockTransport(lambda _: httpx.Response(200, content=b""))
    with httpx.Client(transport=transport) as client:
        assert fetch_daily_rates(client, date(2026, 10, 24)) is None


@pytest.mark.parametrize("status", [404, 500, 503])
def test_http_errors_are_raised_not_swallowed(status: int) -> None:
    transport = httpx.MockTransport(lambda _: httpx.Response(status))
    with (
        httpx.Client(transport=transport) as client,
        pytest.raises(httpx.HTTPStatusError),
    ):
        fetch_daily_rates(client, date(2026, 10, 23))


@pytest.mark.parametrize("currency", ["huf", "HU", "HUF+USD", "../X"])
def test_rejects_currency_codes_that_are_not_iso(currency: str) -> None:
    with httpx.Client() as client, pytest.raises(ValueError, match="ISO"):
        fetch_daily_rates(client, date(2026, 10, 23), currency)
