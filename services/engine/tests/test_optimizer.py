"""Optimizasyon: ROADMAP'teki 10 kabul senaryosu, açgözlü yedek ve kesin değerlendirme."""

import random
import time
from typing import Any

import pytest

from engine.optimizer import solve as solve_module
from engine.optimizer.contract.request import PlanRequest
from engine.optimizer.contract.response import PlanResponse
from engine.optimizer.cpsat import CpSatResult
from engine.optimizer.greedy import solve_greedy
from engine.optimizer.problem import Problem, campaign_reward, evaluate, split
from engine.optimizer.solve import optimize

TL = 100  # kuruş


def card(cid: str, limit_tl: int | None = None, **rates: int) -> dict[str, Any]:
    return {
        "id": cid,
        "limit": None if limit_tl is None else limit_tl * TL,
        "baseRateBps": rates or {"*": 50},
    }


def campaign(cid: str, cards: list[str], categories: list[str], **fields: Any) -> dict[str, Any]:
    base = {
        "id": cid,
        "cards": cards,
        "categories": categories,
        "thresholdType": "CUMULATIVE",
        "threshold": 0,
        "tierRepeat": False,
        "reward": 0,
        "cap": None,
        "eligible": True,
    }
    return base | fields


def request(
    budget: dict[str, int],
    cards: list[dict[str, Any]],
    campaigns: list[dict[str, Any]],
    **options: int,
) -> PlanRequest:
    return PlanRequest.model_validate(
        {
            "month": "2026-11",
            "budget": [{"category": c, "amount": tl * TL} for c, tl in budget.items()],
            "cards": cards,
            "campaigns": campaigns,
            "options": {"maxCards": 3, "timeLimitMs": 2000} | options,
        }
    )


