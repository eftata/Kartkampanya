import { PageHead } from "../components/Layout";
import { CardLabel } from "../components/MiniCard";
import { rewardText } from "../components/CampaignItem";
import { categoryIcon, categoryName } from "../lib/categories";
import { setJoined } from "../lib/data";
import { daysBetween, formatDay, monthName } from "../lib/dates";
import { formatKurus } from "../lib/money";
import { bestSingleCard, optimize } from "../lib/optimizer";
import { Link } from "../lib/router";
import { useSession } from "../lib/store";
import type { CategorySlug } from "../lib/types";

export function Plan() {
  const { user, profile, myCards, campaigns, today, catalog } = useSession();
  const input = { cards: myCards, spend: profile.spend, campaigns, joined: profile.joined, today };
  const plan = optimize(input);
  const single = bestSingleCard(input);
  const cardById = (id: string) => catalog.find((c) => c.id === id);

  const groups = new Map<CategorySlug, typeof plan.lines>();
  for (const l of plan.lines) groups.set(l.category, [...(groups.get(l.category) ?? []), l]);
  const byCategory = [...groups.entries()];

  const toJoin = plan.outcomes.filter((o) => o.campaign.requiresJoin && !o.joined);
  const extra = single ? plan.totalKurus - single.totalKurus : 0;
  const unverified = myCards.some((c) => !c.verified);

  if (myCards.length === 0) {
    return (
      <>
        <PageHead kicker={monthName(today)} title="Bu ayın planı" />
        <div className="empty">
          <p>Henüz kart eklemedin.</p>
          <Link href="/kartlarim" className="btn btn-primary">
            Kart ekle
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead kicker={monthName(today)} title="Bu ayın planı">
        {formatKurus(plan.totalSpendKurus)} harcamayı{" "}
        {new Set(plan.lines.map((l) => l.cardId)).size} karta dağıttık.
      </PageHead>

      <section className="summary">
        <div className="summary-main">
          <span className="kicker">Beklenen kazanç</span>
          <strong className="big num">{formatKurus(plan.totalKurus)}</strong>
          <span className="muted small">
            Kampanyalardan {formatKurus(plan.campaignKurus)} · temel puandan{" "}
            {formatKurus(plan.baseKurus)}
          </span>
        </div>
        <div className="summary-side">
          <span className="kicker">Tek kartla ödeseydin</span>
          <strong className="num">{formatKurus(single?.totalKurus ?? 0)}</strong>
          <span className="muted small">
            {single && cardById(single.cardId)?.name}
            {extra > 0 && (
              <>
                {" "}
                · plan <b className="pos">+{formatKurus(extra)}</b> fazla
              </>
            )}
          </span>
        </div>
      </section>

      {toJoin.length > 0 && (
        <section className="callout">
          <h2>Katılmayı unutma</h2>
          <p className="muted small">Bu kampanyalar planda var ama ödül için katılım gerekiyor.</p>
          <ul className="join-list">
            {toJoin.map((o) => (
              <li key={o.campaign.id}>
                <div>
                  <strong>{o.campaign.title}</strong>
                  <small>
                    {cardById(o.cardId)?.name} ·{" "}
                    {o.campaign.joinHint || "Bankanın uygulamasından katıl."} ·{" "}
                    {formatDay(o.campaign.endsAt, today)}'e kadar
                  </small>
                </div>
                <button
                  type="button"
                  className="btn btn-soft"
                  onClick={() => setJoined(user.uid, o.campaign.id, true)}
                >
                  Katıldım
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="plan-table" aria-label="Kategori başına plan">
        {byCategory.map(([cat, lines]) => (
          <div className="plan-cat" key={cat}>
            <div className="plan-cat-head">
              <span className="cat-icon" aria-hidden="true">
                {categoryIcon(cat)}
              </span>
              <h3>{categoryName(cat)}</h3>
              <span className="num muted">{formatKurus(profile.spend[cat] ?? 0)}</span>
            </div>
            {lines.map((l) => {
              const hits = plan.outcomes.filter(
                (o) =>
                  o.cardId === l.cardId &&
                  (o.campaign.category === cat || o.campaign.category === "tumu"),
              );
              return (
                <div className="plan-line" key={l.cardId}>
                  <CardLabel card={cardById(l.cardId)} />
                  <div className="plan-line-camps">
                    {hits.length === 0 ? (
                      <span className="muted small">Temel kazanç</span>
                    ) : (
                      hits.map((o) => (
                        <span key={o.campaign.id} className="tag tag-plan">
                          {o.campaign.title.replace(/^Örnek:\s*/, "")}
                        </span>
                      ))
                    )}
                  </div>
                  <strong className="num plan-amount">{formatKurus(l.amountKurus)}</strong>
                </div>
              );
            })}
          </div>
        ))}
      </section>

      {plan.nearMisses.length > 0 && (
        <section className="callout callout-soft">
          <h2>Az kaldı</h2>
          <ul className="near-list">
            {plan.nearMisses.map((n) => (
              <li key={n.campaign.id}>
                <span>
                  {cardById(n.cardId)?.name} ile <b>{formatKurus(n.missingKurus)}</b> daha harcarsan{" "}
                  <b className="pos">{formatKurus(n.rewardKurus)}</b> kazanırsın
                </span>
                <small className="muted">
                  {n.campaign.title} · {daysBetween(today, n.campaign.endsAt)} gün kaldı
                </small>
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.outcomes.length > 0 && (
        <section>
          <h2 className="section-title">Plandaki kampanyalar</h2>
          <ul className="outcome-list">
            {plan.outcomes.map((o) => (
              <li key={o.campaign.id}>
                <span>
                  <strong>{o.campaign.title}</strong>
                  <small className="muted">
                    {cardById(o.cardId)?.name} · {formatKurus(o.spentKurus)} harcama ·{" "}
                    {rewardText(o.campaign)}
                  </small>
                </span>
                <strong className="num pos">+{formatKurus(o.rewardKurus)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.outcomes.length === 0 && (
        <p className="muted note">
          Kartlarına ve harcamana uyan aktif kampanya yok. Yeni kampanyalar onaylandıkça plan
          kendiliğinden güncellenir.
        </p>
      )}
      {unverified && (
        <p className="muted note small">
          Bazı kartların temel puan oranı henüz banka kaynağından doğrulanmadı; bu kartlarda temel
          kazanç 0 sayılır.
        </p>
      )}
    </>
  );
}
