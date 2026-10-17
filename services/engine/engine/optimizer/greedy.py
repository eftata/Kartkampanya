"""Açgözlü yedek: CP-SAT süre içinde çözüm bulamazsa (ADR 0015).

1. Kart seçimi: `max_cards` sınırı varsa kartlar tek tek, toplam kazancı en çok artıran eklenir.
2. Başlangıç: her kategori, temel oranı en yüksek karta (limit dolunca sıradakine) yazılır.
3. Yerel arama: (a) bir kategorinin bir karttaki payını başka karta taşı, (b) bir kampanyanın
   sonraki kademesi için eksik tutarı kampanya kartına çek. Kazancı artıran en iyi hamle uygulanır;
   hamle kalmayınca ya da süre dolunca durur. Değerlendirme her zaman `problem.evaluate` ile.
"""

import time
from collections.abc import Iterable

from engine.optimizer.problem import Allocation, Problem, evaluate, near_misses


def _used(allocation: Allocation, card: str) -> int:
    return sum(amount for (_, k), amount in allocation.items() if k == card)


def _initial(problem: Problem, cards: list[str]) -> Allocation:
    allocation: Allocation = {}
    for category, amount in sorted(problem.budget.items(), key=lambda item: -item[1]):
        rest = amount
        for k in sorted(cards, key=lambda k: -problem.cards[k].rate(category)):
            limit = problem.cards[k].limit
            room = rest if limit is None else min(rest, limit - _used(allocation, k))
            if room > 0:
                allocation[category, k] = allocation.get((category, k), 0) + room
                rest -= room
            if rest == 0:
                break
    return allocation


def _move(
    problem: Problem, allocation: Allocation, category: str, source: str, target: str, amount: int
) -> Allocation | None:
    limit = problem.cards[target].limit
    room = amount if limit is None else min(amount, limit - _used(allocation, target))
    room = min(room, allocation.get((category, source), 0))
    if room <= 0:
        return None
    moved = dict(allocation)
    moved[category, source] -= room
    moved[category, target] = moved.get((category, target), 0) + room
    return moved


def _neighbours(problem: Problem, allocation: Allocation, cards: list[str]) -> Iterable[Allocation]:
    for (category, source), amount in list(allocation.items()):
        if amount <= 0:
            continue
        for target in cards:
            if target != source:
                moved = _move(problem, allocation, category, source, target, amount)
                if moved:
                    yield moved
    evaluation = evaluate(problem, allocation)
    campaigns = {campaign.id: campaign for campaign in problem.campaigns}
    for campaign_id, missing, _ in near_misses(problem, evaluation, limit=len(campaigns)):
        campaign = campaigns[campaign_id]
        for category, target in campaign.pairs(cards):
            for source in cards:
                if source not in campaign.cards:
                    moved = _move(problem, allocation, category, source, target, missing)
                    if moved:
                        yield moved


def _improve(
    problem: Problem, allocation: Allocation, cards: list[str], deadline: float
) -> Allocation:
    best, best_total = allocation, evaluate(problem, allocation).total
    while time.monotonic() < deadline:
        candidate = max(
            _neighbours(problem, best, cards),
            key=lambda option: evaluate(problem, option).total,
            default=None,
        )
        if candidate is None:
            break
        total = evaluate(problem, candidate).total
        if total <= best_total:
            break
        best, best_total = candidate, total
    return best


def solve_greedy(problem: Problem, deadline: float) -> Allocation:
    """`deadline`: `time.monotonic()` cinsinden bitiş anı."""
    cards = problem.card_ids
    if problem.max_cards < len(cards):
        chosen: list[str] = []
        while len(chosen) < problem.max_cards:
            pick = max(
                (k for k in cards if k not in chosen),
                key=lambda k: (
                    sum(_initial(problem, [*chosen, k]).values()),  # önce kapasite
                    evaluate(problem, _initial(problem, [*chosen, k])).total,
                ),
            )
            chosen.append(pick)
        cards = chosen
    return _improve(problem, _initial(problem, cards), cards, deadline)