def placed(response: PlanResponse) -> dict[tuple[str, str], int]:
    """(kategori, kart) → TL."""
    return {(a.category, a.card): a.amount // TL for a in response.allocations}


def hits(response: PlanResponse) -> dict[str, int]:
    return {hit.id: hit.reward for hit in response.campaignsHit}


# ---------- Senaryo 1: ürün dokümanı örneği ----------

# ROADMAP'te yalnızca K1 ve K4 tanımlı; ürün dokümanındaki K2 ve K3 bu repoda yok. Aşağıdaki K2/K3,
# ROADMAP'in verdiği her sonuçla (toplam 665 TL; market B'de, akaryakıt B'de, e-ticaret C'de;
# market dağılımı 6.000 TL / 280 TL; tek kart kıyası 265 TL; K1 için 2.500 TL eksik) tutarlı bir
# YENİDEN KURGUDUR. Ürün dokümanındaki asıl değerler gelince güncellenmeli (ADR 0015).
EXAMPLE = request(
    {"market": 6000, "akaryakit": 3000, "e-ticaret": 4000},
    [card("A"), card("B", limit_tl=10_000), card("C")],
    [
        campaign(
            "K1", ["A"], ["market"], threshold=2500 * TL, tierRepeat=True, reward=100 * TL,
            cap=300 * TL,
        ),
        campaign(
            "K2", ["B"], ["akaryakit"], threshold=1500 * TL, reward=150 * TL, cap=150 * TL
        ),
        campaign(
            "K3", ["C"], ["e-ticaret"], threshold=2000 * TL, reward=200 * TL, cap=200 * TL
        ),
        campaign("K4", ["B"], ["market"], threshold=5000 * TL, reward=250 * TL, cap=250 * TL),
    ],
)  # fmt: skip


def test_1_product_document_example() -> None:
    response = optimize(EXAMPLE)
    assert response.status == "OPTIMAL"
    assert response.totalExpected == 665 * TL
    assert placed(response) == {
        ("market", "B"): 6000,
        ("akaryakit", "B"): 3000,
        ("e-ticaret", "C"): 4000,
    }
    market = response.allocations[0]
    assert (market.campaigns, market.expectedReward) == (["K4"], 280 * TL)
    assert sum(a.expectedReward for a in response.allocations) == response.totalExpected
    assert hits(response) == {"K2": 150 * TL, "K3": 200 * TL, "K4": 250 * TL}
    assert [(m.id, m.missingAmount, m.extraReward) for m in response.nearMisses] == [
        ("K1", 2500 * TL, 100 * TL)
    ]
    assert (response.baseline.total, response.baseline.card) == (265 * TL, "A")
    assert response.solver.engine == "cp-sat"


def test_roadmap_request_example_is_valid_contract() -> None:
    """ROADMAP'teki örnek istek (options dahil) sözleşmeye uyar; options verilmezse varsayılan."""
    raw = EXAMPLE.model_dump()
    del raw["options"]
    problem = Problem.from_request(PlanRequest.model_validate(raw))
    assert (problem.max_cards, problem.time_limit_ms) == (3, 2000)


# ---------- Senaryolar 2-9 ----------


def test_2_no_campaigns_uses_best_base_rate_per_category() -> None:
    response = optimize(
        request(
            {"market": 4000, "akaryakit": 2000},
            [card("A", **{"*": 50}), card("B", market=200, **{"*": 0}), card("C", **{"*": 100})],
            [],
        )
    )
    assert placed(response) == {("market", "B"): 4000, ("akaryakit", "C"): 2000}
    assert response.totalExpected == (80 + 20) * TL
    assert response.campaignsHit == [] and response.nearMisses == []


def test_3_threshold_above_budget_is_a_near_miss() -> None:
    response = optimize(
        request(
            {"market": 6000},
            [card("A"), card("B")],
            [campaign("K", ["A"], ["market"], threshold=10_000 * TL, reward=500 * TL)],
        )
    )
    assert hits(response) == {}
    assert [(m.id, m.missingAmount, m.extraReward) for m in response.nearMisses] == [
        ("K", 4000 * TL, 500 * TL)
    ]


def test_4_tiered_campaign_cap_then_spend_moves_to_other_card() -> None:
    response = optimize(
        request(
            {"market": 10_000},
            [card("A", **{"*": 50}), card("B", **{"*": 200})],
            [
                campaign(
                    "K",
                    ["A"],
                    ["market"],
                    threshold=1000 * TL,
                    tierRepeat=True,
                    reward=100 * TL,
                    cap=200 * TL,
                )
            ],
        )
    )
    assert placed(response) == {("market", "A"): 2000, ("market", "B"): 8000}
    assert hits(response) == {"K": 200 * TL}
    assert response.totalExpected == (10 + 200 + 160) * TL


def test_5_card_limit_is_respected() -> None:
    response = optimize(
        request({"market": 5000}, [card("A", limit_tl=3000, **{"*": 200}), card("B")], [])
    )
    assert placed(response) == {("market", "A"): 3000, ("market", "B"): 2000}
    assert response.unallocated == []

    short = optimize(request({"market": 5000}, [card("A", limit_tl=3000)], []))
    assert placed(short) == {("market", "A"): 3000}
    assert [(u.category, u.amount) for u in short.unallocated] == [("market", 2000 * TL)]


def test_6_same_spend_counts_for_two_campaigns_on_same_card() -> None:
    response = optimize(
        request(
            {"market": 4000},
            [card("A"), card("B")],
            [
                campaign("K1", ["A"], ["market"], threshold=2000 * TL, reward=100 * TL),
                campaign("K2", ["A"], [], threshold=3000 * TL, reward=150 * TL),
            ],
        )
    )
    assert hits(response) == {"K1": 100 * TL, "K2": 150 * TL}
    assert response.allocations[0].campaigns == ["K1", "K2"]
    assert response.totalExpected == (20 + 100 + 150) * TL


def test_7_budget_not_split_when_it_cannot_reach_both_thresholds() -> None:
    response = optimize(
        request(
            {"market": 6000},
            [card("A"), card("B")],
            [
                campaign("K1", ["A"], ["market"], threshold=5000 * TL, reward=100 * TL),
                campaign("K2", ["B"], ["market"], threshold=5000 * TL, reward=250 * TL),
            ],
        )
    )
    assert placed(response) == {("market", "B"): 6000}
    assert hits(response) == {"K2": 250 * TL}


def test_8_max_cards_one_puts_everything_on_the_best_single_card() -> None:
    response = optimize(
        request(
            {"market": 3000, "akaryakit": 3000},
            [card("A"), card("B")],
            [
                campaign("KA", ["A"], ["market"], threshold=3000 * TL, reward=200 * TL),
                campaign("KB", ["B"], ["akaryakit"], threshold=3000 * TL, reward=300 * TL),
            ],
            maxCards=1,
        )
    )
    assert placed(response) == {("market", "B"): 3000, ("akaryakit", "B"): 3000}
    assert response.totalExpected == (30 + 300) * TL


def test_9_ineligible_campaign_is_ignored() -> None:
    response = optimize(
        request(
            {"market": 6000},
            [card("A"), card("B", **{"*": 100})],
            [campaign("K", ["A"], ["market"], threshold=1 * TL, reward=1000 * TL, eligible=False)],
        )
    )
    assert placed(response) == {("market", "B"): 6000}
    assert hits(response) == {} and response.nearMisses == []


# ---------- Senaryo 10: performans ----------


def large_request(seed: int = 7) -> PlanRequest:
    rng = random.Random(seed)  # noqa: S311 — tekrarlanabilir test verisi
    categories = [f"kat{i}" for i in range(15)]
    cards = [
        card(
            f"kart{i}",
            limit_tl=rng.choice([None, 20_000, 50_000]),
            **{"*": rng.choice([0, 25, 50, 100])},
        )
        for i in range(8)
    ]
    campaigns = []
    for i in range(120):
        kind = rng.choice(["CUMULATIVE", "CUMULATIVE", "SINGLE", "TXN_COUNT"])
        campaigns.append(
            campaign(
                f"k{i}",
                rng.sample([c["id"] for c in cards], rng.randint(1, 2)),
                rng.sample(categories, rng.randint(0, 3)),
                thresholdType=kind,
                threshold=rng.choice([500, 1000, 2500, 5000, 10_000]) * TL,
                txnCount=3 if kind == "TXN_COUNT" else None,
                tierRepeat=kind == "CUMULATIVE" and rng.random() < 0.4,
                reward=rng.choice([0, 25, 50, 100, 250]) * TL,
                rewardBps=rng.choice([None, None, 100, 500]),
                cap=rng.choice([None, 300 * TL, 1000 * TL]),
                eligible=rng.random() > 0.05,
            )
        )
    budget = {c: rng.randint(500, 8000) for c in categories}
    return request(budget, cards, campaigns)


def test_10_eight_cards_fifteen_categories_120_campaigns_within_two_seconds() -> None:
    started = time.monotonic()
    response = optimize(large_request())
    elapsed = time.monotonic() - started
    assert response.status in {"OPTIMAL", "FEASIBLE"}
    assert elapsed < 2.5  # 2 sn çözücü sınırı + kurulum/değerlendirme payı
    assert response.totalExpected >= response.baseline.total
    assert sum(a.expectedReward for a in response.allocations) == response.totalExpected


# ---------- Açgözlü yedek ----------


@pytest.mark.parametrize(
    "scenario",
    [
        EXAMPLE,
        request(
            {"market": 6000},
            [card("A"), card("B")],
            [
                campaign("K1", ["A"], ["market"], threshold=5000 * TL, reward=100 * TL),
                campaign("K2", ["B"], ["market"], threshold=5000 * TL, reward=250 * TL),
            ],
        ),
        request({"market": 5000}, [card("A", limit_tl=3000, **{"*": 200}), card("B")], []),
    ],
)
def test_greedy_matches_cp_sat_on_small_scenarios(scenario: PlanRequest) -> None:
    problem = Problem.from_request(scenario)
    greedy = evaluate(problem, solve_greedy(problem, deadline=time.monotonic() + 2))
    assert greedy.total == optimize(scenario).totalExpected
    assert greedy.unallocated == {}


def test_fallback_is_used_when_cp_sat_finds_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(solve_module, "solve_cpsat", lambda *args: CpSatResult(None, None))
    response = optimize(EXAMPLE)
    assert (response.status, response.solver.engine) == ("FALLBACK", "greedy")
    assert response.totalExpected == 665 * TL


def test_greedy_respects_limits_and_max_cards_on_large_input() -> None:
    scenario = large_request(seed=3)
    problem = Problem.from_request(scenario)
    allocation = solve_greedy(problem, deadline=time.monotonic() + 1)
    used_cards = {k for (_, k), amount in allocation.items() if amount}
    assert len(used_cards) <= problem.max_cards
    for k in used_cards:
        limit = problem.cards[k].limit
        assert limit is None or sum(a for (_, c), a in allocation.items() if c == k) <= limit


# ---------- Kesin değerlendirme ----------


def test_campaign_reward_rules() -> None:
    def make(**fields: Any) -> Any:
        return Problem.from_request(
            request({"m": 1}, [card("A")], [campaign("K", ["A"], ["m"], **fields)])
        ).campaigns[0]

    single = make(thresholdType="SINGLE", threshold=1000, reward=50)
    assert campaign_reward(single, 5000, 999) == (0, 0)  # toplam yeter ama tek alışveriş yetmez
    assert campaign_reward(single, 5000, 1000) == (1, 50)
    count = make(thresholdType="TXN_COUNT", txnCount=3, reward=70)
    assert campaign_reward(count, 1, 1) == (1, 70)
    percent = make(threshold=1000, reward=0, rewardBps=500, cap=120)
    assert campaign_reward(percent, 999, 999) == (0, 0)
    assert campaign_reward(percent, 2000, 2000) == (1, 100)
    assert campaign_reward(percent, 5000, 5000) == (1, 120)
    repeat = make(threshold=1000, tierRepeat=True, reward=30, cap=None)
    assert campaign_reward(repeat, 3999, 3999) == (3, 90)


def test_split_keeps_total() -> None:
    assert split(100, [1, 1, 1]) == [34, 33, 33]
    assert split(25_000, [600_000]) == [25_000]
    assert split(7, [0, 0]) == [0, 0]
