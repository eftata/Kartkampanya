"""Bir kaynağın günlük taraması: liste → detay → değişiklik tespiti → çalıştırma kaydı.

Yeni ve değişen kampanyalar `pending` olarak döner; LLM ayıklama ve kayıt bir sonraki adımdır.
"""

from dataclasses import dataclass, field
from typing import Literal

from engine.pipeline.adapters.base import BankAdapter, RawCampaign
from engine.pipeline.changes import Change, classify, content_hash
from engine.pipeline.fetcher import Fetcher, FetchError
from engine.pipeline.store import CampaignStore, utcnow


@dataclass(frozen=True)
class Pending:
    """Ayıklanması gereken kampanya: yeni (campaign_id None) ya da metni değişmiş."""

    raw: RawCampaign
    raw_hash: str
    change: Change
    campaign_id: str | None


@dataclass
class RunReport:
    adapter: str
    status: Literal["SUCCEEDED", "FAILED", "SKIPPED"]
    run_id: str | None = None
    found: int = 0
    unchanged: int = 0
    pending: list[Pending] = field(default_factory=list)
    errors: list[dict[str, str]] = field(default_factory=list)


async def run_source(adapter: BankAdapter, fetcher: Fetcher, store: CampaignStore) -> RunReport:
    source_id, active = await store.ensure_source(
        adapter.adapter, adapter.program, adapter.list_url
    )
    if not active:
        return RunReport(adapter=adapter.adapter, status="SKIPPED")

    run_id = await store.start_run(source_id)
    report = RunReport(adapter=adapter.adapter, status="SUCCEEDED", run_id=run_id)
    try:
        urls = await adapter.list_urls(fetcher)
    except FetchError as error:
        report.status = "FAILED"
        report.errors.append({"url": adapter.list_url, "message": str(error)})
        await store.finish_run(run_id, "FAILED", found=0, changed=0, errors=report.errors)
        return report

    report.found = len(urls)
    for url in urls:
        try:
            raw = await adapter.fetch(fetcher, url)
        except FetchError as error:
            # Tek sayfanın hatası çalıştırmayı durdurmaz; kayda geçer.
            report.errors.append({"url": url, "message": str(error)})
            continue
        raw_hash = content_hash(raw)
        stored = await store.find_campaign(raw.source_url)
        change = classify(stored, raw_hash)
        seen_at = utcnow()
        if change is Change.UNCHANGED and stored:
            await store.touch_seen(stored.id, seen_at)
            report.unchanged += 1
            continue
        if change is Change.CHANGED and stored:
            await store.mark_changed(stored.id, raw, raw_hash, seen_at)
        report.pending.append(Pending(raw, raw_hash, change, stored.id if stored else None))

    await store.finish_run(
        run_id, "SUCCEEDED", found=report.found, changed=len(report.pending), errors=report.errors
    )
    return report
