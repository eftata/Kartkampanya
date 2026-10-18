/**
 * Herkese açık kampanya adresleri (ADR 0020): `/kampanyalar/<başlıktan-slug>-<id>`. Arama
 * motorları için başlık adreste görünür; kampanyayı yalnızca sondaki id belirler, başlık
 * değişirse eski bağlantı yeni adrese kalıcı yönlenir. Saf modül.
 */

const TURKISH: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
const MAX_SLUG = 80;

/** "Market'te 500 TL'ye %10 İade!" → "markette-500-tlye-10-iade". */
export function slugify(text: string): string {
  const slug = text
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (char) => TURKISH[char] ?? char)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, MAX_SLUG).replace(/-+$/, "") || "kampanya";
}

/** Kampanyanın kalıcı (kanonik) adresi. */
export function campaignPath(campaign: { id: string; title: string }): string {
  return `/kampanyalar/${slugify(campaign.title)}-${campaign.id}`;
}

/** Adres parçası → kampanya id'si (cuid tire içermez: son tireden sonrası). */
export function campaignIdFromParam(param: string): string | null {
  const id = decodeURIComponent(param).split("-").pop() ?? "";
  return /^[a-z0-9]{1,100}$/.test(id) ? id : null;
}
