import type { CatalogCard } from "../lib/types";

export function MiniCard({ card, small }: { card: CatalogCard; small?: boolean }) {
  return (
    <div
      className={`minicard prog-${card.program} ${small ? "minicard-sm" : ""}`}
      aria-hidden="true"
    >
      <span className="minicard-prog">{card.programName}</span>
      <span className="minicard-chip" />
      {!small && <span className="minicard-name">{card.name}</span>}
    </div>
  );
}

export function CardLabel({ card }: { card: CatalogCard | undefined }) {
  if (!card) return <span className="muted">Bilinmeyen kart</span>;
  return (
    <span className="cardlabel">
      <MiniCard card={card} small />
      <span>
        <strong>{card.name}</strong>
        <small>{card.bank}</small>
      </span>
    </span>
  );
}
