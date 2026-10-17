from datetime import date
from pathlib import Path

import pytest
from selectolax.lexbor import LexborHTMLParser

from engine.pipeline.adapters import ADAPTERS, BankAdapter, RawCampaign, get_adapter, register
from engine.pipeline.text import find_date_range, html_to_text

FIXTURES = Path(__file__).parent / "fixtures"


class OrnekAdapter(BankAdapter):
    """Testlere özel, sentetik HTML'e göre yazılmış örnek adaptör (gerçek banka değil)."""

    adapter = "ornek"
    program = "ornek"
    list_url = "https://ornek-banka.test/kampanyalar"

    def parse_list(self, html: str, base_url: str) -> list[str]:
        tree = LexborHTMLParser(html)
        return [str(a.attributes.get("href") or "") for a in tree.css("a.kampanya")]

    def parse_detail(self, html: str, url: str) -> RawCampaign:
        tree = LexborHTMLParser(html)
        title = tree.css_first("h1.baslik")
        terms = tree.css_first("div.sartlar")
        raw_text = html_to_text(terms.html or "") if terms else ""
        starts_at, ends_at = find_date_range(raw_text)
        return RawCampaign(
            source_url=url,
            title=title.text(strip=True) if title else "",
            raw_text=raw_text,
            starts_at=starts_at,
            ends_at=ends_at,
        )


class FixtureFetcher:
    def __init__(self, pages: dict[str, str]) -> None:
        self.pages = pages
        self.requested: list[str] = []

    async def get_text(self, url: str) -> str:
        self.requested.append(url)
        return self.pages[url]


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_list_urls_are_absolute_unique_same_site_and_fragment_free() -> None:
    fetcher = FixtureFetcher({OrnekAdapter.list_url: (FIXTURES / "ornek-liste.html").read_text()})
    urls = await OrnekAdapter().list_urls(fetcher)
    assert urls == [
        "https://ornek-banka.test/kampanyalar/market-puan",
        "https://ornek-banka.test/kampanyalar/akaryakit",
    ]


@pytest.mark.anyio
async def test_fetch_returns_title_terms_and_date_range() -> None:
    url = "https://ornek-banka.test/kampanyalar/market-puan"
    fetcher = FixtureFetcher({url: (FIXTURES / "ornek-detay.html").read_text()})
    campaign = await OrnekAdapter().fetch(fetcher, url)
    assert campaign.title == "Markette 2.500 TL'ye 100 TL puan"
    assert campaign.starts_at == date(2026, 11, 1)
    assert campaign.ends_at == date(2026, 11, 30)
    assert "Taksitli işlemler hariçtir." in campaign.raw_text
    assert "analytics" not in campaign.raw_text and "Menü" not in campaign.raw_text


def test_registry_rejects_duplicates_and_unknown_names() -> None:
    saved = dict(ADAPTERS)
    try:
        register(OrnekAdapter)
        assert isinstance(get_adapter("ornek"), OrnekAdapter)
        with pytest.raises(ValueError, match="iki kez"):
            register(OrnekAdapter)
        with pytest.raises(KeyError, match="Bilinmeyen"):
            get_adapter("yok")
    finally:
        ADAPTERS.clear()
        ADAPTERS.update(saved)
