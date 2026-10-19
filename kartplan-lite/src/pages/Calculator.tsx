import { type FormEvent, useState } from "react";
import { PageHead } from "../components/Layout";
import { CardLabel } from "../components/MiniCard";
import { rewardText } from "../components/CampaignItem";
import { advise } from "../lib/advisor";
import { CATEGORIES } from "../lib/categories";
import { formatKurus, parseTlInput } from "../lib/money";
import { useSession } from "../lib/store";
import type { CategorySlug } from "../lib/types";

export function Calculator() {
  const { myCards, campaigns, profile, today } = useSession();
  const [amountText, setAmountText] = useState("");
  const [category, setCategory] = useState<CategorySlug>("market");
  const [day, setDay] = useState(today);
  const [query, setQuery] = useState<{
    amount: number;
    category: CategorySlug;
    day: string;
  } | null>(null);
  const [err, setErr] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const amount = parseTlInput(amountText);
    if (!amount) {
      setErr("Geçerli bir tutar gir (ör. 1.250,50).");
      return;
    }
    setErr("");
    setQuery({ amount, category, day });
  }

  const results = query
    ? advise({
        cards: myCards,
        campaigns,
        joined: profile.joined,
        amountKurus: query.amount,
        category: query.category,
        day: query.day,
      })
    : [];
  const top = results[0];

  return (
    <>
      <PageHead kicker="Tek alışveriş" title="Bu alışverişi hangi kartla yapmalıyım?">
        Tutarı ve kategoriyi gir; kartlarını o günkü kampanyalara göre sıralayalım.
      </PageHead>

      <form className="calc" onSubmit={submit}>
        <label className="field">
          <span>Tutar</span>
          <div className="money-input money-input-lg">
            <input
              inputMode="decimal"
              placeholder="0"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              autoFocus
            />
            <span>₺</span>
          </div>
        </label>
        <div className="chips" role="radiogroup" aria-label="Kategori">
          {CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.slug}
              role="radio"
              aria-checked={category === c.slug}
              className={`chip ${category === c.slug ? "on" : ""}`}
              onClick={() => setCategory(c.slug)}
            >
              <span aria-hidden="true">{c.icon}</span> {c.name}
            </button>
          ))}
        </div>
        <div className="calc-row">
          <label className="field">
            <span>Tarih</span>
            <input
              className="input"
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value || today)}
            />
          </label>
          <button className="btn btn-primary">Hesapla</button>
        </div>
        {err && <p className="form-error">{err}</p>}
      </form>

      {query && top && (
        <section className="advice">
          <div className="advice-best">
            <span className="kicker">En iyi seçenek</span>
            <CardLabel card={top.card} />
            <strong className="big num">{formatKurus(top.totalKurus)}</strong>
            <span className="muted small">{formatKurus(query.amount)} harcamada kazanç</span>
          </div>
          <ol className="advice-list">
            {results.map((r, i) => (
              <li key={r.card.id} className={i === 0 ? "first" : undefined}>
                <div className="advice-head">
                  <CardLabel card={r.card} />
                  <strong className="num">{formatKurus(r.totalKurus)}</strong>
                </div>
                <ul className="advice-detail">
                  <li>Temel kazanç {formatKurus(r.baseKurus)}</li>
                  {r.campaigns.map((x) => (
                    <li key={x.campaign.id}>
                      {x.rewardKurus > 0 ? (
                        <>
                          <b className="pos">+{formatKurus(x.rewardKurus)}</b> {x.campaign.title}
                        </>
                      ) : (
                        <>
                          {x.campaign.title} · <b>{formatKurus(x.missingKurus)}</b> daha harcarsan{" "}
                          {rewardText(x.campaign)}
                        </>
                      )}
                      {x.needsJoin && <span className="tag tag-warn">Katılım gerekli</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <p className="muted small note">
            Hesap bu ay daha önce yaptığın harcamaları bilmez: toplam harcama eşiği olan
            kampanyalarda yalnızca bu alışverişe bakar.
          </p>
        </section>
      )}
      {query && !top && <p className="muted">Önce kart ekle.</p>}
    </>
  );
}
