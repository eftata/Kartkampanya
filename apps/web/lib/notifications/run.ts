import "server-only";

import { getPrisma } from "@kartplan/db";
import { parseNotificationPrefs } from "@kartplan/shared";

import { turkeyToday } from "@/lib/campaign-match";
import { getMyCampaigns } from "@/lib/campaigns";
import { previousMonth } from "@/lib/month-report";
import { getMonthReport } from "@/lib/month-report-data";
import { sendMail } from "@/lib/email/send";
import type { SendMail } from "@/lib/email/send";
import { isoWeek, pickNotifications } from "@/lib/notifications/pick";
import type { NotificationKind } from "@/lib/notifications/pick";
import {
  endingSoonEmail,
  joinReminderEmail,
  monthlyReportEmail,
  weeklySummaryEmail,
} from "@/lib/notifications/templates";
import type { Email, Links } from "@/lib/notifications/templates";
import { unsubscribeParams } from "@/lib/notifications/unsubscribe";
import type { UnsubscribeTarget } from "@/lib/notifications/unsubscribe";
import { getMonthlyPlan } from "@/lib/plan";
import { sendPushToUser } from "@/lib/push";
import type { PushSender } from "@/lib/push";
import { monthLabel } from "@/lib/plan-request";

export type NotificationStats = {
  users: number;
  sent: Record<NotificationKind, number>;
  failed: number;
  /** Push açık cihazlara giden bildirim sayısı (ADR 0031). */
  pushed: number;
};

/**
 * Günlük bildirim işi (ADR 0018): e-postası doğrulanmış, silinmemiş ve kartı olan her kullanıcı
 * için hangi bildirimlerin gideceğini seçer, tür başına tek toplu e-posta gönderir ve gönderilenleri
 * `NotificationLog`'a yazar (aynısı bir daha gitmez). E-posta gidince aynı bildirimin kısa hâli
 * push açık cihazlara da gönderilir (ADR 0031). Bir kullanıcının hatası diğerlerini durdurmaz.
 */
