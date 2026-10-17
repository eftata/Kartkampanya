"""`PlanRequest` → `PlanResponse`: CP-SAT, olmazsa açgözlü yedek; sonuç kesin değerlendirilir."""

import time
from typing import Literal

from engine.optimizer.contract.request import PlanRequest
from engine.optimizer.contract.response import (
    PlanAllocation,
    PlanBaseline,
    PlanCampaignHit,
    PlanNearMiss,
    PlanResponse,
    PlanSolver,
    PlanUnallocated,
)
from engine.optimizer.cpsat import solve_cpsat
from engine.optimizer.greedy import solve_greedy
from engine.optimizer.problem import Allocation, Evaluation, Problem, evaluate, near_misses, split


def single_card_baseline(problem: Problem) -> tuple[str | None, int]:
    """ "Her şeyi tek kartla ödeseydin": bütçenin tamamını taşıyabilen kartlar içinde en iyisi.

    Hiçbir kartın limiti yetmiyorsa limiti en geniş kart, sığan kısmıyla kıyaslanır.
    """
    total = sum(problem.budget.values())
    fits = [k for k, card in problem.cards.items() if card.limit is None or card.limit >= total]
    if not fits:
        fits = [max(problem.cards, key=lambda k: problem.cards[k].limit or 0)]
    best: tuple[str | None, int] = (None, 0)
    for k in fits:
        room = problem.cards[k].limit
        allocation: Allocation = {}
        for category, amount in problem.budget.items():
            placed = amount if room is None else min(amount, room)
            allocation[category, k] = placed
            if room is not None:
                room -= placed
        value = evaluate(problem, allocation).total
        if best[0] is None or value > best[1]:
            best = (k, value)
    return best


def _allocations(problem: Problem, evaluation: Evaluation) -> list[PlanAllocation]:
    """Kampanya ödülleri katkı veren harcamalara tutar oranında bölünür (toplam korunur)."""
    rewards = {pair: base for pair, base in evaluation.base.items()}
    hit_by_pair: dict[tuple[str, str], list[str]] = {pair: [] for pair in evaluation.allocation}
    for campaign in problem.campaigns:
        result = evaluation.campaigns[campaign.id]
        if result.reward <= 0:
            continue
        pairs = [p for p in campaign.pairs(problem.card_ids) if evaluation.allocation.get(p, 0)]
        shares = split(result.reward, [evaluation.allocation[p] for p in pairs])
        for pair, share in zip(pairs, shares, strict=True):
            rewards[pair] += share
            hit_by_pair[pair].append(campaign.id)
    order = {c: i for i, c in enumerate(problem.budget)}
    return [
        PlanAllocation(
            category=c,
            card=k,
            amount=amount,
            campaigns=hit_by_pair[c, k],
            expectedReward=rewards[c, k],
        )
        for (c, k), amount in sorted(
            evaluation.allocation.items(), key=lambda item: (order[item[0][0]], -item[1])
        )
    ]


def optimize(request: PlanRequest) -> PlanResponse:
    started = time.monotonic()
    problem = Problem.from_request(request)
    limit_s = problem.time_limit_ms / 1000
    engine: Literal["cp-sat", "greedy"] = "cp-sat"
    status: Literal["OPTIMAL", "FEASIBLE", "FALLBACK"]
    result = solve_cpsat(problem, limit_s)
    if result.allocation is not None and result.status is not None:
        allocation, status = result.allocation, result.status
    else:
        engine = "greedy"
        allocation = solve_greedy(problem, deadline=started + limit_s)
        status = "FALLBACK"
    evaluation = evaluate(problem, allocation)
    baseline_card, baseline_total = single_card_baseline(problem)
    return PlanResponse(
        status=status,
        allocations=_allocations(problem, evaluation),
        campaignsHit=[
            PlanCampaignHit(id=r.id, tiers=r.tiers, reward=r.reward)
            for r in evaluation.campaigns.values()
            if r.tiers and r.reward
        ],
        nearMisses=[
            PlanNearMiss(id=cid, missingAmount=missing, extraReward=extra)
            for cid, missing, extra in near_misses(problem, evaluation)
        ],
        unallocated=[
            PlanUnallocated(category=c, amount=amount)
            for c, amount in evaluation.unallocated.items()
        ],
        totalExpected=evaluation.total,
        baseline=PlanBaseline(
            strategy="single_best_card", card=baseline_card, total=baseline_total
        ),
        solver=PlanSolver(engine=engine, ms=int((time.monotonic() - started) * 1000)),
    )
