"""Değerlendirme seti, puanlama, rapor ve CLI. Vakalar SENTETİK; ağa ve API'ye çıkılmaz."""

import json
from datetime import date
from pathlib import Path
from typing import Any

import pytest

from engine.evaluation.__main__ import main
from engine.evaluation.dataset import (
    Expected,
    LabeledCase,
    eval_catalog,
    load_cases,
    write_case,
    write_catalog,
)
from engine.evaluation.evaluate import (
    case_id,
    predict,
    read_predictions,
    score_all,
    write_predictions,
)
from engine.evaluation.report import Prediction, render
from engine.evaluation.score import FAILED, NO_RULE, match_rules, score_case, summarize
from engine.pipeline.extract import ExtractedRule, Extraction
from tests.ornek import ORNEK_EXTRACTION, ScriptedLlm

CATALOG = eval_catalog(["market", "akaryakit"], ["Migros", "Opet"])


def rule(**overrides: Any) -> ExtractedRule:
    base = dict(ORNEK_EXTRACTION["rules"][0]) | {"categories": ["market"]}
    return ExtractedRule.model_validate(base | overrides)


def expected(*rules: ExtractedRule) -> Expected:
    return Expected(join_method="APP", join_deadline=date(2026, 11, 30), rules=list(rules))


def extraction(*rules: ExtractedRule, join_method: str = "APP") -> Extraction:
    return Extraction.model_validate(
        {
            "join_method": join_method,
            "join_deadline": "2026-11-30",
            "summary": ["Özet"],
            "rules": [r.model_dump() for r in rules],
            "confidence": 0.8,
            "uncertain_fields": [],
        }
    )


def case(cid: str, *rules: ExtractedRule, synthetic: bool = True) -> LabeledCase:
    return LabeledCase(
        id=cid,
        source_url=f"https://ornek-banka.test/{cid}",
        title="SENTETİK kampanya",
        starts_at=date(2026, 11, 1),
        ends_at=date(2026, 11, 30),
        raw_text="SENTETİK: markette toplam 2.500 TL harcamaya 100 TL puan.",
        expected=expected(*rules),
        labeled_by="elle",
        synthetic=synthetic,
    )


# ---------- Eşleme ve puanlama ----------


def test_rules_are_matched_regardless_of_order() -> None:
    market, fuel = rule(), rule(categories=["akaryakit"], reward_kurus=5000)
    assert match_rules([market, fuel], [fuel, market]) == [(0, 1), (1, 0)]
    assert match_rules([market, fuel], [fuel]) == [(1, 0), (0, None)]
    assert match_rules([market], [fuel, market]) == [(0, 1), (None, 0)]


def test_perfect_prediction_scores_every_field() -> None:
    market, fuel = rule(), rule(categories=["akaryakit"], reward_kurus=5000)
    score = score_case("x", expected(market, fuel), extraction(fuel, market))
    assert score.misses == []
    assert sum(score.total.values()) == 2 + 2 * 11  # 2 kampanya alanı + 2 kural, her biri 11 alan
    assert summarize([score]).headline == 1.0


def test_wrong_field_is_reported_with_both_values() -> None:
    score = score_case("x", expected(rule()), extraction(rule(cap_kurus=50000)))
    assert [(m.rule, m.field, m.expected, m.predicted) for m in score.misses] == [
        (1, "cap_kurus", 30000, 50000)
    ]
    summary = summarize([score])
    assert summary.headline == 7 / 8
    assert summary.passed  # %87,5 ≥ %85


def test_missing_and_extra_rules_count_as_errors_even_for_empty_fields() -> None:
    # Beklenen kuralın üst limiti yok (None); kural hiç üretilmediyse bu "doğru" sayılmamalı.
    no_cap = rule(cap_kurus=None)
    missing = score_case("x", expected(rule(), no_cap), extraction(rule()))
    assert missing.correct["cap_kurus"] == 1 and missing.total["cap_kurus"] == 2
    assert any(m.expected is None and m.predicted == NO_RULE for m in missing.misses)

    extra = score_case("x", expected(rule()), extraction(rule(), no_cap))
    assert extra.total["reward_type"] == 2 and extra.correct["reward_type"] == 1
    assert all(m.rule is None and m.expected == NO_RULE for m in extra.misses)


def test_failed_extraction_fails_every_field() -> None:
    score = score_case("x", expected(rule(cap_kurus=None)), None, "LLM isteği reddetti")
    assert sum(score.correct.values()) == 0
    assert {m.predicted for m in score.misses} == {FAILED}
    assert summarize([score]).failed == 1


