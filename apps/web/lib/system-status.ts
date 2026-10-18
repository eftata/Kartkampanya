import "server-only";

import { getPrisma } from "@kartplan/db";

import { turkeyToday } from "@/lib/campaign-match";
import { JOBS, PIPELINE_MAX_AGE_HOURS } from "@/lib/jobs";
import type { JobName } from "@/lib/jobs";
import { pingRateLimitStore } from "@/lib/rate-limit";
import { runHealth } from "@/lib/system-health";
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
export type SystemOverview = Awaited<ReturnType<typeof getSystemOverview>>;
