import { useState } from "react";
import { BENEFIT_LABEL, categoryIcon, categoryName } from "../lib/categories";
import { setJoined } from "../lib/data";
import { daysBetween, formatDay } from "../lib/dates";
import { formatBps, formatKurus } from "../lib/money";
import type { Campaign, CatalogCard } from "../lib/types";

export function rewardText(c: Campaign): string {
  if (c.rewardKind === "sabit") return formatKurus(c.rewardKurus);
  return `${formatBps(c.rateBps)}${c.capKurus > 0 ? ` · en fazla ${formatKurus(c.capKurus)}` : ""}`;
}

export function conditionText(c: Campaign): string {
  const where =
    c.category === "tumu"
      ? "tüm harcamalarda"
      : `${categoryName(c.category).toLocaleLowerCase("tr")} harcamalarında`;
  if (c.rewardKind === "sabit") {
    return `Kampanya süresince ${where} toplam ${formatKurus(c.minSpendKurus)} harcamaya ${formatKurus(c.rewardKurus)} ${BENEFIT_LABEL[c.benefit].toLocaleLowerCase("tr")}.`;
  }
  const min = c.minSpendKurus > 0 ? ` (en az ${formatKurus(c.minSpendKurus)} harcamada)` : "";
  const cap = c.capKurus > 0 ? `, en fazla ${formatKurus(c.capKurus)}` : "";
  return `${where[0]?.toLocaleUpperCase("tr")}${where.slice(1)} ${formatBps(c.rateBps)} ${BENEFIT_LABEL[c.benefit].toLocaleLowerCase("tr")}${min}${cap}.`;
}

export function CampaignItem({
  campaign: c,
  cards,
  joined,
  uid,
  today,
  estimateKurus,
  inPlan,
}: {
  campaign: Campaign;
  cards: CatalogCard[];
  joined: boolean;
  uid: string;
  today: string;
  estimateKurus?: number;
  inPlan?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const isJoined = joined;
  const left = daysBetween(today, c.endsAt);
  const notStarted = c.startsAt > today;

  async function toggle() {
    // Firestore yerel yazımı anında yansıtır; hata olursa anlık görüntü eski değere döner.
    setBusy(true);
    try {
      await setJoined(uid, c.id, !isJoined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`campaign prog-edge-${c.program}`}>
      <header className="campaign-head">
        <span className="campaign-cat" aria-hidden="true">
          {categoryIcon(c.category)}
        </span>
        <div>
          <h3>{c.title}</h3>
          <p className="muted small">
            {cards.length > 0 ? cards.map((k) => k.name).join(", ") : c.program} ·{" "}
            {categoryName(c.category)}
          </p>
        </div>
        <div className="campaign-reward">
          <span className="kicker">{BENEFIT_LABEL[c.benefit]}</span>
          <strong className="num">{rewardText(c)}</strong>
        </div>
      </header>

      <p className="campaign-cond">{c.summary || conditionText(c)}</p>

      <div className="tags">
        {c.demo && <span className="tag tag-demo">Örnek</span>}
        {inPlan && <span className="tag tag-plan">Plana dahil</span>}
        {c.requiresJoin && !isJoined && <span className="tag tag-warn">Katılım gerekli</span>}
        {isJoined && <span className="tag tag-ok">Katıldın</span>}
        {notStarted ? (
          <span className="tag">Başlangıç: {formatDay(c.startsAt, today)}</span>
        ) : left <= 3 ? (
          <span className="tag tag-hot">{left === 0 ? "Bugün bitiyor" : `Son ${left} gün`}</span>
        ) : (
          <span className="tag">{formatDay(c.endsAt, today)}'e kadar</span>
        )}
        {estimateKurus !== undefined && estimateKurus > 0 && (
          <span className="tag tag-gain">Tahmini kazancın {formatKurus(estimateKurus)}</span>
        )}
      </div>

      {(c.requiresJoin || c.url) && (
        <footer className="campaign-foot">
          {c.requiresJoin && (
            <>
              {c.joinHint && <span className="muted small">Nasıl katılırım: {c.joinHint}</span>}
              <button
                type="button"
                className={`btn ${isJoined ? "btn-ghost" : "btn-soft"}`}
                disabled={busy}
                onClick={toggle}
              >
                {isJoined ? "Katılımı geri al" : "Katıldım"}
              </button>
            </>
          )}
          {c.url && (
            <a className="btn btn-link" href={c.url} target="_blank" rel="noopener noreferrer">
              Bankanın sayfası ↗
            </a>
          )}
        </footer>
      )}
    </article>
  );
}