def test_passes_at_target() -> None:
    perfect = [score_case(f"c{i}", expected(rule()), extraction(rule())) for i in range(9)]
    one_off = score_case("c9", expected(rule()), extraction(rule(reward_kurus=1)))
    summary = summarize([*perfect, one_off])
    assert summary.headline == pytest.approx(79 / 80)
    assert summary.passed
    worse = summarize(
        [
            score_case(
                "w", expected(rule()), extraction(rule(reward_type="CASHBACK", reward_kurus=1))
            )
        ]
    )
    assert worse.headline == 6 / 8 and not worse.passed


# ---------- Set dosyaları ----------


def test_case_files_round_trip_and_are_checked_against_the_catalog(tmp_path: Path) -> None:
    write_catalog(tmp_path, CATALOG)
    write_case(tmp_path, case("ornek-market", rule(merchants=["Migros"])))
    loaded = load_cases(tmp_path, CATALOG)
    assert [c.id for c in loaded] == ["ornek-market"]
    assert loaded[0].expected.rules[0].merchants == ["Migros"]

    data = json.loads((tmp_path / "cases" / "ornek-market.json").read_text())
    data["expected"]["rules"][0]["categories"] = ["kozmetik"]
    (tmp_path / "cases" / "ornek-market.json").write_text(json.dumps(data))
    with pytest.raises(ValueError, match="katalogda olmayan kategori"):
        load_cases(tmp_path, CATALOG)

    (tmp_path / "cases" / "ornek-market.json").rename(tmp_path / "cases" / "baska-ad.json")
    data["expected"]["rules"][0]["categories"] = ["market"]
    (tmp_path / "cases" / "baska-ad.json").write_text(json.dumps(data))
    with pytest.raises(ValueError, match="dosya adı"):
        load_cases(tmp_path, CATALOG)


def test_case_id_is_readable_and_stable() -> None:
    cid = case_id("bonus", "Şık Giyim'de İlk Alışverişe %10 İade!", "https://x.test/a")
    assert cid.startswith("bonus-sik-giyim-de-ilk-alisverise-10-")
    assert cid == case_id("bonus", "Şık Giyim'de İlk Alışverişe %10 İade!", "https://x.test/a")
    assert cid != case_id("bonus", "Şık Giyim'de İlk Alışverişe %10 İade!", "https://x.test/b")


# ---------- Çalıştırma, rapor, CLI ----------


@pytest.mark.anyio
async def test_predict_and_render_report(tmp_path: Path) -> None:
    cases = [case("dogru", rule(categories=[])), case("yanlis", rule(categories=[], cap_kurus=99))]
    predictions = await predict(cases, CATALOG, ScriptedLlm())
    assert [p.model for p in predictions] == ["fake", "fake"]
    write_predictions(tmp_path / "p.jsonl", predictions)
    assert read_predictions(tmp_path / "p.jsonl") == predictions

    scores = score_all(cases, predictions)
    report = render(summarize(scores), scores, cases, model="fake", today=date(2026, 10, 17))
    assert "**Eşik ve ödül alanları: %93,8** (hedef %85,0) — **GEÇTİ**" in report
    assert "### yanlis" in report and "### dogru" not in report
    assert "| 1 | Üst limit | 99 | 30000 |" in report


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def test_cli_scores_saved_predictions(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--dir", str(tmp_path), "score"]) == 2  # katalog yok
    write_catalog(tmp_path, CATALOG)
    write_case(tmp_path, case("sentetik", rule()))
    assert main(["--dir", str(tmp_path), "score"]) == 2  # yalnızca sentetik vaka var

    write_case(tmp_path, case("gercek", rule(), synthetic=False))
    assert main(["--dir", str(tmp_path), "score"]) == 2  # tahmin yok
    write_predictions(
        tmp_path / "predictions.jsonl",
        [Prediction(id="gercek", extraction=extraction(rule()), model="fake")],
    )
    assert main(["--dir", str(tmp_path), "score"]) == 0
    assert "1 vaka · eşik ve ödül alanları %100,0" in capsys.readouterr().out
    assert "GEÇTİ" in (tmp_path / "report.md").read_text()

    write_predictions(
        tmp_path / "predictions.jsonl",
        [Prediction(id="gercek", extraction=None, error="LLM isteği reddetti")],
    )
    assert main(["--dir", str(tmp_path), "score"]) == 1
    assert "KALDI" in (tmp_path / "report.md").read_text()
