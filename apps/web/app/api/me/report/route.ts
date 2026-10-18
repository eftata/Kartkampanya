import { PlanMonth } from "@kartplan/shared";

import { jsonError, withUser } from "@/lib/api";
import { turkeyToday } from "@/lib/campaign-match";
import { previousMonth } from "@/lib/month-report";
import { getMonthReport, toMonthReportDto } from "@/lib/month-report-data";

/** Ay sonu raporu (`?month=YYYY-AA`; varsayılan geçen ay). Gelecek ay 400. */
export function GET(request: Request) {
  return withUser(async (user) => {
    const today = turkeyToday();
    const raw = new URL(request.url).searchParams.get("month");
    const month = raw === null ? previousMonth(today.slice(0, 7)) : PlanMonth.safeParse(raw);
    if (typeof month !== "string" && !month.success) {
      return jsonError(400, month.error.issues[0]?.message ?? "Geçersiz ay.");
    }
    const value = typeof month === "string" ? month : month.data;
    if (value > today.slice(0, 7)) return jsonError(400, "Gelecek ayın raporu olmaz.");
    return Response.json(toMonthReportDto(await getMonthReport(user.id, value, today)));
  });
}
