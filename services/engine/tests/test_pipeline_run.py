"""run_source + CampaignStore: gerçek veritabanına karşı (DATABASE_URL yoksa atlanır)."""

import os
from collections.abc import AsyncIterator
from datetime import datetime
from pathlib import Path
from typing import Any

import psycopg
import pytest

from engine.pipeline.changes import Change
from engine.pipeline.run import run_source
from engine.pipeline.store import CampaignStore, connect, new_id
from engine.settings import Settings
from tests.ornek import ORNEK_EXTRACTION, FixtureFetcher, OrnekAdapter, ScriptedLlm

FIXTURES = Path(__file__).parent / "fixtures"
SETTINGS = Settings()
HAS_DB = bool(SETTINGS.database_url.get_secret_value())
if not HAS_DB and os.environ.get("ENGINE_DB_TESTS") == "required":
    raise RuntimeError("ENGINE_DB_TESTS=required ama DATABASE_URL tanımlı değil.")
pytestmark = [
    pytest.mark.anyio,
    pytest.mark.skipif(not HAS_DB, reason="DATABASE_URL tanımlı değil"),
]

Conn = psycopg.AsyncConnection[dict[str, Any]]


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def db() -> AsyncIterator[tuple[Conn, type[OrnekAdapter]]]:
    """Her test için ayrı banka/program ve benzersiz adaptör adı; sonunda temizlenir."""
    run = new_id()[:8]

    class OrnekAdapterT(OrnekAdapter):
        adapter = f"ornek-{run}"
        program = f"ornek-{run}"
        list_url = f"https://{run}.ornek-banka.test/kampanyalar"

    adapter_cls = OrnekAdapterT
    async with connect(SETTINGS) as conn:
        bank_id, program_id = new_id(), new_id()
        await conn.execute('INSERT INTO "Bank" ("id", "name") VALUES (%s, %s)', (bank_id, run))
        await conn.execute(
            'INSERT INTO "Program" ("id", "bankId", "slug", "name", "pointName") '
            "VALUES (%s, %s, %s, %s, 'P')",
            (program_id, bank_id, adapter_cls.program, run),
        )
        try:
            yield conn, adapter_cls
        finally:
            await conn.execute('DELETE FROM "Campaign" WHERE "programId" = %s', (program_id,))
            await conn.execute(
                'DELETE FROM "PipelineRun" WHERE "sourceId" IN '
                '(SELECT "id" FROM "CampaignSource" WHERE "programId" = %s)',
                (program_id,),
            )
            await conn.execute('DELETE FROM "CampaignSource" WHERE "programId" = %s', (program_id,))
            await conn.execute('DELETE FROM "Program" WHERE "id" = %s', (program_id,))
            await conn.execute('DELETE FROM "Bank" WHERE "id" = %s', (bank_id,))


def pages(adapter_cls: type[OrnekAdapter]) -> dict[str, str]:
    """Sentetik liste + iki detay; her test kendi alt alan adında (sitelerin karışmaması için)."""
    base = adapter_cls.list_url.removesuffix("/kampanyalar")
    listing = (FIXTURES / "ornek-liste.html").read_text().replace("https://ornek-banka.test", base)
    detail = (FIXTURES / "ornek-detay.html").read_text()
    return {
        adapter_cls.list_url: listing,
        f"{base}/kampanyalar/market-puan": detail,
        f"{base}/kampanyalar/akaryakit": detail.replace("Markette", "Akaryakıtta"),
    }


async def run_row(conn: Conn, run_id: str | None) -> dict[str, Any]:
    row = await (
        await conn.execute(
            'SELECT "status"::text AS "status", "found", "changed", "errors", "finishedAt" '
            'FROM "PipelineRun" WHERE "id" = %s',
            (run_id,),
        )
    ).fetchone()
    assert row
    return row


async def campaign_row(conn: Conn, source_url: str) -> dict[str, Any]:
    row = await (
        await conn.execute(
            'SELECT "id", "status"::text AS "status", "rawText", "rawHash", "summary", '
            '"joinMethod"::text AS "joinMethod", "joinDeadline", "confidence", '
            '"uncertainFields", "startsAt", "endsAt", "sourceId", "programId" '
            'FROM "Campaign" WHERE "sourceUrl" = %s',
            (source_url,),
        )
    ).fetchone()
    assert row
    return row


async def rule_rows(conn: Conn, campaign_id: str) -> list[dict[str, Any]]:
    cursor = await conn.execute(
        'SELECT "categoryIds", "merchantIds", "thresholdType"::text AS "thresholdType", '
        '"thresholdKurus", "txnCount", "tierRepeat", "rewardType"::text AS "rewardType", '
        '"rewardKurus", "rewardBps", "capKurus", "exclusions" '
        'FROM "CampaignRule" WHERE "campaignId" = %s',
        (campaign_id,),
    )
    return await cursor.fetchall()


