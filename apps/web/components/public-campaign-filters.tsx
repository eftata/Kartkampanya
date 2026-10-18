"use client";

import Form from "next/form";
import Link from "next/link";

import type { PublicFilterParams } from "@/lib/campaign-filters";

const selectClass =
  "border-input focus-visible:ring-ring/50 h-9 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-[3px]";

type Option = { slug: string; name: string };

/** `/kampanyalar` filtreleri; URL'de durur, seçim değişince kendini gönderir (bkz. CampaignFilters). */
export function PublicCampaignFilters({
  programs,
  categories,
  values,
}: {
  programs: Option[];
  categories: Option[];
  values: PublicFilterParams;
}) {
  return (
    <Form
      action="/kampanyalar"
      aria-label="Kampanya filtreleri"
      className="flex flex-wrap items-end gap-3"
      onChange={(event) => event.currentTarget.requestSubmit()}
    >
      <label className="space-y-1 text-sm">
        <span className="block font-medium">Kart programı</span>
        <select name="program" defaultValue={values.program} className={selectClass}>
          <option value="">Tümü</option>
          {programs.map((program) => (
            <option key={program.slug} value={program.slug}>
              {program.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="block font-medium">Kategori</span>
        <select name="kategori" defaultValue={values.kategori} className={selectClass}>
          <option value="">Tümü</option>
          {categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <noscript>
        <button type="submit" className="h-9 rounded-md border px-3 text-sm">
          Uygula
        </button>
      </noscript>
      {(values.program || values.kategori) && (
        <Link href="/kampanyalar" className="text-muted-foreground h-9 text-sm leading-9 underline">
          Filtreleri temizle
        </Link>
      )}
    </Form>
  );
}
