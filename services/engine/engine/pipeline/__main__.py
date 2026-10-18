"""Günlük veri hattı işi: `python -m engine.pipeline [adaptör ...]` (ad verilmezse hepsi).

Zamanlayıcı (cron) günde bir kez çalıştırır: tarama → ayıklama → kayıt, ardından süresi dolan
kampanyaları kapatma (EXPIRED). Çıkış kodu: 0 = tüm kaynaklar çalıştı, 1 = en az
bir kaynağın liste sayfası alınamadı, 2 = bilinmeyen adaptör.
"""

import asyncio
import importlib
import pkgutil
import sys
from collections.abc import Sequence
from datetime import date, datetime, timedelta, timezone

import httpx2

from engine.pipeline import adapters
from engine.pipeline.adapters import ADAPTERS, get_adapter
from engine.pipeline.extract import anthropic_llm
from engine.pipeline.fetcher import PoliteFetcher
from engine.pipeline.run import run_source
from engine.pipeline.store import CampaignStore, connect
from engine.settings import Settings, get_settings
from engine.telemetry import init_sentry

TURKEY = timezone(timedelta(hours=3))


def load_adapters() -> None:
    """`adapters/` altındaki modülleri içe aktarır; `@register` onları ADAPTERS'a ekler."""
    for module in pkgutil.iter_modules(adapters.__path__):
        if module.name != "base":
            importlib.import_module(f"{adapters.__name__}.{module.name}")


async def main(names: Sequence[str]) -> int:
    load_adapters()
    unknown = [name for name in names if name not in ADAPTERS]
    if unknown:
        print(f"Bilinmeyen adaptör: {', '.join(unknown)}", file=sys.stderr)
        return 2
    selected = list(names) or sorted(ADAPTERS)
    if not selected:
        print("Kayıtlı adaptör yok.")

    settings = get_settings()
    init_sentry(settings)
    failed = False
    async with connect(settings) as conn:
        store = CampaignStore(conn)
        if selected:
            failed = await crawl(selected, store, settings)
        # Tarama sonrası: metni değişip yeniden DRAFT olmuş süresi geçmiş kampanyalar da kapanır.
        expired = await store.expire_campaigns(turkey_today())
        print(f"Süresi dolan kampanya: {expired}")
    return 1 if failed else 0


def turkey_today() -> date:
    """Kampanya tarihleri Türkiye takvim günüdür (UTC+3, yaz saati uygulaması yok)."""
    return datetime.now(TURKEY).date()


async def crawl(selected: Sequence[str], store: CampaignStore, settings: Settings) -> bool:
    """Seçilen adaptörleri sırayla çalıştırır; liste sayfası alınamayan varsa True."""
    llm = anthropic_llm(settings)
    failed = False
    async with httpx2.AsyncClient(timeout=30) as client:
        fetcher = PoliteFetcher(
            client,
            user_agent=settings.pipeline_user_agent,
            min_delay=settings.pipeline_min_delay_seconds,
        )
        for name in selected:
            report = await run_source(get_adapter(name), fetcher, store, llm)
            failed |= report.status == "FAILED"
            print(
                f"{name}: {report.status} · bulunan {report.found} · değişmeyen "
                f"{report.unchanged} · ayıklanan {len(report.saved)}/{len(report.pending)} · "
                f"hata {len(report.errors)}"
            )
    return failed


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
