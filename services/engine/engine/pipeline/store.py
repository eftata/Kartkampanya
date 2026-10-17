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
from engine.pipeline.extract import Catalog, ExtractionResult
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

    async def labeled_campaigns(self, status: str, limit: int) -> list[dict[str, Any]]:
        """Değerlendirme seti için: durumdaki kampanyalar + kuralları + program slug'ı.

        En son güncellenenler önce (onay kuyruğunda yeni düzeltilmiş olanlar).
        """
        cursor = await self._conn.execute(
            'SELECT c."id", c."sourceUrl", c."title", c."rawText", c."startsAt", c."endsAt", '
            'c."joinMethod"::text AS "joinMethod", c."joinDeadline", p."slug" AS "programSlug" '
            'FROM "Campaign" c JOIN "Program" p ON p."id" = c."programId" '
            'WHERE c."status" = %s::"CampaignStatus" ORDER BY c."updatedAt" DESC LIMIT %s',
            (status, limit),
        )
        campaigns = await cursor.fetchall()
        cursor = await self._conn.execute(
            'SELECT "campaignId", "categoryIds", "merchantIds", '
            '"thresholdType"::text AS "thresholdType", "thresholdKurus", "txnCount", '
            '"tierRepeat", "rewardType"::text AS "rewardType", "rewardKurus", "rewardBps", '
            '"capKurus", "exclusions" FROM "CampaignRule" WHERE "campaignId" = ANY(%s) '
            'ORDER BY "id"',
            ([row["id"] for row in campaigns],),
        )
        rules: dict[str, list[dict[str, Any]]] = {}
        for rule in await cursor.fetchall():
            rules.setdefault(rule["campaignId"], []).append(rule)
        return [row | {"rules": rules.get(row["id"], [])} for row in campaigns]

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

    async def expire_campaigns(self, today: date) -> int:
        """Bitiş günü geçmiş (endsAt < bugün) onaylı ve taslak kampanyaları EXPIRED yapar.

        `endsAt` kampanyanın son günüdür (dahil). Reddedilenlere dokunulmaz. Kaç kampanyanın
        kapandığını döner. Metni sonradan değişen kampanya veri hattında yeniden DRAFT olabilir;
        ertesi gece yine kapanır.
        """
        cursor = await self._conn.execute(
            'UPDATE "Campaign" SET "status" = \'EXPIRED\', "updatedAt" = %s '
            "WHERE \"endsAt\" < %s AND \"status\" IN ('APPROVED', 'DRAFT')",
            (utcnow(), _day(today)),
        )
        return cursor.rowcount

    async def mark_changed(self, campaign_id: str, seen_at: datetime) -> None:
        """Metni değişen kampanya hemen yayından kalkar (DRAFT).

        Yeni metin ve özet burada YAZILMAZ: ayıklama başarılı olunca `save_extraction` kurallarla
        aynı işlemde yazar. Ayıklama başarısız olursa eski özet kalır ve kampanya ertesi
        çalıştırmada yine "değişti" sayılıp yeniden denenir (ADR 0011).
        """
        await self._conn.execute(
            'UPDATE "Campaign" SET "status" = \'DRAFT\', "lastSeenAt" = %s, "updatedAt" = %s '
            'WHERE "id" = %s',
            (seen_at, seen_at, campaign_id),
        )

    async def save_extraction(
        self,
        *,
        source_id: str,
        campaign_id: str | None,
        raw: RawCampaign,
        raw_hash: str,
        result: ExtractionResult,
        seen_at: datetime,
    ) -> str:
        """Ayıklanan kampanyayı ve kurallarını tek işlemde DRAFT olarak yazar; kampanya id'si döner.

        Yeni kampanya (`campaign_id` None) için tarih aralığı zorunludur. Var olan kampanyada eski
        kurallar silinip yenileri yazılır; okunamayan tarih eskisini korur. Kart kapsamı
        (`CampaignCard`) LLM'den gelmez: boş = programdaki tüm kartlar, admin daraltır.
        """
        extraction = result.extraction
        starts_at = _day(raw.starts_at) if raw.starts_at else None
        ends_at = _day(raw.ends_at) if raw.ends_at else None
        join_deadline = _day(extraction.join_deadline) if extraction.join_deadline else None
        fields = (
            raw.title,
            raw.raw_text,
            raw_hash,
            extraction.summary,
            extraction.join_method,
            join_deadline,
            extraction.confidence,
            extraction.uncertain_fields,
        )
        async with self._conn.transaction():
            if campaign_id is None:
                if starts_at is None or ends_at is None:
                    raise ValueError("Yeni kampanyanın tarih aralığı okunamadı.")
                campaign_id = new_id()
                await self._conn.execute(
                    'INSERT INTO "Campaign" ("id", "programId", "sourceId", "sourceUrl", '
                    '"title", "rawText", "rawHash", "summary", "joinMethod", "joinDeadline", '
                    '"confidence", "uncertainFields", "startsAt", "endsAt", "status", '
                    '"lastSeenAt", "createdAt", "updatedAt") '
                    'SELECT %s, "programId", "id", %s, '
                    "%s, %s, %s, %s, %s::\"JoinMethod\", %s, %s, %s, %s, %s, 'DRAFT', %s, %s, %s "
                    'FROM "CampaignSource" WHERE "id" = %s',
                    (
                        campaign_id,
                        raw.source_url,
                        *fields,
                        starts_at,
                        ends_at,
                        seen_at,
                        seen_at,
                        seen_at,
                        source_id,
                    ),
                )
            else:
                await self._conn.execute(
                    'UPDATE "Campaign" SET "title" = %s, "rawText" = %s, "rawHash" = %s, '
                    '"summary" = %s, "joinMethod" = %s::"JoinMethod", "joinDeadline" = %s, '
                    '"confidence" = %s, "uncertainFields" = %s, '
                    '"startsAt" = COALESCE(%s, "startsAt"), "endsAt" = COALESCE(%s, "endsAt"), '
                    '"status" = \'DRAFT\', "lastSeenAt" = %s, "updatedAt" = %s WHERE "id" = %s',
                    (*fields, starts_at, ends_at, seen_at, seen_at, campaign_id),
                )
                await self._conn.execute(
                    'DELETE FROM "CampaignRule" WHERE "campaignId" = %s', (campaign_id,)
                )
            for rule in result.rules:
                await self._conn.execute(
                    'INSERT INTO "CampaignRule" ("id", "campaignId", "categoryIds", '
                    '"merchantIds", "thresholdType", "thresholdKurus", "txnCount", "tierRepeat", '
                    '"rewardType", "rewardKurus", "rewardBps", "capKurus", "exclusions") '
                    'VALUES (%s, %s, %s, %s, %s::"Threshold", %s, %s, %s, %s::"Reward", '
                    "%s, %s, %s, %s)",
                    (
                        new_id(),
                        campaign_id,
                        rule.category_ids,
                        rule.merchant_ids,
                        rule.threshold_type,
                        rule.threshold_kurus,
                        rule.txn_count,
                        rule.tier_repeat,
                        rule.reward_type,
                        rule.reward_kurus,
                        rule.reward_bps,
                        rule.cap_kurus,
                        rule.exclusions,
                    ),
                )
        return campaign_id
