import { z } from "zod";

import { Kurus } from "./money";
import { PlanMonth } from "./plan";

/** Ay sonu raporu (Faz 2; ADR 0029): `GET /api/me/report?month=YYYY-AA`. */
export const MonthReportDto = z.object({
  month: PlanMonth,
  closed: z.boolean(),
  spentKurus: Kurus,
  spentByCategory: z.array(z.object({ category: z.string(), spentKurus: Kurus })),
  baseEarnedKurus: Kurus,
  campaignEarnedKurus: Kurus,
  expectedKurus: Kurus.nullable(),
  earned: z.array(
    z.object({
      campaignId: z.string(),
      title: z.string(),
      earnedKurus: Kurus,
      tiers: z.number().int(),
    }),
  ),
  missed: z.array(
    z.object({
      campaignId: z.string(),
      title: z.string(),
      reason: z.enum(["not_joined", "threshold"]),
      rewardKurus: Kurus,
      missing: z.number().int().nullable(),
      kind: z.enum(["amount", "single", "count"]),
    }),
  ),
  ongoing: z.number().int(),
});
export type MonthReportDto = z.infer<typeof MonthReportDto>;
