"""LLM ayıklama: doğrulama, yeniden deneme, ret ve Claude isteğinin biçimi. Ağa çıkılmaz."""

import json
from datetime import date
from typing import Any

import anthropic
import httpx2
import pytest
from pydantic import ValidationError

from engine.pipeline.adapters.base import RawCampaign
from engine.pipeline.extract import (
    AnthropicLlm,
    Catalog,
    ExtractionError,
    LlmReply,
    extract,
    output_schema,
    parse_reply,
)

pytestmark = pytest.mark.anyio

CATALOG = Catalog(
    categories={"market": "cat-market", "akaryakit": "cat-akaryakit"},
    merchants={"Migros": "m-migros", "Opet": "m-opet"},
)

# SENTETİK kampanya metni; gerçek bir bankaya ait değildir.
RAW = RawCampaign(
    source_url="https://ornek-banka.test/kampanyalar/market",
    title="Markette 2.500 TL'ye 100 TL puan",
    raw_text=(
        "1 Kasım - 30 Kasım 2026 tarihleri arasında market harcamalarınızda her 2.500 TL'ye "
        "100 TL puan. Kampanya süresince en fazla 300 TL puan kazanılır. Taksitli işlemler "
        "kampanyaya dahil değildir. Katılım için mobil uygulamadan 30 Kasım'a kadar katılın."
    ),
    starts_at=date(2026, 11, 1),
    ends_at=date(2026, 11, 30),
)


