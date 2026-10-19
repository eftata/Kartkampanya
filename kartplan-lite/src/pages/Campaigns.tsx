import { CampaignItem } from "../components/CampaignItem";
import { PageHead } from "../components/Layout";
import { BENEFIT_LABEL, CATEGORIES } from "../lib/categories";
import { estimateForProfile, eligibleCards, optimize } from "../lib/optimizer";
import { navigate, usePath } from "../lib/router";
import { useSession } from "../lib/store";
import type { Benefit } from "../lib/types";

export function Campaigns() {
  const { user, profile, myCards, campaigns, today } = useSession();
  const { search } = usePath();
  const scope = search.get("kapsam") === "tumu" ? "tumu" : "bana";
  const card = search.get("kart") ?? "";
  const cat = search.get("kategori") ?? "";
  const tur = search.get("tur") ?? "";
  const sort = search.get("sirala") === "kazanc" ? "kazanc" : "bitis";

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    navigate(`/kampanyalar${qs ? `?${qs}` : ""}`, true);
  };

  const plan = optimize({
    cards: myCards,
    spend: profile.spend,
    campaigns,
    joined: profile.joined,
    today,
  });
  const inPlan = new Set(plan.outcomes.map((o) => o.campaign.id));
  const spendCats = new Set(
    Object.entries(profile.spend)
      .filter(([, v]) => (v ?? 0) > 0)
      .map(([k]) => k),
  );

  const rows = campaigns
    .filter((c) => c.status === "yayinda" && c.endsAt >= today)
    .map((c) => ({
      c,
      cards: eligibleCards(c, myCards),
      est: estimateForProfile(c, profile.spend),
    }))
    .filter(({ c, cards }) => {
      if (
        scope === "bana" &&
        (cards.length === 0 || (c.category !== "tumu" && !spendCats.has(c.category)))
      )
        return false;
      if (card && !cards.some((k) => k.id === card)) return false;
      if (cat && c.category !== cat && c.category !== "tumu") return false;
      if (tur && c.benefit !== tur) return false;
      return true;
    })
    .sort(
      (a, b) =>
        (sort === "kazanc" ? b.est - a.est : a.c.endsAt.localeCompare(b.c.endsAt)) ||
        a.c.title.localeCompare(b.c.title, "tr"),
    );

  return (
    <>
      <PageHead
        kicker="Kampanyalar"
        title={scope === "bana" ? "Sana uyan kampanyalar" : "Tüm kampanyalar"}
      >
        Kartlarına ve harcama alanlarına göre süzüldü. Katıldıklarını işaretle, plan buna göre
        güncellensin.
      </PageHead>

      <div className="segmented" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={scope === "bana"}
          onClick={() => set("kapsam", "")}
        >
          Bana uygun
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === "tumu"}
          onClick={() => set("kapsam", "tumu")}
        >
          Tümü
        </button>
      </div>

      <div className="filters">
        <select
          className="input"
          value={card}
          onChange={(e) => set("kart", e.target.value)}
          aria-label="Kart"
        >
          <option value="">Tüm kartlarım</option>
          {myCards.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={cat}
          onChange={(e) => set("kategori", e.target.value)}
          aria-label="Kategori"
        >
          <option value="">Tüm kategoriler</option>
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={tur}
          onChange={(e) => set("tur", e.target.value)}
          aria-label="Fayda türü"
        >
          <option value="">Tüm faydalar</option>
          {(Object.keys(BENEFIT_LABEL) as Benefit[]).map((b) => (
            <option key={b} value={b}>
              {BENEFIT_LABEL[b]}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={sort}
          onChange={(e) => set("sirala", e.target.value === "kazanc" ? "kazanc" : "")}
          aria-label="Sıralama"
        >
          <option value="bitis">Bitişe göre</option>
          <option value="kazanc">Kazanca göre</option>
        </select>
      </div>

      <p className="muted small count">{rows.length} kampanya</p>

      <div className="campaign-list">
        {rows.map(({ c, cards, est }) => (
          <CampaignItem
            key={c.id}
            campaign={c}
            cards={cards}
            uid={user.uid}
            joined={!!profile.joined[c.id]}
            today={today}
            estimateKurus={cards.length ? est : undefined}
            inPlan={inPlan.has(c.id)}
          />
        ))}
      </div>

      {rows.length === 0 && (
        <div className="empty">
          <p>Bu filtrelere uyan kampanya yok.</p>
          {scope === "bana" && (
            <button type="button" className="btn btn-ghost" onClick={() => set("kapsam", "tumu")}>
              Tüm kampanyaları göster
            </button>
          )}
        </div>
      )}
    </>
  );
}
