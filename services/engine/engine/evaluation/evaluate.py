"""Setin çıkarılması (export), ayıklamanın çalıştırılması (run) ve puanlama (score)."""

import hashlib
import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from engine.evaluation.dataset import Expected, LabeledCase, write_case, write_catalog
from engine.evaluation.report import Prediction
from engine.evaluation.score import CaseScore, score_case
from engine.pipeline.extract import Catalog, ExtractedRule, ExtractionError, LlmClient, extract
from engine.pipeline.store import CampaignStore

_TR = str.maketrans("çğıöşüÇĞİÖŞÜâîû", "cgiosuCGIOSUaiu")


def case_id(program_slug: str, title: str, source_url: str) -> str:
    """Okunur ve kararlı: program + başlığın ilk kelimeleri + adresin kısa özeti."""
    words = re.sub(r"[^a-z0-9]+", "-", title.translate(_TR).lower()).strip("-")
    short = "-".join(words.split("-")[:6]) or "kampanya"
    digest = hashlib.sha256(source_url.encode()).hexdigest()[:6]
    return f"{program_slug}-{short}-{digest}"


def _day(value: datetime | None) -> Any:
    return value.date() if value else None


@dataclass
class ExportResult:
    written: list[Path]
    skipped: list[str]  # dosyası zaten olan (elle düzeltilmiş olabilir; ezilmez)
    invalid: list[str]  # katalogdan silinmiş kategori/marka ya da geçersiz kural


async def export_cases(
    store: CampaignStore, directory: Path, *, status: str, limit: int, force: bool = False
) -> ExportResult:
    """Onaylanmış kampanyaları etiketli vaka olarak yazar; kataloğu `catalog.json`'a döker.

    Onaylı kural = admin'in ham metinle karşılaştırıp doğruladığı etiket (`labeled_by="admin"`).
    """
    catalog = await store.load_catalog()
    eval_catalog = Catalog(
        categories={slug: slug for slug in catalog.categories},
        merchants={name: name for name in catalog.merchants},
    )
    write_catalog(directory, eval_catalog)
    category_slug = {id_: slug for slug, id_ in catalog.categories.items()}
    merchant_name = {id_: name for name, id_ in catalog.merchants.items()}

    result = ExportResult(written=[], skipped=[], invalid=[])
    for row in await store.labeled_campaigns(status, limit):
        cid = case_id(row["programSlug"], row["title"], row["sourceUrl"])
        if (directory / "cases" / f"{cid}.json").exists() and not force:
            result.skipped.append(cid)
            continue
        try:
            rules = [
                ExtractedRule.model_validate(
                    {
                        "categories": [category_slug[i] for i in rule["categoryIds"]],
                        "merchants": [merchant_name[i] for i in rule["merchantIds"]],
                        "threshold_type": rule["thresholdType"],
                        "threshold_kurus": rule["thresholdKurus"],
                        "txn_count": rule["txnCount"],
                        "tier_repeat": rule["tierRepeat"],
                        "reward_type": rule["rewardType"],
                        "reward_kurus": rule["rewardKurus"],
                        "reward_bps": rule["rewardBps"],
                        "cap_kurus": rule["capKurus"],
                        "exclusions": rule["exclusions"],
                    }
                )
                for rule in row["rules"]
            ]
            case = LabeledCase(
                id=cid,
                source_url=row["sourceUrl"],
                title=row["title"],
                starts_at=_day(row["startsAt"]),
                ends_at=_day(row["endsAt"]),
                raw_text=row["rawText"],
                expected=Expected(
                    join_method=row["joinMethod"],
                    join_deadline=_day(row["joinDeadline"]),
                    rules=rules,
                ),
                labeled_by="admin",
            )
        except (KeyError, ValueError):
            result.invalid.append(cid)
            continue
        result.written.append(write_case(directory, case))
    return result


async def predict(
    cases: Sequence[LabeledCase], catalog: Catalog, llm: LlmClient
) -> list[Prediction]:
    """Her vaka için üretimdeki ayıklamanın aynısı (istem, şema, yeniden deneme)."""
    predictions = []
    for case in cases:
        try:
            result = await extract(case.raw(), catalog, llm)
        except ExtractionError as error:
            predictions.append(Prediction(id=case.id, extraction=None, error=str(error)))
            continue
        predictions.append(
            Prediction(
                id=case.id,
                extraction=result.extraction,
                model=result.model,
                attempts=result.attempts,
            )
        )
    return predictions


def score_all(cases: Sequence[LabeledCase], predictions: Sequence[Prediction]) -> list[CaseScore]:
    by_id = {prediction.id: prediction for prediction in predictions}
    scores = []
    for case in cases:
        prediction = by_id.get(case.id)
        if prediction is None:
            scores.append(
                score_case(case.id, case.expected, None, "tahmin yok (run çalıştırılmadı)")
            )
        else:
            scores.append(
                score_case(case.id, case.expected, prediction.extraction, prediction.error)
            )
    return scores


def write_predictions(path: Path, predictions: Sequence[Prediction]) -> None:
    path.write_text(
        "".join(prediction.model_dump_json() + "\n" for prediction in predictions),
        encoding="utf-8",
    )


def read_predictions(path: Path) -> list[Prediction]:
    return [
        Prediction.model_validate_json(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
