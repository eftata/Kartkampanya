"""Banka adaptörü arayüzü. Adaptör yalnızca HTML'i ayrıştırır; ağ işini `Fetcher` yapar."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from typing import ClassVar
from urllib.parse import urljoin, urlsplit, urlunsplit

from engine.pipeline.fetcher import Fetcher


@dataclass(frozen=True)
class RawCampaign:
    source_url: str
    title: str
    raw_text: str
    starts_at: date | None
    ends_at: date | None


def canonical_url(url: str) -> str:
    """Parçayı (#...) atar; aynı kampanya farklı çapalarla iki kez sayılmasın."""
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, ""))


class BankAdapter(ABC):
    """Her banka için bir alt sınıf: listeden detay adreslerini, detaydan ham metni çıkarır.

    Alt sınıflar sitenin gerçek HTML'ine göre yazılır ve kayıtlı sayfa örnekleriyle (fixture) test
    edilir; site değişince test kırılır.
    """

    adapter: ClassVar[str]  # CampaignSource.adapter, ör. "world"
    program: ClassVar[str]  # Program.slug
    list_url: ClassVar[str]

    @abstractmethod
    def parse_list(self, html: str, base_url: str) -> list[str]:
        """Liste sayfasındaki kampanya detay bağlantıları (göreli olabilir)."""

    @abstractmethod
    def parse_detail(self, html: str, url: str) -> RawCampaign:
        """Detay sayfasından başlık, tarih aralığı ve şart metni."""

    async def list_urls(self, fetcher: Fetcher) -> list[str]:
        """Mutlak, tekil, liste sayfasıyla aynı sitedeki detay adresleri (sıra korunur)."""
        html = await fetcher.get_text(self.list_url)
        host = urlsplit(self.list_url).netloc
        seen: dict[str, None] = {}
        for href in self.parse_list(html, self.list_url):
            url = canonical_url(urljoin(self.list_url, href))
            if urlsplit(url).netloc == host and url != canonical_url(self.list_url):
                seen.setdefault(url, None)
        return list(seen)

    async def fetch(self, fetcher: Fetcher, url: str) -> RawCampaign:
        return self.parse_detail(await fetcher.get_text(url), url)
