// Para her yerde kuruş cinsinden tamsayı, oranlar baz puan (50 = %0,5). Float ile para hesabı yok.

const TL = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** 123456 → "1.234,56 ₺" (kuruşsuzsa "1.234 ₺"). */
export function formatKurus(kurus: number): string {
  const sign = kurus < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(kurus));
  const lira = Math.floor(abs / 100);
  const k = abs % 100;
  const whole = TL.format(lira);
  return `${sign}${k === 0 ? whole : `${whole},${String(k).padStart(2, "0")}`} ₺`;
}

/** "1.234,5" / "1234.50" / "1234" → kuruş. Geçersizse null. */
export function parseTlInput(input: string): number | null {
  const s = input.trim().replace(/\s|₺|tl/gi, "");
  if (s === "") return null;
  let normalized: string;
  if (s.includes(",")) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    normalized = s.replace(/\./g, "");
  } else {
    normalized = s;
  }
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!m) return null;
  const lira = Number(m[1]);
  const kurus = Number((m[2] ?? "0").padEnd(2, "0"));
  const total = lira * 100 + kurus;
  return Number.isSafeInteger(total) ? total : null;
}

/** Kuruşu form alanında gösterilecek metne çevirir: 123450 → "1234,5". */
export function kurusToInput(kurus: number): string {
  if (!kurus) return "";
  const lira = Math.floor(kurus / 100);
  const k = kurus % 100;
  return k === 0 ? String(lira) : `${lira},${String(k).padStart(2, "0").replace(/0$/, "")}`;
}

/** 50 → "%0,5" */
export function formatBps(bps: number): string {
  return `%${(bps / 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
}

/** "0,5" → 50 bps. Geçersizse null. */
export function parsePercentInput(input: string): number | null {
  const s = input.trim().replace("%", "").replace(",", ".");
  if (s === "") return null;
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
  return bps <= 10000 ? bps : null;
}

/** Tutarın oranı: kuruş × bps / 10000, aşağı yuvarlanır. */
export function applyBps(kurus: number, bps: number): number {
  return Math.floor((kurus * bps) / 10000);
}

/** Serbest metinde kart numarasına benzeyen (13–19 hane) dizileri yakalar. */
export function looksLikeCardNumber(text: string): boolean {
  return /(?:\d[ -]?){13,19}/.test(text) && text.replace(/\D/g, "").length >= 13;
}
