"""Tahminlerin saklanması ve Markdown doğruluk raporu."""

from collections import Counter
from collections.abc import Sequence
from datetime import date

from pydantic import BaseModel, ConfigDict

from engine.evaluation.dataset import LabeledCase
from engine.evaluation.score import (
    CAMPAIGN_FIELDS,
    HEADLINE_FIELDS,
    RULE_FIELDS,
    TARGET,
    CaseScore,
    Summary,
    Value,
)
from engine.pipeline.extract import Extraction


class Prediction(BaseModel):
    """Bir vakanın ayıklama sonucu; `predictions.jsonl` satırı. Yeniden puanlama API çağırmaz."""

    model_config = ConfigDict(extra="forbid")

    id: str
    extraction: Extraction | None
    error: str | None = None
    model: str | None = None
    attempts: int = 0


FIELD_LABELS = {
    "join_method": "Katılım yöntemi",
    "join_deadline": "Son katılım",
    "threshold_type": "Eşik türü",
    "threshold_kurus": "Eşik tutarı",
    "txn_count": "İşlem adedi",
    "tier_repeat": "Eşik tekrarı",
    "reward_type": "Ödül türü",
    "reward_kurus": "Ödül tutarı",
    "reward_bps": "Ödül oranı",
    "cap_kurus": "Üst limit",
    "categories": "Kategoriler",
    "merchants": "Markalar",
    "exclusions": "Hariçler",
}


def percent(value: float | None) -> str:
    return "—" if value is None else f"%{value * 100:.1f}".replace(".", ",")


def show(value: Value) -> str:
    if isinstance(value, frozenset):
        return ", ".join(sorted(value)) or "(boş)"
    if value is None:
        return "yok"
    return str(value).replace("|", "\\|")


def render(
    summary: Summary,
    scores: Sequence[CaseScore],
    cases: Sequence[LabeledCase],
    *,
    model: str | None,
    today: date,
) -> str:
    sources = Counter(case.labeled_by for case in cases)
    verdict = "GEÇTİ" if summary.passed else "KALDI"
    lines = [
        "# Ayıklama doğruluğu raporu",
        "",
        f"- Tarih: {today.isoformat()}",
        f"- Model: {model or 'bilinmiyor'}",
        f"- Vaka: {summary.cases} (etiket: admin onayı {sources['admin']}, "
        f"elle {sources['elle']}); ayıklanamayan: {summary.failed}",
        "",
        "## Sonuç",
        "",
        f"**Eşik ve ödül alanları: {percent(summary.headline)}** "
        f"(hedef {percent(TARGET)}) — **{verdict}**",
        "",
        f"Kural alanlarının tümü: {percent(summary.accuracy(RULE_FIELDS))} · "
        f"kampanya alanları: {percent(summary.accuracy(CAMPAIGN_FIELDS))}",
        "",
        "## Alan bazında",
        "",
        "| Alan | Doğru | Toplam | Doğruluk |",
        "| --- | ---: | ---: | ---: |",
    ]
    for name in (*CAMPAIGN_FIELDS, *RULE_FIELDS):
        marker = " ★" if name in HEADLINE_FIELDS else ""
        lines.append(
            f"| {FIELD_LABELS[name]}{marker} | {summary.correct[name]} | {summary.total[name]} | "
            f"{percent(summary.accuracy([name]))} |"
        )
    lines += ["", "★ kabul ölçütüne giren alanlar (eşik ve ödül).", ""]

    wrong = [score for score in scores if score.misses]
    lines += ["## Hatalı vakalar", ""]
    if not wrong:
        lines.append("Hatalı vaka yok.")
    for score in wrong:
        lines += [
            f"### {score.case_id}",
            "",
            f"Kural: beklenen {score.expected_rules}, üretilen {score.predicted_rules}"
            + (f" · hata: {score.error}" if score.error else ""),
            "",
            "| Kural | Alan | Beklenen | Üretilen |",
            "| --- | --- | --- | --- |",
        ]
        for miss in score.misses:
            if miss.field in CAMPAIGN_FIELDS:
                rule = "—"
            else:
                rule = "fazladan" if miss.rule is None else str(miss.rule)
            lines.append(
                f"| {rule} | {FIELD_LABELS[miss.field]} | {show(miss.expected)} | "
                f"{show(miss.predicted)} |"
            )
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"