def rule(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "categories": ["market"],
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
    return base | overrides


def output(**overrides: Any) -> str:
    base: dict[str, Any] = {
        "join_method": "APP",
        "join_deadline": "2026-11-30",
        "summary": ["Markette toplam 2.500 TL harcamaya 100 TL puan", "En fazla 300 TL"],
        "rules": [rule()],
        "confidence": 0.86,
        "uncertain_fields": [],
    }
    return json.dumps(base | overrides)


class FakeLlm:
    """Sıradaki yanıtı döner; gönderilen istemleri saklar."""

    def __init__(self, *replies: LlmReply) -> None:
        self.replies = list(replies)
        self.prompts: list[str] = []

    async def complete(self, *, system: str, prompt: str, schema: dict[str, Any]) -> LlmReply:
        self.prompts.append(prompt)
        return self.replies.pop(0)


def reply(text: str, stop_reason: str = "end_turn") -> LlmReply:
    return LlmReply(text=text, stop_reason=stop_reason, model="claude-test")


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# ---------- Doğrulama ----------


def test_parse_valid_output() -> None:
    result = parse_reply(output(), CATALOG)
    assert result.join_method == "APP"
    assert result.join_deadline == date(2026, 11, 30)
    assert result.rules[0].threshold_kurus == 250000


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"rules": [rule(threshold_kurus=None)]}, "threshold_kurus zorunlu"),
        ({"rules": [rule(threshold_type="TXN_COUNT", txn_count=None)]}, "txn_count zorunlu"),
        ({"rules": [rule(reward_kurus=None)]}, "reward_kurus ya da reward_bps"),
        ({"rules": [rule(reward_kurus=None, reward_bps=10_001)]}, "less than or equal"),
        ({"rules": [rule(categories=["kozmetik"])]}, "katalogda olmayan kategori"),
        ({"rules": [rule(merchants=["Bilinmeyen"])]}, "katalogda olmayan marka"),
        ({"rules": []}, "at least 1"),
        ({"summary": ["a", "b", "c", "d"]}, "at most 3"),
        ({"summary": ["  "]}, "boş olamaz"),
        ({"confidence": 1.5}, "less than or equal"),
        ({"join_method": "TELEFON"}, "join_method"),
    ],
)
def test_parse_rejects_invalid_output(overrides: dict[str, Any], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        parse_reply(output(**overrides), CATALOG)


def test_installment_reward_needs_no_amount() -> None:
    result = parse_reply(
        output(rules=[rule(reward_type="INSTALLMENT", reward_kurus=None, cap_kurus=None)]),
        CATALOG,
    )
    assert result.rules[0].reward_type == "INSTALLMENT"


def test_schema_limits_names_to_catalog() -> None:
    schema = output_schema(CATALOG)
    item = schema["properties"]["rules"]["items"]["properties"]
    assert item["categories"]["items"]["enum"] == ["akaryakit", "market"]
    assert item["merchants"]["items"]["enum"] == ["Migros", "Opet"]
    # Katalogda marka yoksa boş enum (geçersiz şema) yerine düz metin; pydantic yine reddeder.
    empty = output_schema(Catalog(categories={"market": "c"}, merchants={}))
    assert "enum" not in empty["properties"]["rules"]["items"]["properties"]["merchants"]["items"]


# ---------- Akış ----------


async def test_extract_resolves_catalog_ids() -> None:
    llm = FakeLlm(reply(output(rules=[rule(merchants=["Migros"])])))
    result = await extract(RAW, CATALOG, llm)
    assert result.attempts == 1
    assert result.model == "claude-test"
    assert result.rules[0].category_ids == ["cat-market"]
    assert result.rules[0].merchant_ids == ["m-migros"]
    assert result.extraction.confidence == 0.86
    # İstem kataloğu, tarihleri ve metni içerir; metin veri olarak etiketlenir.
    prompt = llm.prompts[0]
    assert "Kategoriler (slug): akaryakit, market" in prompt
    assert "Markalar: Migros, Opet" in prompt
    assert "2026-11-01 / 2026-11-30" in prompt
    assert "<kampanya_metni>\n1 Kasım" in prompt


async def test_invalid_output_is_retried_once_with_errors() -> None:
    llm = FakeLlm(reply("{bozuk"), reply(output()))
    result = await extract(RAW, CATALOG, llm)
    assert result.attempts == 2
    assert "Önceki denemenin çıktısı doğrulamadan geçmedi" not in llm.prompts[0]
    assert "Önceki denemenin çıktısı doğrulamadan geçmedi" in llm.prompts[1]


async def test_unknown_merchant_feedback_points_to_uncertain_fields() -> None:
    llm = FakeLlm(
        reply(output(rules=[rule(merchants=["A101"])])),
        reply(output(uncertain_fields=["merchant:A101"])),
    )
    result = await extract(RAW, CATALOG, llm)
    assert "katalogda olmayan marka: A101" in llm.prompts[1]
    assert "uncertain_fields" in llm.prompts[1]
    assert result.extraction.uncertain_fields == ["merchant:A101"]


async def test_gives_up_after_two_invalid_outputs() -> None:
    llm = FakeLlm(
        reply(output(rules=[rule(threshold_kurus=None)])),
        reply(output(rules=[rule(threshold_kurus=None)])),
    )
    with pytest.raises(ExtractionError, match="2 denemede doğrulanamadı"):
        await extract(RAW, CATALOG, llm)
    assert len(llm.prompts) == 2


async def test_truncated_output_is_retried() -> None:
    llm = FakeLlm(reply('{"join_method":', "max_tokens"), reply(output()))
    result = await extract(RAW, CATALOG, llm)
    assert result.attempts == 2
    assert "max_tokens" in llm.prompts[1]


async def test_refusal_is_not_retried() -> None:
    llm = FakeLlm(reply("", "refusal"), reply(output()))
    with pytest.raises(ExtractionError, match="reddetti"):
        await extract(RAW, CATALOG, llm)
    assert len(llm.prompts) == 1


async def test_api_error_becomes_extraction_error() -> None:
    class FailingLlm:
        async def complete(self, *, system: str, prompt: str, schema: dict[str, Any]) -> LlmReply:
            raise anthropic.APIConnectionError(
                request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
            )

    with pytest.raises(ExtractionError, match="LLM isteği başarısız"):
        await extract(RAW, CATALOG, FailingLlm())


# ---------- Claude isteği ----------


async def test_anthropic_request_shape() -> None:
    """Gerçek SDK, sahte HTTP katmanı: istek gövdesi ve başlıkları API'ye gidecek biçimde."""
    seen: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen.append(request)
        return httpx2.Response(
            200,
            json={
                "id": "msg_test",
                "type": "message",
                "role": "assistant",
                "model": "claude-opus-5-5",
                "content": [{"type": "text", "text": output()}],
                "stop_reason": "end_turn",
                "stop_sequence": None,
                "usage": {"input_tokens": 10, "output_tokens": 10},
            },
        )

    client = anthropic.AsyncAnthropic(
        api_key="test-key",
        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handler)),
    )
    llm = AnthropicLlm(client, model="claude-opus-5-5")
    result = await extract(RAW, CATALOG, llm)

    assert result.attempts == 1
    assert result.model == "claude-opus-5-5"
    request = seen[0]
    assert "server-side-fallback-2026-07-01" in request.headers["anthropic-beta"]
    body = json.loads(request.content)
    assert body["model"] == "claude-opus-5-5"
    assert body["fallbacks"] == "default"
    assert body["output_config"]["effort"] == "high"
    assert body["output_config"]["format"]["type"] == "json_schema"
    assert body["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "thinking" not in body  # Opus 5.5'te düşünme hep açık; bütçe gönderilmez
    assert body["messages"][0]["role"] == "user"
