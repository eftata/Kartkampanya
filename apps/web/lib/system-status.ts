import "server-only";

import { getPrisma } from "@kartplan/db";

import { turkeyToday } from "@/lib/campaign-match";
import { JOBS, PIPELINE_MAX_AGE_HOURS } from "@/lib/jobs";
import type { JobName } from "@/lib/jobs";
import { pingRateLimitStore } from "@/lib/rate-limit";
import { missingFromSource, runHealth } from "@/lib/system-health";
import type { ComponentCheck, Components, ComponentState } from "@/lib/system-health";

/**
 * İzleme verisi (ADR 0023): bileşenlerin erişilebilirliği (herkese açık `/api/status`) ve admin
 * "Sistem durumu" panosu. Kişisel veri yok: yalnızca sayılar ve iş kayıtları.
 */

async function timed(check: () => Promise<ComponentState>): Promise<ComponentCheck> {
  const started = performance.now();
  let state: ComponentState;
  try {
    state = await check();
  } catch {
    state = "down";
  }
  return { state, ms: Math.round(performance.now() - started) };
}

async function engineHealth(): Promise<ComponentState> {
  const url = process.env.ENGINE_URL;
  if (!url) return "disabled";
  const response = await fetch(new URL("/health", url), {
    signal: AbortSignal.timeout(3000),
    cache: "no-store",
  });
  return response.ok ? "ok" : "down";
}

/** Çağıran istek anında çalışmalı (sayfa/route `connection()` çağırır). */
export async function checkComponents(): Promise<Components> {
  const [database, redis, engine] = await Promise.all([
    timed(async () => {
      await getPrisma().bank.findFirst({ select: { id: true } });
      return "ok";
    }),
    timed(pingRateLimitStore),
    timed(engineHealth),
  ]);
  return { database, redis, engine };
}

const DAY = 86_400_000;

export async function getSystemOverview(now = new Date()) {
  const prisma = getPrisma();
  const since = new Date(now.getTime() - DAY);
  const todayDate = new Date(`${turkeyToday(now)}T00:00:00Z`);
  const weekLater = new Date(todayDate.getTime() + 7 * DAY);

  const jobNames = Object.keys(JOBS) as JobName[];
  const [components, jobRuns, sources, drafts, oldestDraft, active, endingSoon, users, deleting] =
    await Promise.all([
      checkComponents(),
      Promise.all(
        jobNames.map((name) =>
          prisma.jobRun.findFirst({ where: { name }, orderBy: { startedAt: "desc" } }),
        ),
      ),
      prisma.campaignSource.findMany({
        orderBy: { adapter: "asc" },
        select: {
          adapter: true,
          active: true,
          program: { select: { name: true } },
          runs: { orderBy: { startedAt: "desc" }, take: 1 },
        },
      }),
      prisma.campaign.count({ where: { status: "DRAFT" } }),
      prisma.campaign.findFirst({
        where: { status: "DRAFT" },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.campaign.count({ where: { status: "APPROVED", endsAt: { gte: todayDate } } }),
      prisma.campaign.count({
        where: { status: "APPROVED", endsAt: { gte: todayDate, lt: weekLater } },
      }),
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: { not: null } } }),
    ]);
  const [notifications, plans, newFeedback] = await Promise.all([
    prisma.notificationLog.groupBy({
      by: ["kind"],
      where: { sentAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.monthlyPlan.count({ where: { computedAt: { gte: since } } }),
    prisma.feedback.count({ where: { status: "NEW" } }),
  ]);

  return {
    checkedAt: now,
    components,
    jobs: jobNames.map((name, index) => {
      const last = jobRuns[index] ?? null;
      return {
        name,
        label: JOBS[name].label,
        last,
        health: runHealth(last, now, JOBS[name].maxAgeHours),
      };
    }),
    pipeline: sources.map((source) => {
      const last = source.runs[0] ?? null;
      return {
        adapter: source.adapter,
        program: source.program.name,
        active: source.active,
        last,
        errorCount: Array.isArray(last?.errors) ? last.errors.length : 0,
        health: source.active ? runHealth(last, now, PIPELINE_MAX_AGE_HOURS) : null,
      };
    }),
    queue: { drafts, oldestDraftAt: oldestDraft?.createdAt ?? null, newFeedback },
    campaigns: { active, endingSoon },
    users: { active: users, pendingDeletion: deleting },
    last24h: {
      notifications: Object.fromEntries(notifications.map((row) => [row.kind, row._count._all])),
      plans,
    },
  };
}
/**
 * Veri doğruluğu (ADR 0026): kullanıcıların hata bildirdiği kampanyalar ve kaynağın son
 * taramalarında artık görünmeyen yayındaki kampanyalar.
 */
export async function getDataQuality(now = new Date()) {
  const prisma = getPrisma();
  const todayDate = new Date(`${turkeyToday(now)}T00:00:00Z`);
  const [reported, live] = await Promise.all([
    prisma.feedback.groupBy({
      by: ["campaignId"],
      where: { campaignId: { not: null }, status: { in: ["NEW", "READ"] } },
      _count: { _all: true },
    }),
    prisma.campaign.findMany({
      where: { status: "APPROVED", endsAt: { gte: todayDate }, sourceId: { not: null } },
      select: {
        id: true,
        title: true,
        lastSeenAt: true,
        source: {
          select: {
            runs: {
              where: { status: "SUCCEEDED" },
              orderBy: { startedAt: "desc" },
              take: 1,
              select: { startedAt: true },
            },
          },
        },
      },
    }),
  ]);
  const reportedIds = reported.flatMap((row) => (row.campaignId ? [row.campaignId] : []));
  const titles = new Map(
    (
      await prisma.campaign.findMany({
        where: { id: { in: reportedIds } },
        select: { id: true, title: true },
      })
    ).map((row) => [row.id, row.title]),
  );
  return {
    reported: reported
      .flatMap((row) =>
        row.campaignId
          ? [
              {
                id: row.campaignId,
                title: titles.get(row.campaignId) ?? "",
                count: row._count._all,
              },
            ]
          : [],
      )
      .sort((a, b) => b.count - a.count),
    missing: live
      .filter((campaign) =>
        missingFromSource(campaign.lastSeenAt, campaign.source?.runs[0]?.startedAt ?? null),
      )
      .map(({ id, title, lastSeenAt }) => ({ id, title, lastSeenAt })),
  };
}

export type SystemOverview = Awaited<ReturnType<typeof getSystemOverview>>;
