"""CP-SAT modeli: harcamanın kategori-kart dağılımı (ADR 0015).

Karar değişkenleri TL tamsayıdır (CP-SAT tamsayı ister; kuruş ölçeği alanları gereksiz büyütür).
Kuruş artıkları çözümden sonra eklenir (`place_remainders`). Amaç fonksiyonu 1/100 kuruş
biriminde: temel kazanç `x_TL * bps`, kampanya ödülü `kuruş * 100`. Kullanıcıya gösterilen
sayılar `problem.evaluate` ile kuruş cinsinden yeniden hesaplanır.
"""

from dataclasses import dataclass
from typing import Literal

from ortools.sat.python import cp_model

from engine.optimizer.problem import Allocation, Problem

SolveStatus = Literal["OPTIMAL", "FEASIBLE"]


@dataclass(frozen=True)
class CpSatResult:
    allocation: Allocation | None  # None: süre içinde çözüm yok → açgözlü yedek
    status: SolveStatus | None


def _ceil_tl(kurus: int) -> int:
    return -(-kurus // 100)


def solve_cpsat(problem: Problem, time_limit_s: float, workers: int = 8) -> CpSatResult:
    model = cp_model.CpModel()
    cats, cards = list(problem.budget), problem.card_ids
    budget = {c: problem.budget[c] // 100 for c in cats}
    total = sum(budget.values())

    x = {(c, k): model.new_int_var(0, budget[c], f"x[{c}|{k}]") for c in cats for k in cards}
    used = {k: model.new_bool_var(f"used[{k}]") for k in cards}
    for (c, k), var in x.items():
        model.add(var <= budget[c] * used[k])
    model.add(sum(used.values()) <= problem.max_cards)
    for c in cats:
        model.add(sum(x[c, k] for k in cards) <= budget[c])
    for k, card in problem.cards.items():
        if card.limit is not None:
            model.add(sum(x[c, k] for c in cats) <= card.limit // 100)
    # Harcamanın tamamı (limitler izin verdiği kadar) dağıtılır: kullanıcı nasılsa harcayacak.
    limits = sorted(
        (card.limit // 100 if card.limit is not None else total for card in problem.cards.values()),
        reverse=True,
    )
    model.add(sum(x.values()) >= min(total, sum(limits[: problem.max_cards])))

    objective = [x[c, k] * problem.cards[k].rate(c) for c in cats for k in cards]
    grouped: dict[str, list[cp_model.IntVar]] = {}
    for campaign in problem.campaigns:
        pairs = campaign.pairs(cards)
        scope_max = sum(budget[c] for c in campaign.categories)
        threshold = _ceil_tl(campaign.threshold)
        if not pairs or scope_max == 0 or threshold > scope_max:
            continue  # eşiğe ulaşmak imkânsız
        spend = sum(x[pair] for pair in pairs)
        hit = model.new_bool_var(f"hit[{campaign.id}]")
        fixed: cp_model.LinearExpr
        counting = campaign.threshold_type == "TXN_COUNT" or threshold == 0
        if counting:
            model.add(spend >= 1).only_enforce_if(hit)
            fixed = campaign.reward * hit
        elif campaign.threshold_type == "SINGLE":
            options = []
            for c, k in pairs:
                if budget[c] >= threshold:
                    single = model.new_bool_var(f"single[{campaign.id}|{c}|{k}]")
                    model.add(x[c, k] >= threshold).only_enforce_if(single)
                    options.append(single)
            if not options:
                continue
            model.add_bool_or(options).only_enforce_if(hit)
            fixed = campaign.reward * hit
        elif campaign.tier_repeat:
            most = scope_max // threshold
            if campaign.cap is not None and campaign.reward > 0:
                most = min(most, -(-campaign.cap // campaign.reward))
            count = model.new_int_var(0, most, f"tiers[{campaign.id}]")
            model.add(threshold * count <= spend)
            model.add(count >= 1).only_enforce_if(hit)
            model.add(count == 0).only_enforce_if(~hit)
            fixed = campaign.reward * count
        else:
            model.add(spend >= threshold).only_enforce_if(hit)
            fixed = campaign.reward * hit

        upper = (campaign.reward * scope_max + (campaign.reward_bps or 0) * scope_max) * 100
        if campaign.cap is not None:
            upper = min(upper, campaign.cap * 100)
        reward = model.new_int_var(0, upper, f"reward[{campaign.id}]")
        bonus: cp_model.IntVar | int = 0
        if campaign.reward_bps:
            percent = model.new_int_var(0, scope_max * campaign.reward_bps, f"bps[{campaign.id}]")
            model.add(percent <= spend * campaign.reward_bps)
            model.add(percent == 0).only_enforce_if(~hit)
            bonus = percent
        model.add(reward <= 100 * fixed + bonus)
        if campaign.group is not None:
            # Grupta yalnızca bir kural ödül verebilir (kademeler toplanmaz).
            active = model.new_bool_var(f"active[{campaign.id}]")
            model.add(reward == 0).only_enforce_if(~active)
            grouped.setdefault(campaign.group, []).append(active)
        objective.append(reward)
    for members in grouped.values():
        model.add(sum(members) <= 1)
    # Eşit kazançlı çözümler arasında kategori-kart çifti az olanı seç (gereksiz bölme yok).
    # Ana hedef çift sayısından büyük bir katsayıyla çarpılır; tek birimlik fark bile baskın kalır.
    opened = {pair: model.new_bool_var(f"open[{pair[0]}|{pair[1]}]") for pair in x}
    for pair, var in x.items():
        model.add(var <= budget[pair[0]] * opened[pair])
    model.maximize((len(x) + 1) * sum(objective) - sum(opened.values()))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    solver.parameters.num_workers = workers
    code = solver.solve(model)
    if code not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return CpSatResult(None, None)
    allocation = {pair: solver.value(var) * 100 for pair, var in x.items()}
    status: SolveStatus = "OPTIMAL" if code == cp_model.OPTIMAL else "FEASIBLE"
    return CpSatResult(place_remainders(problem, allocation), status)


def place_remainders(problem: Problem, allocation: Allocation) -> Allocation:
    """TL'ye sığmayan kuruşları kategorinin en büyük payına (limit izin verirse) ekler."""
    result = dict(allocation)
    used = {k: sum(v for (_, card), v in result.items() if card == k) for k in problem.cards}
    for c, amount in problem.budget.items():
        rest = amount - sum(v for (cat, _), v in result.items() if cat == c)
        if rest <= 0:
            continue
        candidates = sorted(
            problem.cards, key=lambda k: (-result.get((c, k), 0), -problem.cards[k].rate(c))
        )
        for k in candidates:
            limit = problem.cards[k].limit
            if result.get((c, k), 0) == 0 and any(result.get((c, j), 0) for j in problem.cards):
                continue  # yeni kart açma; kategori zaten bir kartta
            if limit is None or limit - used[k] >= rest:
                result[c, k] = result.get((c, k), 0) + rest
                used[k] += rest
                break
    return result
