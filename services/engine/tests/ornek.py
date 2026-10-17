"""Testlere özel sentetik adaptör ve ağsız fetcher (gerçek banka değil)."""

from selectolax.lexbor import LexborHTMLParser

from engine.pipeline.adapters import BankAdapter, RawCampaign
from engine.pipeline.fetcher import FetchError
from engine.pipeline.text import find_date_range, html_to_text


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
        if url not in self.pages:
            raise FetchError(f"{url}: HTTP 404")
        return self.pages[url]
