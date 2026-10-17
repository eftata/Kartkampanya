"use client";

import Form from "next/form";
import Link from "next/link";

import type { CampaignFilterParams } from "@/lib/campaign-filters";
import { REWARD_SLUGS } from "@/lib/campaign-filters";
import { REWARD_LABELS } from "@/lib/campaign-labels";

const selectClass =
  "border-input focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px]";

type Option = { id: string; name: string };

/**
 * Filtreler URL'de durur (paylaşılabilir, geri tuşuyla çalışır). Seçim değişince form kendini
 * gönderir; `next/form` istemci tarafında gezinir. JS yoksa "Uygula" düğmesiyle çalışır.
 */
export function CampaignFilters({
  cards,
  categories,
  values,
}: {
  cards: Option[];
  categories: Option[];
  values: CampaignFilterParams;
}) {
  const filtered = Boolean(values.kart || values.kategori || values.tur);
  return (
    <Form
      action="/kampanyalarim"
      aria-label="Kampanya filtreleri"
      className="flex flex-wrap items-end gap-3"
      onChange={(event) => event.currentTarget.requestSubmit()}
    >
      <label className="space-y-1 text-sm">
        <span className="block font-medium">Kart</span>
        <select name="kart" defaultValue={values.kart} className={selectClass}>
          <option value="">Tüm kartlarım</option>
          {cards.map((card) => (
            <option key={card.id} value={card.id}>
              {card.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="block font-medium">Kategori</span>
        <select name="kategori" defaultValue={values.kategori} className={selectClass}>
          <option value="">Tüm kategorilerim</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="block font-medium">Fayda</span>
        <select name="tur" defaultValue={values.tur} className={selectClass}>
          <option value="">Tümü</option>
          {Object.entries(REWARD_SLUGS).map(([slug, type]) => (
            <option key={slug} value={slug}>
              {REWARD_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="block font-medium">Sırala</span>
        <select name="sirala" defaultValue={values.sirala} className={selectClass}>
          <option value="bitis">Bitişi yakın önce</option>
          <option value="kazanc">Tahmini kazanç</option>
        </select>
      </label>
      <noscript>
        <button type="submit" className="h-9 rounded-md border px-3 text-sm">
          Uygula
        </button>
      </noscript>
      {filtered && (
        <Link
          href="/kampanyalarim"
          className="text-muted-foreground h-9 text-sm leading-9 underline"
        >
          Filtreleri temizle
        </Link>
      )}
    </Form>
  );
}
