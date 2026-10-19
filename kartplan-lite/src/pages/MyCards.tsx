import { useState } from "react";
import { CardPicker } from "../components/CardPicker";
import { PageHead } from "../components/Layout";
import { MiniCard } from "../components/MiniCard";
import { SaveBar, useSave } from "../components/SaveBar";
import { saveUser } from "../lib/data";
import { formatBps } from "../lib/money";
import { useSession } from "../lib/store";

export function MyCards() {
  const { user, profile, catalog } = useSession();
  const [ids, setIds] = useState(profile.cardIds);
  const dirty =
    ids.length !== profile.cardIds.length || ids.some((x) => !profile.cardIds.includes(x));
  const save = useSave(() => saveUser(user.uid, { cardIds: ids }));
  const selected = catalog.filter((c) => ids.includes(c.id));

  return (
    <>
      <PageHead kicker="Kartlarım" title="Cüzdanın">
        Kartlarını ekle ya da çıkar. Kart numarası istemeyiz; yalnızca kartın türü yeterli.
      </PageHead>

      {selected.length > 0 && (
        <div className="wallet">
          {selected.map((c) => (
            <div key={c.id} className="wallet-item">
              <MiniCard card={c} />
              <div className="wallet-meta">
                <span className="muted small">{c.bank}</span>
                <span className="small">
                  {c.verified ? `Temel ${formatBps(c.baseRateBps)}` : "Oran doğrulanmadı"}
                </span>
              </div>
              <button
                type="button"
                className="btn-text"
                onClick={() => setIds(ids.filter((x) => x !== c.id))}
              >
                Kaldır
              </button>
            </div>
          ))}
        </div>
      )}

      <h2 className="section-title">Kart ekle</h2>
      <CardPicker catalog={catalog} selected={ids} onChange={setIds} />
      <SaveBar dirty={dirty} {...save} onSave={save.run} onReset={() => setIds(profile.cardIds)} />
    </>
  );
}