async def test_first_run_extracts_and_saves_new_campaigns_as_draft(
    db: tuple[Conn, type[OrnekAdapter]],
) -> None:
    conn, adapter_cls = db
    llm = ScriptedLlm()
    report = await run_source(
        adapter_cls(), FixtureFetcher(pages(adapter_cls)), CampaignStore(conn), llm
    )
    assert report.status == "SUCCEEDED"
    assert report.found == 2 and report.unchanged == 0
    assert [p.change for p in report.pending] == [Change.NEW, Change.NEW]
    assert len(report.saved) == 2 and len(llm.prompts) == 2
    row = await run_row(conn, report.run_id)
    assert row["status"] == "SUCCEEDED" and row["found"] == 2 and row["changed"] == 2
    assert row["finishedAt"] is not None and row["errors"] is None

    item = report.pending[0]
    campaign = await campaign_row(conn, item.raw.source_url)
    assert campaign["status"] == "DRAFT"
    assert campaign["rawHash"] == item.raw_hash
    assert campaign["summary"] == ORNEK_EXTRACTION["summary"]
    assert campaign["joinMethod"] == "APP"
    assert campaign["joinDeadline"] == datetime(2026, 11, 30)
    assert campaign["confidence"] == 0.9 and campaign["uncertainFields"] == []
    assert (campaign["startsAt"], campaign["endsAt"]) == (
        datetime(2026, 11, 1),
        datetime(2026, 11, 30),
    )
    assert campaign["sourceId"] and campaign["programId"]
    assert await rule_rows(conn, campaign["id"]) == [
        {
            "categoryIds": [],
            "merchantIds": [],
            "thresholdType": "CUMULATIVE",
            "thresholdKurus": 250000,
            "txnCount": None,
            "tierRepeat": True,
            "rewardType": "POINTS",
            "rewardKurus": 10000,
            "rewardBps": None,
            "capKurus": 30000,
            "exclusions": ["taksitli"],
        }
    ]


async def test_unchanged_text_is_not_reextracted_and_changed_text_is_reextracted_as_draft(
    db: tuple[Conn, type[OrnekAdapter]],
) -> None:
    conn, adapter_cls = db
    store = CampaignStore(conn)
    first = await run_source(
        adapter_cls(), FixtureFetcher(pages(adapter_cls)), store, ScriptedLlm()
    )
    approved_url = first.pending[0].raw.source_url
    await conn.execute(
        'UPDATE "Campaign" SET "status" = \'APPROVED\' WHERE "sourceUrl" = %s', (approved_url,)
    )

    llm = ScriptedLlm()
    second = await run_source(adapter_cls(), FixtureFetcher(pages(adapter_cls)), store, llm)
    assert second.unchanged == 2 and second.pending == [] and llm.prompts == []
    assert (await run_row(conn, second.run_id))["changed"] == 0

    # Onaylı kampanyanın metni değişir → yeniden ayıklanır, kuralları yenilenir, DRAFT olur.
    changed_pages = pages(adapter_cls)
    changed_pages[approved_url] = changed_pages[approved_url].replace(
        "En fazla 300 TL", "En fazla 500 TL"
    )
    new_output = ORNEK_EXTRACTION | {
        "rules": [ORNEK_EXTRACTION["rules"][0] | {"cap_kurus": 50000}],
        "summary": ["Markette toplam 2.500 TL harcamaya 100 TL puan", "En fazla 500 TL"],
    }
    third = await run_source(
        adapter_cls(), FixtureFetcher(changed_pages), store, ScriptedLlm(new_output)
    )
    assert third.unchanged == 1
    assert [(p.change, p.raw.source_url) for p in third.pending] == [(Change.CHANGED, approved_url)]
    campaign = await campaign_row(conn, approved_url)
    assert third.saved == [campaign["id"]] == [third.pending[0].campaign_id]
    assert campaign["status"] == "DRAFT"
    assert "En fazla 500 TL" in campaign["rawText"]
    assert campaign["rawHash"] == third.pending[0].raw_hash
    assert campaign["summary"][1] == "En fazla 500 TL"
    rules = await rule_rows(conn, campaign["id"])
    assert [r["capKurus"] for r in rules] == [50000]  # eski kural silindi


