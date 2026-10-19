import { useMemo, useState } from "react";
import { formatBps } from "../lib/money";
import type { CatalogCard } from "../lib/types";
import { MiniCard } from "./MiniCard";

export function CardPicker({
  catalog,
  selected,
  onChange,
}: {
  catalog: CatalogCard[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    const m = new Map<string, CatalogCard[]>();
    for (const c of catalog) {
      const hay = `${c.name} ${c.bank} ${c.programName}`.toLocaleLowerCase("tr");
      if (needle && !hay.includes(needle)) continue;
      const key = `${c.programName} · ${c.bank}`;
      m.set(key, [...(m.get(key) ?? []), c]);
    }
    return [...m.entries()];
  }, [catalog, q]);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  if (catalog.length === 0) {
    return (
      <div className="empty">
        <p>Kart kataloğu henüz boş.</p>
        <p className="muted">
          Yönetici “Yönetim → Kataloğu yükle” ile başlangıç kartlarını ekleyebilir.
        </p>
      </div>
    );
  }

  return (
    <div className="picker">
      <input
        className="input"
        type="search"
        placeholder="Kart, banka ya da program ara…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Kart ara"
      />
      {groups.map(([group, cards]) => (
        <section key={group} className="picker-group">
          <h3>{group}</h3>
          <div className="picker-grid">
            {cards.map((c) => {
              const on = selected.includes(c.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  className={`pick ${on ? "on" : ""}`}
                  aria-pressed={on}
                  onClick={() => toggle(c.id)}
                >
                  <MiniCard card={c} small />
                  <span className="pick-text">
                    <strong>{c.name}</strong>
                    <small>
                      {c.verified ? `Temel ${formatBps(c.baseRateBps)}` : "Oran doğrulanmadı"}
                    </small>
                  </span>
                  <span className="pick-check" aria-hidden="true">
                    {on ? "✓" : "+"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {groups.length === 0 && <p className="muted">“{q}” ile eşleşen kart yok.</p>}
    </div>
  );
}
