"""Veri hattının veritabanı erişimi. Python tarafındaki TEK SQL modülü (ADR 0009).

Şemanın sahibi Prisma'dır; burada şema değişmez. Sütunlar Prisma adlarıyla (çift tırnaklı
camelCase) yazılır. Prisma'nın uygulama tarafında ürettiği değerler (`id` = cuid, `@updatedAt`)
veritabanında varsayılan değildir; burada açıkça verilir.
"""

import uuid
from collections.abc import AsyncIterator, Mapping, Sequence
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime
from typing import Any, Literal

import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from engine.pipeline.adapters.base import RawCampaign
from engine.pipeline.changes import StoredCampaign
from engine.pipeline.extract import Catalog
from engine.settings import Settings

RunStatus = Literal["SUCCEEDED", "FAILED"]


def new_id() -> str:
    """Prisma'nın cuid'i yerine; sütun metin, benzersizlik yeterli."""
    return uuid.uuid4().hex


def utcnow() -> datetime:
    """Prisma TIMESTAMP(3) sütunlarına UTC, saat dilimsiz yazar."""
    return datetime.now(UTC).replace(tzinfo=None, microsecond=0)


def _day(value: date) -> datetime:
    return datetime(value.year, value.month, value.day)


@asynccontextmanager
async def connect(settings: Settings) -> AsyncIterator[psycopg.AsyncConnection[dict[str, Any]]]:
    dsn, schema = settings.postgres_dsn()
    # autocommit: her kampanya kendi işlemi; çalıştırma yarıda kesilse de ilerleme kaybolmaz.
    async with await psycopg.AsyncConnection.connect(
        dsn, autocommit=True, row_factory=dict_row
    ) as conn:
        await conn.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
        yield conn


class SourceNotFound(Exception):
    """Adaptörün programı katalogda yok (Program.slug)."""


class CampaignStore:
    def __init__(self, conn: psycopg.AsyncConnection[dict[str, Any]]) -> None:
        self._conn = conn

    async def _one(
        self, query: str, params: Sequence[Any] | Mapping[str, Any]
    ) -> dict[str, Any] | None:
        cursor = await self._conn.execute(query, params)
        return await cursor.fetchone()

    # ---------- Katalog ----------

    async def load_catalog(self) -> Catalog:
        """LLM isteminde verilen seçenekler: tüm kategori slug'ları ve marka adları."""
        cursor = await self._conn.execute('SELECT "id", "slug" FROM "Category"')
        categories = {row["slug"]: row["id"] for row in await cursor.fetchall()}
        cursor = await self._conn.execute('SELECT "id", "name" FROM "Merchant"')
        merchants = {row["name"]: row["id"] for row in await cursor.fetchall()}
        return Catalog(categories=categories, merchants=merchants)

    # ---------- Kaynak ve çalıştırma ----------

    async def ensure_source(
        self, adapter: str, program_slug: str, list_url: str
    ) -> tuple[str, bool]:
        """Adaptörün kaynak kaydını bulur, yoksa oluşturur. (kaynak id, etkin mi)."""
        row = await self._one(
            'SELECT "id", "active" FROM "CampaignSource" WHERE "adapter" = %s', (adapter,)
        )
        if row:
            return row["id"], row["active"]
        program = await self._one('SELECT "id" FROM "Program" WHERE "slug" = %s', (program_slug,))
        if not program:
            raise SourceNotFound(f"Program bulunamadı: {program_slug}")
        # Eşzamanlı ilk çalıştırmada çakışırsa mevcut kayıt döner.
        row = await self._one(
            'INSERT INTO "CampaignSource" ("id", "programId", "adapter", "listUrl") '
            "VALUES (%s, %s, %s, %s) "
            'ON CONFLICT ("adapter") DO UPDATE SET "adapter" = EXCLUDED."adapter" '
            'RETURNING "id", "active"',
            (new_id(), program["id"], adapter, list_url),
        )
        if row is None:
            raise RuntimeError("Kaynak kaydı oluşturulamadı.")
        return row["id"], row["active"]

    async def start_run(self, source_id: str) -> str:
        run_id = new_id()
        await self._conn.execute(
            'INSERT INTO "PipelineRun" ("id", "sourceId", "status", "startedAt") '
            "VALUES (%s, %s, 'RUNNING', %s)",
            (run_id, source_id, utcnow()),
        )
        return run_id

    async def finish_run(
        self,
        run_id: str,
        status: RunStatus,
        *,
        found: int,
        changed: int,
        errors: list[dict[str, str]],
    ) -> None:
        await self._conn.execute(
            'UPDATE "PipelineRun" SET "status" = %s::"PipelineRunStatus", "finishedAt" = %s, '
            '"found" = %s, "changed" = %s, "errors" = %s WHERE "id" = %s',
            (status, utcnow(), found, changed, Jsonb(errors) if errors else None, run_id),
        )

    # ---------- Kampanya ----------

    async def find_campaign(self, source_url: str) -> StoredCampaign | None:
        row = await self._one(
            'SELECT "id", "rawHash", "status"::text AS "status" FROM "Campaign" '
            'WHERE "sourceUrl" = %s',
            (source_url,),
        )
        return StoredCampaign(row["id"], row["rawHash"], row["status"]) if row else None

    async def touch_seen(self, campaign_id: str, seen_at: datetime) -> None:
        await self._conn.execute(
            'UPDATE "Campaign" SET "lastSeenAt" = %s WHERE "id" = %s', (seen_at, campaign_id)
        )

    async def mark_changed(
        self, campaign_id: str, raw: RawCampaign, raw_hash: str, seen_at: datetime
    ) -> None:
        """Metni değişen kampanya: yeni metin yazılır ve yeniden onaya düşer (DRAFT).

        Eski kurallar yeniden ayıklamaya kadar kalır ama DRAFT kampanya kullanıcıya görünmez.
        Tarih okunamadıysa mevcut tarih korunur (sütunlar boş olamaz).
        """
        await self._conn.execute(
            'UPDATE "Campaign" SET "title" = %s, "rawText" = %s, "rawHash" = %s, '
            '"startsAt" = COALESCE(%s, "startsAt"), "endsAt" = COALESCE(%s, "endsAt"), '
            '"status" = \'DRAFT\', "lastSeenAt" = %s, "updatedAt" = %s WHERE "id" = %s',
            (
                raw.title,
                raw.raw_text,
                raw_hash,
                _day(raw.starts_at) if raw.starts_at else None,
                _day(raw.ends_at) if raw.ends_at else None,
                seen_at,
                seen_at,
                campaign_id,
            ),
        )
