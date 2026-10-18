/**
 * Ekstre açıklamasından marka tahmini (saf; ADR 0028). Ekstreler büyük harf ve çoğu zaman Türkçe
 * karaktersiz yazar ("MIGROS KADIKOY", "SOK MARKET"): iki taraf da sadeleştirilip kelime sınırıyla
 * aranır, en uzun eşleşen marka seçilir.
 */

const FOLD: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  i: "i",
  ö: "o",
  ş: "s",
  ü: "u",
};

export function foldText(text: string): string {
  return ` ${text
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (char) => FOLD[char] ?? char)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

export type MerchantCandidate = { id: string; name: string; categoryId: string };

export function suggestMerchant(
  description: string,
  merchants: MerchantCandidate[],
): MerchantCandidate | null {
  const haystack = foldText(description);
  let best: MerchantCandidate | null = null;
  let bestLength = 0;
  for (const merchant of merchants) {
    const needle = foldText(merchant.name);
    if (needle.trim().length < 2) continue;
    // Kelime sınırı: " sok " "sokak" içinde bulunmasın.
    if (haystack.includes(needle) && needle.length > bestLength) {
      best = merchant;
      bestLength = needle.length;
    }
  }
  return best;
}
