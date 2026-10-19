import { useState } from "react";
import { CATEGORIES } from "../lib/categories";
import { formatKurus, kurusToInput, parseTlInput } from "../lib/money";
import type { CategorySlug, SpendProfile } from "../lib/types";

const SLIDER_MAX = 2_000_000; // 20.000 TL

export function SpendForm({
  value,
  onChange,
}: {
  value: SpendProfile;
  onChange: (v: SpendProfile) => void;
}) {
  const total = Object.values(value).reduce((s, v) => s + (v ?? 0), 0);
  return (
    <div className="spend">
      {CATEGORIES.map((c) => (
        <SpendRow
          key={c.slug}
          slug={c.slug}
          name={c.name}
          icon={c.icon}
          hint={c.hint}
          kurus={value[c.slug] ?? 0}
          onChange={(k) => onChange({ ...value, [c.slug]: k })}
        />
      ))}
      <div className="spend-total">
        <span>Aylık toplam</span>
        <strong className="num">{formatKurus(total)}</strong>
      </div>
    </div>
  );
}

function SpendRow(props: {
  slug: CategorySlug;
  name: string;
  icon: string;
  hint: string;
  kurus: number;
  onChange: (k: number) => void;
}) {
  const { slug, name, icon, hint, kurus, onChange } = props;
  const [text, setText] = useState(kurusToInput(kurus));
  const [bad, setBad] = useState(false);
  const id = `spend-${slug}`;
  return (
    <div className={`spend-row ${kurus > 0 ? "has" : ""}`}>
      <label htmlFor={id} className="spend-label">
        <span className="spend-icon" aria-hidden="true">
          {icon}
        </span>
        <span>
          <strong>{name}</strong>
          <small>{hint}</small>
        </span>
      </label>
      <input
        type="range"
        min={0}
        max={SLIDER_MAX}
        step={25_000}
        value={Math.min(kurus, SLIDER_MAX)}
        aria-label={`${name} aylık tutar`}
        onChange={(e) => {
          const k = Number(e.target.value);
          onChange(k);
          setText(kurusToInput(k));
          setBad(false);
        }}
      />
      <div className={`money-input ${bad ? "bad" : ""}`}>
        <input
          id={id}
          inputMode="decimal"
          placeholder="0"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const k = e.target.value.trim() === "" ? 0 : parseTlInput(e.target.value);
            setBad(k === null);
            if (k !== null) onChange(k);
          }}
        />
        <span>₺</span>
      </div>
    </div>
  );
}
