"""Optimizasyon problemi ve kesin değerlendirme (kuruş, tamsayı). ADR 0015.

`Problem` isteği normalize eder (geçersiz/uygun olmayan kampanyalar ayıklanır). `evaluate` bir
dağılımın gerçek kazancını kuruş cinsinden, yuvarlamaları aşağı doğru hesaplar; CP-SAT ve açgözlü
algoritmanın sonucu da kullanıcıya gösterilen her sayı da buradan gelir.

Varsayımlar (ROADMAP senaryoları):
- Bütçenin tamamı harcanır; kart limitleri yetmezse kalan "dağıtılamayan" olarak döner.
- Aynı harcama birden çok kampanyaya sayılabilir (çakışma serbest, senaryo 6).
- SINGLE (tek seferde) eşiği: tek bir kategori-kart harcaması eşiği geçmelidir (alışveriş
  kategoriler arasında bölünmez). TXN_COUNT: işlem adedi bilinmediği için harcama varsa tutmuş
  sayılır. Oransal ödül eşik tutunca kapsamdaki harcamanın tamamına uygulanır.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

from engine.optimizer.contract.request import PlanRequest

DEFAULT_MAX_CARDS = 3
DEFAULT_TIME_LIMIT_MS = 2000

Allocation = dict[tuple[str, str], int]  # (kategori, kart) → kuruş


@dataclass(frozen=True)
class Card:
    id: str
    limit: int | None  # kuruş
    rates: Mapping[str, int]  # kategori → bps; "*" diğerleri

    def rate(self, category: str) -> int:
        return self.rates.get(category, self.rates.get("*", 0))


@dataclass(frozen=True)
class Campaign:
    id: str
    cards: frozenset[str]
    categories: frozenset[str]  # normalize: boşsa tüm bütçe kategorileri
    threshold_type: str
    threshold: int  # kuruş
    tier_repeat: bool
    reward: int  # kuruş, kademe başına
    reward_bps: int | None
    cap: int | None

    def pairs(self, cards: Sequence[str]) -> list[tuple[str, str]]:
        return [(c, k) for c in sorted(self.categories) for k in cards if k in self.cards]


@dataclass(frozen=True)
class Problem:
    budget: dict[str, int]  # kategori → kuruş (sıralı)
    cards: dict[str, Card]
    campaigns: list[Campaign]
    max_cards: int
    time_limit_ms: int

    @classmethod
    def from_request(cls, request: PlanRequest) -> "Problem":
        budget: dict[str, int] = {}
        for item in request.budget:
            budget[item.category] = budget.get(item.category, 0) + item.amount
        cards = {
            card.id: Card(card.id, card.limit, dict(card.baseRateBps)) for card in request.cards
        }
        campaigns = []
        for raw in request.campaigns:
            card_ids = frozenset(raw.cards) & cards.keys()
            categories = (
                frozenset(raw.categories) & budget.keys() if raw.categories else frozenset(budget)
            )
            useless = raw.reward == 0 and not raw.rewardBps
            if not raw.eligible or not card_ids or not categories or useless:
                continue
            campaigns.append(
                Campaign(
                    id=raw.id,
                    cards=card_ids,
                    categories=categories,
                    threshold_type=raw.thresholdType,
                    threshold=raw.threshold,
                    tier_repeat=raw.tierRepeat,
                    reward=raw.reward,
                    reward_bps=raw.rewardBps,
                    cap=raw.cap,
                )
            )
        options = request.options
        return cls(
            budget=budget,
            cards=cards,
            campaigns=campaigns,
            max_cards=options.maxCards if options else DEFAULT_MAX_CARDS,
            time_limit_ms=options.timeLimitMs if options else DEFAULT_TIME_LIMIT_MS,
        )

    @property
    def card_ids(self) -> list[str]:
        return list(self.cards)

    def capacity(self) -> int:
        """Dağıtılabilecek en çok tutar: limiti en geniş `max_cards` kartın toplamı."""
        total = sum(self.budget.values())
        limits = sorted(
            (card.limit if card.limit is not None else total for card in self.cards.values()),
            reverse=True,
        )
        return min(total, sum(limits[: self.max_cards]))


# ---------- Kampanya ödülü ----------


def tiers(campaign: Campaign, spend: int, best_pair: int) -> int:
    """Kazanılan kademe sayısı. `spend` kapsamdaki toplam, `best_pair` en büyük tek harcama."""
    if spend <= 0:
        return 0
    if campaign.threshold_type == "TXN_COUNT" or campaign.threshold == 0:
        return 1
    if campaign.threshold_type == "SINGLE":
        return 1 if best_pair >= campaign.threshold else 0
    if campaign.tier_repeat:
        return spend // campaign.threshold
    return 1 if spend >= campaign.threshold else 0


def campaign_reward(campaign: Campaign, spend: int, best_pair: int) -> tuple[int, int]:
    """(kademe, ödül kuruş) — üst limit uygulanmış."""
    count = tiers(campaign, spend, best_pair)
    if count == 0:
        return 0, 0
    reward = count * campaign.reward
    if campaign.reward_bps:
        reward += spend * campaign.reward_bps // 10_000
    if campaign.cap is not None:
        reward = min(reward, campaign.cap)
    return count, reward


# ---------- Değerlendirme ----------


@dataclass
class CampaignResult:
    id: str
    tiers: int
    reward: int
    spend: int
    best_pair: int


@dataclass
class Evaluation:
    allocation: Allocation
    base: dict[tuple[str, str], int]
    campaigns: dict[str, CampaignResult]
    unallocated: dict[str, int] = field(default_factory=dict)

    @property
    def total(self) -> int:
        return sum(self.base.values()) + sum(r.reward for r in self.campaigns.values())


def evaluate(problem: Problem, allocation: Mapping[tuple[str, str], int]) -> Evaluation:
    alloc = {pair: amount for pair, amount in allocation.items() if amount > 0}
    base = {(c, k): amount * problem.cards[k].rate(c) // 10_000 for (c, k), amount in alloc.items()}
    results = {}
    for campaign in problem.campaigns:
        amounts = [alloc.get(pair, 0) for pair in campaign.pairs(problem.card_ids)]
        spend, best = sum(amounts), max(amounts, default=0)
        count, reward = campaign_reward(campaign, spend, best)
        results[campaign.id] = CampaignResult(campaign.id, count, reward, spend, best)
    placed: dict[str, int] = {}
    for (c, _), amount in alloc.items():
        placed[c] = placed.get(c, 0) + amount
    unallocated = {
        c: total - placed.get(c, 0)
        for c, total in problem.budget.items()
        if total > placed.get(c, 0)
    }
    return Evaluation(alloc, base, results, unallocated)


def near_misses(
    problem: Problem, evaluation: Evaluation, limit: int = 10
) -> list[tuple[str, int, int]]:
    """(kampanya, eksik tutar, ek ödül): sonraki kademeye ne kadar kaldı. Teşvik değil, bilgi."""
    misses = []
    for campaign in problem.campaigns:
        result = evaluation.campaigns[campaign.id]
        if campaign.threshold_type == "TXN_COUNT" or campaign.threshold == 0:
            if result.tiers:
                continue
            missing = 100  # herhangi bir harcama yeter; 1 TL gösterilir
        elif campaign.threshold_type == "SINGLE":
            if result.tiers:
                continue
            missing = campaign.threshold - result.best_pair
        else:
            if result.tiers and not campaign.tier_repeat:
                continue
            missing = (result.tiers + 1) * campaign.threshold - result.spend
        # Tek seferlik eşikte eksik tutar tek bir alışveriştir; en büyük harcama eşik olur.
        best = campaign.threshold if campaign.threshold_type == "SINGLE" else result.best_pair
        _, after = campaign_reward(campaign, result.spend + missing, best)
        extra = after - result.reward
        if missing > 0 and extra > 0:
            misses.append((campaign.id, missing, extra))
    return sorted(misses, key=lambda miss: (miss[1], -miss[2], miss[0]))[:limit]


def split(total: int, weights: Sequence[int]) -> list[int]:
    """`total`'ı ağırlıklara göre tamsayılara böler (en büyük kalan yöntemi, toplam korunur)."""
    whole = sum(weights)
    if whole == 0 or total == 0:
        return [0] * len(weights)
    shares = [total * weight // whole for weight in weights]
    order = sorted(range(len(weights)), key=lambda i: -(total * weights[i] % whole))
    for i in order[: total - sum(shares)]:
        shares[i] += 1
    return shares
