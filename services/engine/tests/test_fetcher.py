from collections.abc import Callable

import httpx2
import pytest
from pydantic import ValidationError

from engine.pipeline.fetcher import FetchError, PoliteFetcher, RobotsDisallowed
from engine.settings import Settings

UA = "KartPlanBot/test"
HTML = "<html><body>kampanya</body></html>"


class FakeClock:
    """Gerçekte beklemeden saati ilerletir; beklenen süreleri kaydeder."""

    def __init__(self) -> None:
        self.now = 1000.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(round(seconds, 3))
        self.now += seconds


def make_fetcher(
    handler: Callable[[httpx2.Request], httpx2.Response],
    clock: FakeClock | None = None,
) -> tuple[PoliteFetcher, list[httpx2.Request], FakeClock]:
    requests: list[httpx2.Request] = []
    clock = clock or FakeClock()

    def record(request: httpx2.Request) -> httpx2.Response:
        requests.append(request)
        return handler(request)

    client = httpx2.AsyncClient(transport=httpx2.MockTransport(record))
    return PoliteFetcher(client, user_agent=UA, clock=clock, sleep=clock.sleep), requests, clock


def site(
    robots: httpx2.Response, page: httpx2.Response | None = None
) -> Callable[[httpx2.Request], httpx2.Response]:
    def handler(request: httpx2.Request) -> httpx2.Response:
        if request.url.path == "/robots.txt":
            return robots
        return page or httpx2.Response(200, text=HTML, headers={"content-type": "text/html"})

    return handler


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_fetches_html_with_user_agent_after_reading_robots() -> None:
    fetcher, requests, _ = make_fetcher(site(httpx2.Response(200, text="User-agent: *\nAllow: /")))
    assert await fetcher.get_text("https://banka.test/kampanyalar") == HTML
    assert [r.url.path for r in requests] == ["/robots.txt", "/kampanyalar"]
    assert all(r.headers["user-agent"] == UA for r in requests)


@pytest.mark.anyio
async def test_respects_robots_disallow_without_requesting_the_page() -> None:
    robots = httpx2.Response(200, text="User-agent: *\nDisallow: /kampanyalar")
    fetcher, requests, _ = make_fetcher(site(robots))
    with pytest.raises(RobotsDisallowed):
        await fetcher.get_text("https://banka.test/kampanyalar/x")
    assert [r.url.path for r in requests] == ["/robots.txt"]


@pytest.mark.anyio
async def test_missing_robots_allows_crawling() -> None:
    fetcher, _, _ = make_fetcher(site(httpx2.Response(404)))
    assert await fetcher.get_text("https://banka.test/kampanyalar") == HTML


@pytest.mark.anyio
@pytest.mark.parametrize("robots", [httpx2.Response(503), httpx2.Response(403)])
async def test_unreadable_robots_blocks_crawling(robots: httpx2.Response) -> None:
    fetcher, requests, _ = make_fetcher(site(robots))
    with pytest.raises(RobotsDisallowed):
        await fetcher.get_text("https://banka.test/kampanyalar")
    assert len(requests) == 1


@pytest.mark.anyio
async def test_robots_network_error_blocks_crawling() -> None:
    def handler(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectError("bağlantı yok", request=request)

    fetcher, _, _ = make_fetcher(handler)
    with pytest.raises(RobotsDisallowed):
        await fetcher.get_text("https://banka.test/kampanyalar")


@pytest.mark.anyio
async def test_waits_at_least_two_seconds_between_requests_to_the_same_host() -> None:
    fetcher, requests, clock = make_fetcher(site(httpx2.Response(404)))
    await fetcher.get_text("https://banka.test/a")  # robots + a
    clock.now += 0.5
    await fetcher.get_text("https://banka.test/b")
    await fetcher.get_text("https://diger-banka.test/c")  # başka site: kendi robots'u
    assert [r.url.path for r in requests] == ["/robots.txt", "/a", "/b", "/robots.txt", "/c"]
    # robots → a: 2 sn; a → b: 0,5 sn geçmiş, 1,5 sn daha; diğer sitenin robots → c: 2 sn.
    assert clock.sleeps == [2.0, 1.5, 2.0]


def test_rejects_delays_under_two_seconds() -> None:
    client = httpx2.AsyncClient(transport=httpx2.MockTransport(lambda r: httpx2.Response(200)))
    with pytest.raises(ValueError, match="en az 2"):
        PoliteFetcher(client, user_agent=UA, min_delay=1.0)
    with pytest.raises(ValidationError):
        Settings(_env_file=None, pipeline_min_delay_seconds=1.0)


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("page", "message"),
    [
        (httpx2.Response(404, text="yok", headers={"content-type": "text/html"}), "HTTP 404"),
        (httpx2.Response(200, json={"a": 1}), "içerik türü"),
        (httpx2.Response(200, text="x" * 2_000, headers={"content-type": "text/html"}), "büyük"),
    ],
)
async def test_rejects_errors_non_html_and_oversized_pages(
    page: httpx2.Response, message: str
) -> None:
    requests: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        requests.append(request)
        return httpx2.Response(404) if request.url.path == "/robots.txt" else page

    clock = FakeClock()
    fetcher = PoliteFetcher(
        httpx2.AsyncClient(transport=httpx2.MockTransport(handler)),
        user_agent=UA,
        clock=clock,
        sleep=clock.sleep,
        max_bytes=1_000,
    )
    with pytest.raises(FetchError, match=message):
        await fetcher.get_text("https://banka.test/kampanyalar")
