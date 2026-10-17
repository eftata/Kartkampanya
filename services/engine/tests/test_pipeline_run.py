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
from tests.ornek import FixtureFetcher, OrnekAdapter

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


async def save_as_extracted(conn: Conn, adapter_cls: type[OrnekAdapter], report: Any) -> None:
    """Ayıklama adımı henüz yok: bekleyen kampanyaları ayıklanmış gibi kaydeder (ilki onaylı)."""
    source = await (
        await conn.execute(
            'SELECT "id", "programId" FROM "CampaignSource" WHERE "adapter" = %s',
            (adapter_cls.adapter,),
        )
    ).fetchone()
    assert source
    for index, item in enumerate(report.pending):
        await conn.execute(
            'INSERT INTO "Campaign" ("id", "programId", "sourceId", "title", "sourceUrl", '
            '"rawText", "rawHash", "startsAt", "endsAt", "joinMethod", "status", "updatedAt") '
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'APP', %s::\"CampaignStatus\", now())",
            (
                new_id(),
                source["programId"],
                source["id"],
                item.raw.title,
                item.raw.source_url,
                item.raw.raw_text,
                item.raw_hash,
                datetime(2026, 11, 1),
                datetime(2026, 11, 30),
                "APPROVED" if index == 0 else "DRAFT",
            ),
        )


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


async def test_first_run_registers_source_and_marks_everything_new(
    db: tuple[Conn, type[OrnekAdapter]],
) -> None:
    conn, adapter_cls = db
    report = await run_source(
        adapter_cls(), FixtureFetcher(pages(adapter_cls)), CampaignStore(conn)
    )
    assert report.status == "SUCCEEDED"
    assert report.found == 2 and report.unchanged == 0
    assert [p.change for p in report.pending] == [Change.NEW, Change.NEW]
    assert all(p.campaign_id is None for p in report.pending)
    row = await run_row(conn, report.run_id)
    assert row["status"] == "SUCCEEDED" and row["found"] == 2 and row["changed"] == 2
    assert row["finishedAt"] is not None


async def test_unchanged_text_is_not_reextracted_and_changed_text_goes_back_to_draft(
    db: tuple[Conn, type[OrnekAdapter]],
) -> None:
    conn, adapter_cls = db
    store = CampaignStore(conn)
    first = await run_source(adapter_cls(), FixtureFetcher(pages(adapter_cls)), store)
    await save_as_extracted(conn, adapter_cls, first)

    second = await run_source(adapter_cls(), FixtureFetcher(pages(adapter_cls)), store)
    assert second.unchanged == 2 and second.pending == []
    assert (await run_row(conn, second.run_id))["changed"] == 0

    # Onaylı kampanyanın (ilk) metni değişir → DRAFT'a çekilir ve yeniden ayıklanmak üzere döner.
    approved_url = first.pending[0].raw.source_url
    changed_pages = pages(adapter_cls)
    changed_pages[approved_url] = changed_pages[approved_url].replace(
        "En fazla 300 TL", "En fazla 500 TL"
    )
    third = await run_source(adapter_cls(), FixtureFetcher(changed_pages), store)
    assert third.unchanged == 1
    assert [(p.change, p.raw.source_url) for p in third.pending] == [(Change.CHANGED, approved_url)]
    assert third.pending[0].campaign_id is not None

    row = await (
        await conn.execute(
            'SELECT "status"::text AS "status", "rawText", "rawHash" FROM "Campaign" '
            'WHERE "sourceUrl" = %s',
            (approved_url,),
        )
    ).fetchone()
    assert row and row["status"] == "DRAFT"
    assert "En fazla 500 TL" in row["rawText"]
    assert row["rawHash"] == third.pending[0].raw_hash


async def test_page_errors_are_recorded_and_list_errors_fail_the_run(
    db: tuple[Conn, type[OrnekAdapter]],
) -> None:
    conn, adapter_cls = db
    store = CampaignStore(conn)
    broken = pages(adapter_cls)
    missing_url = next(url for url in broken if url.endswith("akaryakit"))
    del broken[missing_url]
    report = await run_source(adapter_cls(), FixtureFetcher(broken), store)
    assert report.status == "SUCCEEDED" and len(report.pending) == 1
    assert report.errors == [{"url": missing_url, "message": f"{missing_url}: HTTP 404"}]
    assert (await run_row(conn, report.run_id))["errors"] == report.errors

    failed = await run_source(adapter_cls(), FixtureFetcher({}), store)
    assert failed.status == "FAILED"
    assert (await run_row(conn, failed.run_id))["status"] == "FAILED"


async def test_inactive_source_is_skipped_without_a_run_record(
    db: tuple[Conn, type[OrnekAdapter]],
) -> None:
    conn, adapter_cls = db
    store = CampaignStore(conn)
    await run_source(adapter_cls(), FixtureFetcher(pages(adapter_cls)), store)
    await conn.execute(
        'UPDATE "CampaignSource" SET "active" = false WHERE "adapter" = %s', (adapter_cls.adapter,)
    )
    report = await run_source(adapter_cls(), FixtureFetcher(pages(adapter_cls)), store)
    assert report.status == "SKIPPED" and report.run_id is None
