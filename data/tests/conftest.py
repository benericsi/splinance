from collections.abc import Callable

import httpx
import pytest


@pytest.fixture
def ecb_client() -> Callable[[dict[str, bytes]], httpx.Client]:
    """An httpx client answering like the ECB API from recorded responses, keyed by day.

    Days not in the dict get the API's no-data answer: 200 with an empty body.
    """

    def make(responses: dict[str, bytes]) -> httpx.Client:
        def handler(request: httpx.Request) -> httpx.Response:
            day = request.url.params["startPeriod"]
            return httpx.Response(200, content=responses.get(day, b""))

        return httpx.Client(transport=httpx.MockTransport(handler))

    return make
