/**
 * Kapalı beta hunisi (saf; ADR 0025): kayıt → kart → plan → 2. haftada geri dönüş.
 *
 * - Kayıt: açık rızanın ilk verildiği an (onay ekranını geçmeyen hesap kayıt sayılmaz).
 * - 2. hafta: kayıt günü 0. gün olmak üzere 7–13. günlerden birinde uygulamayı kullandı. Yalnızca
 *   kaydının üzerinden 14 gün geçmiş kullanıcılar için ölçülür; diğerleri "henüz ölçülemez".
 * Günler Türkiye takvimidir.
 */
import { daysBetween, turkeyToday } from "@/lib/campaign-match";

export type FunnelUser = {
  signedUpAt: Date;
  firstCardAt: Date | null;
  firstPlanViewAt: Date | null;
  /** "YYYY-AA-GG" kullanım günleri. */
  activeDays: string[];
};

export type FunnelStep = { key: string; label: string; count: number };

export type FunnelResult = {
  steps: FunnelStep[];
  /** 2. hafta dönüşü yalnızca ölçülebilenler arasında. */
  week2: { eligible: number; returned: number };
};

export const WEEK2_FROM_DAY = 7;
export const WEEK2_TO_DAY = 13;

/** Kayıt gününden (0) itibaren gün farkı. */
const dayIndex = (signupDay: string, day: string) => daysBetween(signupDay, day) - 1;

export function returnedInWeek2(user: FunnelUser): boolean {
  const signup = turkeyToday(user.signedUpAt);
  return user.activeDays.some((day) => {
    const index = dayIndex(signup, day);
    return index >= WEEK2_FROM_DAY && index <= WEEK2_TO_DAY;
  });
}

export function computeFunnel(users: FunnelUser[], now: Date): FunnelResult {
  const today = turkeyToday(now);
  const eligible = users.filter(
    (user) => dayIndex(turkeyToday(user.signedUpAt), today) > WEEK2_TO_DAY,
  );
  const withCard = users.filter((user) => user.firstCardAt !== null);
  return {
    steps: [
      { key: "signup", label: "Kayıt oldu", count: users.length },
      { key: "card", label: "Kart girdi", count: withCard.length },
      {
        key: "plan",
        label: "Planı gördü",
        count: users.filter((user) => user.firstPlanViewAt !== null).length,
      },
    ],
    week2: { eligible: eligible.length, returned: eligible.filter(returnedInWeek2).length },
  };
}

/** Kayıt haftasının pazartesisi ("YYYY-AA-GG", Türkiye takvimi). */
export function weekOf(date: Date): string {
  const day = turkeyToday(date);
  const utc = new Date(`${day}T00:00:00Z`);
  const offset = (utc.getUTCDay() + 6) % 7; // pazartesi = 0
  return new Date(utc.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
}

/** Kayıt haftasına göre kohortlar, yeniden eskiye. */
export function funnelCohorts(users: FunnelUser[], now: Date) {
  const groups = new Map<string, FunnelUser[]>();
  for (const user of users) {
    const week = weekOf(user.signedUpAt);
    groups.set(week, [...(groups.get(week) ?? []), user]);
  }
  return [...groups]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([week, members]) => ({ week, ...computeFunnel(members, now) }));
}

/** Yüzde (tam sayı); payda 0 ise null. */
export const percent = (part: number, whole: number) =>
  whole === 0 ? null : Math.round((part / whole) * 100);