async def test_failed_extraction_unpublishes_but_keeps_old_hash_for_retry(
    db: tuple[Conn, type[OrnekAdapter]],
) -> None:
    conn, adapter_cls = db
    store = CampaignStore(conn)
    first = await run_source(
        adapter_cls(), FixtureFetcher(pages(adapter_cls)), store, ScriptedLlm()
    )
    url = first.pending[0].raw.source_url
    await conn.execute(
        'UPDATE "Campaign" SET "status" = \'APPROVED\' WHERE "sourceUrl" = %s', (url,)
    )
    old = await campaign_row(conn, url)

    changed_pages = pages(adapter_cls)
    changed_pages[url] = changed_pages[url].replace("En fazla 300 TL", "En fazla 500 TL")
    failed = await run_source(
        adapter_cls(), FixtureFetcher(changed_pages), store, ScriptedLlm(refuse_if="500 TL")
    )
    assert failed.status == "SUCCEEDED" and failed.saved == []
    assert failed.errors == [{"url": url, "message": "LLM isteği reddetti"}]
    assert (await run_row(conn, failed.run_id))["changed"] == 0
    campaign = await campaign_row(conn, url)
    assert campaign["status"] == "DRAFT"  # yayından hemen kalktı
    assert campaign["rawHash"] == old["rawHash"]  # özet eski: ertesi gün yeniden denenir
    assert len(await rule_rows(conn, campaign["id"])) == 1

    retry = await run_source(adapter_cls(), FixtureFetcher(changed_pages), store, ScriptedLlm())
    assert [p.change for p in retry.pending] == [Change.CHANGED]
    assert retry.saved == [campaign["id"]]
    assert (await campaign_row(conn, url))["rawHash"] == retry.pending[0].raw_hash


async def test_new_campaign_without_dates_is_not_sent_to_llm(
    db: tuple[Conn, type[OrnekAdapter]],
) -> None:
    conn, adapter_cls = db
    undated = pages(adapter_cls)
    url = next(u for u in undated if u.endswith("akaryakit"))
    undated[url] = undated[url].replace("1-30 Kasım 2026", "kampanya süresince")
    llm = ScriptedLlm()
    report = await run_source(adapter_cls(), FixtureFetcher(undated), CampaignStore(conn), llm)
    assert len(report.pending) == 2 and len(report.saved) == 1 and len(llm.prompts) == 1
    assert report.errors == [{"url": url, "message": "Tarih aralığı okunamadı."}]


async def test_page_errors_are_recorded_and_list_errors_fail_the_run(
    db: tuple[Conn, type[OrnekAdapter]],
) -> None:
    conn, adapter_cls = db
    store = CampaignStore(conn)
    broken = pages(adapter_cls)
    missing_url = next(url for url in broken if url.endswith("akaryakit"))
    del broken[missing_url]
    report = await run_source(adapter_cls(), FixtureFetcher(broken), store, ScriptedLlm())
    assert report.status == "SUCCEEDED" and len(report.saved) == 1
    assert report.errors == [{"url": missing_url, "message": f"{missing_url}: HTTP 404"}]
    assert (await run_row(conn, report.run_id))["errors"] == report.errors

    failed = await run_source(adapter_cls(), FixtureFetcher({}), store, ScriptedLlm())
    assert failed.status == "FAILED"
    assert (await run_row(conn, failed.run_id))["status"] == "FAILED"


async def test_inactive_source_is_skipped_without_a_run_record(
    db: tuple[Conn, type[OrnekAdapter]],
) -> None:
    conn, adapter_cls = db
    store = CampaignStore(conn)
    await run_source(adapter_cls(), FixtureFetcher(pages(adapter_cls)), store, ScriptedLlm())
    await conn.execute(
        'UPDATE "CampaignSource" SET "active" = false WHERE "adapter" = %s', (adapter_cls.adapter,)
    )
    llm = ScriptedLlm()
    report = await run_source(adapter_cls(), FixtureFetcher(pages(adapter_cls)), store, llm)
    assert report.status == "SKIPPED" and report.run_id is None and llm.prompts == []


async def test_load_catalog(db: tuple[Conn, type[OrnekAdapter]]) -> None:
    conn, _ = db
    category_id, merchant_id, slug = new_id(), new_id(), f"kat-{new_id()[:8]}"
    await conn.execute(
        'INSERT INTO "Category" ("id", "slug", "name") VALUES (%s, %s, %s)',
        (category_id, slug, "Test"),
    )
    await conn.execute(
        'INSERT INTO "Merchant" ("id", "name", "categoryId") VALUES (%s, %s, %s)',
        (merchant_id, f"Marka {slug}", category_id),
    )
    try:
        catalog = await CampaignStore(conn).load_catalog()
        assert catalog.categories[slug] == category_id
        assert catalog.merchants[f"Marka {slug}"] == merchant_id
    finally:
        await conn.execute('DELETE FROM "Merchant" WHERE "id" = %s', (merchant_id,))
        await conn.execute('DELETE FROM "Category" WHERE "id" = %s', (category_id,))
