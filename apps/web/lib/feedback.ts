import "server-only";

import { getPrisma } from "@kartplan/db";
import type { FeedbackDto, FeedbackInput, FeedbackStatus } from "@kartplan/shared";

import { audit } from "@/lib/admin-audit";
import type { Actor } from "@/lib/admin-audit";
import { track } from "@/lib/analytics";
import type { MutationResult } from "@/lib/result";

/**
 * Kapalı beta geri bildirimi (ADR 0024): kullanıcı gönderir ve kendi gönderdiklerini görür; admin
 * listeler ve durumunu değiştirir (işlem kaydıyla). Kullanıcı silinince geri bildirimleri de silinir.
 */

const select = {
  id: true,
  kind: true,
  rating: true,
  message: true,
  page: true,
  status: true,
  createdAt: true,
} as const;

type Row = {
  id: string;
  kind: FeedbackDto["kind"];
  rating: number | null;
  message: string;
  page: string | null;
  status: FeedbackStatus;
  createdAt: Date;
};

const toDto = (row: Row): FeedbackDto => ({ ...row, createdAt: row.createdAt.toISOString() });

export async function createFeedback(
  userId: string,
  input: FeedbackInput,
): Promise<MutationResult<FeedbackDto>> {
  const row = await getPrisma().feedback.create({ data: { userId, ...input }, select });
  track(userId, "feedback_sent", { kind: input.kind, rated: input.rating !== null });
  return { ok: true, data: toDto(row) };
}

/** Kullanıcının kendi gönderdikleri, yeniden eskiye. */
export async function getMyFeedback(userId: string, take = 20): Promise<FeedbackDto[]> {
  const rows = await getPrisma().feedback.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select,
  });
  return rows.map(toDto);
}

/** Admin listesi: duruma göre, yeniden eskiye; yanıt verebilmek için gönderenin e-postası. */
export async function getFeedbackList(status: FeedbackStatus, take = 200) {
  const prisma = getPrisma();
  const [rows, counts] = await Promise.all([
    prisma.feedback.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
      take,
      select: { ...select, user: { select: { email: true } } },
    }),
    prisma.feedback.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return {
    items: rows.map(({ user, ...row }) => ({ ...toDto(row), email: user.email })),
    counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])) as Partial<
      Record<FeedbackStatus, number>
    >,
  };
}

export async function setFeedbackStatus(
  actor: Actor,
  id: string,
  status: FeedbackStatus,
): Promise<MutationResult<{ status: FeedbackStatus }>> {
  return getPrisma().$transaction(async (tx) => {
    const before = await tx.feedback.findUnique({ where: { id }, select: { status: true } });
    if (!before) return { ok: false, code: "not_found", error: "Geri bildirim bulunamadı." };
    if (before.status === status) return { ok: true, data: { status } };
    await tx.feedback.update({ where: { id }, data: { status } });
    await audit(tx, actor, "feedback.status", "Feedback", id, {
      status: { from: before.status, to: status },
    });
    return { ok: true, data: { status } };
  });
}