export async function runNotifications({
  base,
  secret,
  today = turkeyToday(),
  forceWeekly = false,
  forceMonthly = false,
  send = sendMail,
  push,
  userIds,
}: {
  /** E-postadaki bağlantıların kökü (https://alan-adı). */
  base: string;
  /** İmza anahtarı (AUTH_SECRET). */
  secret: string;
  today?: string;
  forceWeekly?: boolean;
  forceMonthly?: boolean;
  send?: SendMail;
  /** Push gönderici (testler); verilmezse VAPID yapılandırmasıyla web push. */
  push?: PushSender;
  /** Yalnızca bu kullanıcılar (testler ve elle çalıştırma). */
  userIds?: string[];
}): Promise<NotificationStats> {
  const prisma = getPrisma();
  const stats: NotificationStats = {
    users: 0,
    sent: { JOIN_REMINDER: 0, ENDING_SOON: 0, WEEKLY_SUMMARY: 0, MONTHLY_REPORT: 0 },
    failed: 0,
    pushed: 0,
  };
  const users = await prisma.user.findMany({
    where: {
      emailVerified: { not: null },
      deletedAt: null,
      cards: { some: {} },
      ...(userIds ? { id: { in: userIds } } : {}),
    },
    select: { id: true, email: true, notifyPrefs: true },
    orderBy: { id: "asc" },
  });

  for (const user of users) {
    const prefs = parseNotificationPrefs(user.notifyPrefs);
    if (!Object.values(prefs).some(Boolean)) continue;
    stats.users += 1;
    const links: Links = {
      base,
      unsubscribe: (target) => `${base}/abonelik?${unsubscribeParams(user.id, target, secret)}`,
    };
    const deliver = async (email: Email, kind: NotificationKind, keys: string[]) => {
      try {
        await send({
          to: user.email,
          subject: email.subject,
          text: email.text,
          html: email.html,
          headers: oneClickHeaders(base, user.id, email.unsubscribe, secret),
        });
        await prisma.notificationLog.createMany({
          data: keys.map((key) => ({ userId: user.id, kind, key })),
          skipDuplicates: true,
        });
        stats.sent[kind] += 1;
      } catch (error) {
        stats.failed += 1;
        console.error(`bildirim ${kind} gönderilemedi (kullanıcı ${user.id}):`, error);
        return;
      }
      try {
        stats.pushed += (await sendPushToUser(user.id, email.push, push)).sent;
      } catch (error) {
        console.error(`push ${kind} gönderilemedi (kullanıcı ${user.id}):`, error);
      }
    };

    try {
      const campaigns = await getMyCampaigns(user.id, { sort: "ends" }, today);
      const week = isoWeek(today);
      const lastMonth = previousMonth(today.slice(0, 7));
      const logs = await prisma.notificationLog.findMany({
        where: {
          userId: user.id,
          key: { in: [...campaigns.map((c) => c.id), week, lastMonth] },
        },
        select: { kind: true, key: true },
      });
      const picked = pickNotifications({
        campaigns,
        today,
        sent: new Set(logs.map((log) => `${log.kind}:${log.key}`)),
        prefs,
        forceWeekly,
        forceMonthly,
      });
      if (picked.joinReminders.length) {
        await deliver(
          joinReminderEmail(picked.joinReminders, links),
          "JOIN_REMINDER",
          picked.joinReminders.map((c) => c.id),
        );
      }
      if (picked.endingSoon.length) {
        await deliver(
          endingSoonEmail(picked.endingSoon, today, links),
          "ENDING_SOON",
          picked.endingSoon.map((c) => c.id),
        );
      }
      if (picked.weekly) {
        const result = await getMonthlyPlan(user.id, { today });
        if (result.status === "ok") {
          const { plan, categoryName, cardName, ruleCampaign } = result.view;
          const toJoin = new Map<string, string>();
          for (const hit of plan.campaignsHit) {
            const ref = ruleCampaign[hit.id];
            if (ref?.joinRequired && !ref.joined) toJoin.set(ref.id, ref.title);
          }
          await deliver(
            weeklySummaryEmail(
              {
                monthLabel: monthLabel(result.view.month),
                totalKurus: plan.totalExpected,
                baselineKurus: plan.baseline.total,
                rows: plan.allocations.map((row) => ({
                  category: categoryName[row.category] ?? row.category,
                  card: cardName[row.card] ?? row.card,
                  amountKurus: row.amount,
                })),
                toJoin: [...toJoin].map(([id, title]) => ({ id, title })),
              },
              links,
            ),
            "WEEKLY_SUMMARY",
            [picked.weekly],
          );
        }
      }
      if (picked.monthly) {
        // Yalnızca o ay harcama girdiyse (aksi halde rapor boş ve anlamsız).
        const report = await getMonthReport(user.id, picked.monthly, today);
        if (report.spentKurus > 0) {
          await deliver(
            monthlyReportEmail(
              {
                month: report.month,
                monthLabel: monthLabel(report.month),
                campaignEarnedKurus: report.campaignEarnedKurus,
                baseEarnedKurus: report.baseEarnedKurus,
                earned: report.earned,
                missed: report.missed.map((item) => ({
                  id: item.id,
                  title: item.title,
                  rewardKurus: item.rewardKurus,
                  note: item.reason === "not_joined" ? "katılmadın" : "eşiğe ulaşılmadı",
                })),
              },
              links,
            ),
            "MONTHLY_REPORT",
            [picked.monthly],
          );
        }
      }
    } catch (error) {
      stats.failed += 1;
      console.error(`bildirimler hazırlanamadı (kullanıcı ${user.id}):`, error);
    }
  }
  return stats;
}

/** RFC 8058: posta istemcisinin "abonelikten çık" düğmesi tek tıkla (POST) çalışır. */
function oneClickHeaders(base: string, userId: string, target: UnsubscribeTarget, secret: string) {
  return {
    "List-Unsubscribe": `<${base}/api/unsubscribe?${unsubscribeParams(userId, target, secret)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
