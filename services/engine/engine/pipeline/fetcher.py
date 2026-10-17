"""Bankalara kibar HTTP istemcisi: robots.txt'e uyar, aynı siteye ≥ 2 sn arayla gider."""

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Protocol
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import httpx2

MIN_DELAY_SECONDS = 2.0
MAX_BYTES = 5_000_000
_HTML_TYPES = ("text/html", "application/xhtml+xml")


class FetchError(Exception):
    """Sayfa alınamadı (HTTP hatası, beklenmeyen içerik, aşırı boyut)."""


class RobotsDisallowed(FetchError):
    """Sitenin robots.txt dosyası bu adresi taramayı yasaklıyor (ya da robots okunamadı)."""


class Fetcher(Protocol):
    async def get_text(self, url: str) -> str: ...


class PoliteFetcher:
    """Adaptörlerin kullandığı tek ağ kapısı. Tek bir çalıştırma boyunca paylaşılır."""

    def __init__(
        self,
        client: httpx2.AsyncClient,
        *,
        user_agent: str,
        min_delay: float = MIN_DELAY_SECONDS,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        max_bytes: int = MAX_BYTES,
    ) -> None:
        if min_delay < MIN_DELAY_SECONDS:
            raise ValueError(f"İstekler arası bekleme en az {MIN_DELAY_SECONDS} sn olmalı.")
        self._client = client
        self._user_agent = user_agent
        self._min_delay = min_delay
        self._clock = clock
        self._sleep = sleep
        self._max_bytes = max_bytes
        self._last_request: dict[str, float] = {}
        self._robots: dict[str, RobotFileParser | None] = {}
        self._lock = asyncio.Lock()

    async def _wait_turn(self, host: str) -> None:
        last = self._last_request.get(host)
        if last is not None:
            remaining = self._min_delay - (self._clock() - last)
            if remaining > 0:
                await self._sleep(remaining)
        self._last_request[host] = self._clock()

    async def _request(self, url: str) -> httpx2.Response:
        await self._wait_turn(urlsplit(url).netloc)
        return await self._client.get(
            url,
            headers={"User-Agent": self._user_agent, "Accept-Language": "tr-TR,tr;q=0.9"},
            follow_redirects=True,
        )

    async def _robots_for(self, url: str) -> RobotFileParser | None:
        """None = robots okunamadı; güvenli tarafta kalınır ve site taranmaz."""
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin not in self._robots:
            parser = RobotFileParser()
            try:
                response = await self._request(f"{origin}/robots.txt")
            except httpx2.HTTPError:
                self._robots[origin] = None
                return None
            if response.status_code in (404, 410):
                parser.parse([])  # robots.txt yok: tarama serbest
            elif response.is_success:
                parser.parse(response.text.splitlines())
            else:
                self._robots[origin] = None
                return None
            self._robots[origin] = parser
        return self._robots[origin]

    async def get_text(self, url: str) -> str:
        # Aynı fetcher'dan paralel istek gelse de sıra ve bekleme korunur.
        async with self._lock:
            robots = await self._robots_for(url)
            if robots is None or not robots.can_fetch(self._user_agent, url):
                raise RobotsDisallowed(f"robots.txt bu adrese izin vermiyor: {url}")
            try:
                response = await self._request(url)
            except httpx2.HTTPError as error:
                raise FetchError(f"{url}: {error}") from error

        if not response.is_success:
            raise FetchError(f"{url}: HTTP {response.status_code}")
        content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
        if content_type not in _HTML_TYPES:
            raise FetchError(f"{url}: beklenmeyen içerik türü {content_type or '-'}")
        if len(response.content) > self._max_bytes:
            raise FetchError(f"{url}: sayfa çok büyük ({len(response.content)} bayt)")
        return response.text
