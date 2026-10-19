/** Türkiye takvimine göre bugün (UTC+3, yaz saati yok): "YYYY-MM-DD". */
export function turkeyToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function monthBounds(day: string): { start: string; end: string } {
  const [y, m] = day.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

/** a'dan b'ye gün farkı (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

/** "2026-10-19" → "19 Ekim" (yıl farklıysa "19 Ekim 2027"). */
export function formatDay(day: string, today?: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const base = `${d} ${MONTHS[m - 1]}`;
  return today && today.slice(0, 4) === String(y) ? base : `${base} ${y}`;
}

export function monthName(day: string): string {
  const [y, m] = day.split("-").map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${y}`;
}
