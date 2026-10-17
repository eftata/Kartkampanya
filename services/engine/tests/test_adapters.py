from datetime import date
from pathlib import Path

import pytest

from engine.pipeline.adapters import ADAPTERS, get_adapter, register
from tests.ornek import FixtureFetcher, OrnekAdapter

FIXTURES = Path(__file__).parent / "fixtures"


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
