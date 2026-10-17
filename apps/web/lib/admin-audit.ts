import "server-only";

import { getPrisma } from "@kartplan/db";
import type { Prisma } from "@kartplan/db";

/** İşlemi yapan admin; işlem kaydına yazılır. */
export type Actor = { id: string; email: string };

export type EntityType = "Bank" | "Program" | "CardProduct" | "Campaign";

/** Admin işlem kaydı; değişikliği yapan transaction içinde yazılır (ADR 0006). */
export async function audit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  action: string,
  entityType: EntityType,
  entityId: string,
  data: Record<string, unknown> = {},
) {
  await tx.adminAuditLog.create({
    data: {
      actorId: actor.id,
      actorEmail: actor.email,
      action,
      entityType,
      entityId,
      data: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue,
    },
  });
}

/** Önce/sonra farkı: yalnızca değişen alanlar. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, to] of Object.entries(after)) {
    const from = before[key];
    if (to !== undefined && String(from) !== String(to)) changes[key] = { from, to };
  }
  return changes;
}

export async function getAuditLog(
  filter: { entityType?: EntityType; entityId?: string },
  take = 20,
) {
  return getPrisma().adminAuditLog.findMany({
    where: filter,
    orderBy: { createdAt: "desc" },
    take,
  });
}
