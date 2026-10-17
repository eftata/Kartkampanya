"""Alan bazında puanlama: beklenen kurallar ↔ tahmin edilen kurallar.

Kurallar sıradan bağımsız eşlenir (en çok alanı tutan eşleme). Eşlenemeyen beklenen kuralın ve
fazladan üretilen kuralın her alanı hata sayılır: eksik kural da uydurma kural da kullanıcıya yanlış
plan demektir. Ayıklama başarısızsa vakanın bütün alanları hatadır.

Kabul ölçütü (ROADMAP Sprint 2): eşik ve ödül alanlarında ≥ %85 doğruluk.
"""

import itertools
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date

from engine.evaluation.dataset import Expected
from engine.pipeline.extract import ExtractedRule, Extraction

THRESHOLD_FIELDS = ("threshold_type", "threshold_kurus", "txn_count", "tier_repeat")
REWARD_FIELDS = ("reward_type", "reward_kurus", "reward_bps", "cap_kurus")
SCOPE_FIELDS = ("categories", "merchants", "exclusions")  # küme olarak karşılaştırılır
RULE_FIELDS = THRESHOLD_FIELDS + REWARD_FIELDS + SCOPE_FIELDS
HEADLINE_FIELDS = THRESHOLD_FIELDS + REWARD_FIELDS
CAMPAIGN_FIELDS = ("join_method", "join_deadline")
TARGET = 0.85

Value = str | int | bool | date | frozenset[str] | None

# Karşı tarafta değer yokken kullanılan işaretler: beklenen `None` (ör. üst limit yok) ile
# "kural hiç yok" ya da "ayıklanamadı" aynı sayılmasın.
NO_RULE = "(kural yok)"
FAILED = "(ayıklanamadı)"


def _value(rule: ExtractedRule, name: str) -> Value:
    value = getattr(rule, name)
    return frozenset(value) if isinstance(value, list) else value


def _agreement(expected: ExtractedRule, predicted: ExtractedRule) -> int:
    return sum(_value(expected, name) == _value(predicted, name) for name in RULE_FIELDS)


def match_rules(
    expected: Sequence[ExtractedRule], predicted: Sequence[ExtractedRule]
) -> list[tuple[int | None, int | None]]:
    """(beklenen index, tahmin index) çiftleri; eşsiz kalan tarafı None."""
    m, n = len(expected), len(predicted)
    pairs: list[tuple[int, int]]
    if max(m, n) <= 7:  # 7! = 5040 eşleme: kampanyalarda kural sayısı bunun çok altında
        if m <= n:
            candidates = (
                list(zip(range(m), perm, strict=True))
                for perm in itertools.permutations(range(n), m)
            )
        else:
            candidates = (
                list(zip(perm, range(n), strict=True))
                for perm in itertools.permutations(range(m), n)
            )
        pairs = max(
            candidates,
            key=lambda option: sum(_agreement(expected[e], predicted[p]) for e, p in option),
        )
    else:  # açgözlü: her adımda en çok tutan çift
        free_e, free_p = set(range(m)), set(range(n))
        pairs = []
        while free_e and free_p:
            e, p = max(
                itertools.product(sorted(free_e), sorted(free_p)),
                key=lambda ep: _agreement(expected[ep[0]], predicted[ep[1]]),
            )
            pairs.append((e, p))
            free_e.discard(e)
            free_p.discard(p)
    matched_e = {e for e, _ in pairs}
    matched_p = {p for _, p in pairs}
    result: list[tuple[int | None, int | None]] = [(e, p) for e, p in sorted(pairs)]
    result += [(e, None) for e in range(m) if e not in matched_e]
    result += [(None, p) for p in range(n) if p not in matched_p]
    return result


@dataclass(frozen=True)
class Miss:
    rule: int | None  # beklenen kuralın sırası (1'den); fazladan kuralda None
    field: str
    expected: Value
    predicted: Value


@dataclass
class CaseScore:
    case_id: str
    correct: Counter[str] = field(default_factory=Counter)
    total: Counter[str] = field(default_factory=Counter)
    misses: list[Miss] = field(default_factory=list)
    error: str | None = None
    expected_rules: int = 0
    predicted_rules: int = 0

    def check(self, name: str, expected: Value, predicted: Value, rule: int | None) -> None:
        self.total[name] += 1
        if expected == predicted:
            self.correct[name] += 1
        else:
            self.misses.append(Miss(rule, name, expected, predicted))


def score_case(
    case_id: str, expected: Expected, predicted: Extraction | None, error: str | None = None
) -> CaseScore:
    score = CaseScore(case_id, error=error, expected_rules=len(expected.rules))
    if predicted is None:
        for name in CAMPAIGN_FIELDS:
            score.check(name, getattr(expected, name), FAILED, None)
        for index, rule in enumerate(expected.rules, start=1):
            for name in RULE_FIELDS:
                score.check(name, _value(rule, name), FAILED, index)
        return score

    score.predicted_rules = len(predicted.rules)
    for name in CAMPAIGN_FIELDS:
        score.check(name, getattr(expected, name), getattr(predicted, name), None)
    for e, p in match_rules(expected.rules, predicted.rules):
        for name in RULE_FIELDS:
            exp = _value(expected.rules[e], name) if e is not None else NO_RULE
            pred = _value(predicted.rules[p], name) if p is not None else NO_RULE
            score.check(name, exp, pred, e + 1 if e is not None else None)
    return score


@dataclass(frozen=True)
class Summary:
    cases: int
    failed: int  # ayıklaması başarısız vaka
    correct: Counter[str]
    total: Counter[str]

    def accuracy(self, names: Sequence[str]) -> float | None:
        total = sum(self.total[name] for name in names)
        return sum(self.correct[name] for name in names) / total if total else None

    @property
    def headline(self) -> float | None:
        return self.accuracy(HEADLINE_FIELDS)

    @property
    def passed(self) -> bool:
        return self.headline is not None and self.headline >= TARGET


def summarize(scores: Sequence[CaseScore]) -> Summary:
    correct: Counter[str] = Counter()
    total: Counter[str] = Counter()
    for score in scores:
        correct.update(score.correct)
        total.update(score.total)
    return Summary(
        cases=len(scores),
        failed=sum(score.error is not None for score in scores),
        correct=correct,
        total=total,
    )
