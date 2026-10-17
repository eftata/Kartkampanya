"""Testlere özel sentetik adaptör, ağsız fetcher ve sahte LLM (gerçek banka/API değil)."""

import json
from typing import Any

from selectolax.lexbor import LexborHTMLParser

from engine.pipeline.adapters import BankAdapter, RawCampaign
from engine.pipeline.extract import LlmReply
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


# SENTETİK ayıklama çıktısı: sentetik detay sayfasındaki market kampanyasına karşılık gelir.
ORNEK_EXTRACTION: dict[str, Any] = {
    "join_method": "APP",
    "join_deadline": "2026-11-30",
    "summary": ["Markette toplam 2.500 TL harcamaya 100 TL puan", "En fazla 300 TL"],
    "rules": [
        {
            "categories": [],
            "merchants": [],
            "threshold_type": "CUMULATIVE",
            "threshold_kurus": 250000,
            "txn_count": None,
            "tier_repeat": True,
            "reward_type": "POINTS",
            "reward_kurus": 10000,
            "reward_bps": None,
            "cap_kurus": 30000,
            "exclusions": ["taksitli"],
        }
    ],
    "confidence": 0.9,
    "uncertain_fields": [],
}


class ScriptedLlm:
    """Her isteme `output` döner; istemde `refuse_if` geçiyorsa reddeder. Çağrıları sayar."""

    def __init__(self, output: dict[str, Any] = ORNEK_EXTRACTION, refuse_if: str = "") -> None:
        self.output = output
        self.refuse_if = refuse_if
        self.prompts: list[str] = []

    async def complete(self, *, system: str, prompt: str, schema: dict[str, Any]) -> LlmReply:
        self.prompts.append(prompt)
        if self.refuse_if and self.refuse_if in prompt:
            return LlmReply(text="", stop_reason="refusal", model="fake")
        return LlmReply(text=json.dumps(self.output), stop_reason="end_turn", model="fake")
