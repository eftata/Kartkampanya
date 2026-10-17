"""Günlük veri hattı işi: `python -m engine.pipeline [adaptör ...]` (ad verilmezse hepsi).

Zamanlayıcı (cron) günde bir kez çalıştırır. Çıkış kodu: 0 = tüm kaynaklar çalıştı, 1 = en az
bir kaynağın liste sayfası alınamadı, 2 = bilinmeyen adaptör.
"""

import asyncio
import importlib
import pkgutil
import sys
from collections.abc import Sequence

import httpx2

from engine.pipeline import adapters
from engine.pipeline.adapters import ADAPTERS, get_adapter
from engine.pipeline.extract import anthropic_llm
from engine.pipeline.fetcher import PoliteFetcher
from engine.pipeline.run import run_source
from engine.pipeline.store import CampaignStore, connect
from engine.settings import get_settings


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
        return 0

    settings = get_settings()
    llm = anthropic_llm(settings)
    failed = False
    async with (
        httpx2.AsyncClient(timeout=30) as client,
        connect(settings) as conn,
    ):
        fetcher = PoliteFetcher(
            client,
            user_agent=settings.pipeline_user_agent,
            min_delay=settings.pipeline_min_delay_seconds,
        )
        store = CampaignStore(conn)
        for name in selected:
            report = await run_source(get_adapter(name), fetcher, store, llm)
            failed |= report.status == "FAILED"
            print(
                f"{name}: {report.status} · bulunan {report.found} · değişmeyen "
                f"{report.unchanged} · ayıklanan {len(report.saved)}/{len(report.pending)} · "
                f"hata {len(report.errors)}"
            )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
