import "server-only";

import { getPrisma } from "@kartplan/db";

/** Silinen hesabın verileri bu süre sonunda kalıcı olarak silinir (ADR 0019). */
export const DELETION_GRACE_DAYS = 30;

/**
 * Hesap silme talebi: hesap hemen kapanır (`deletedAt`; giriş engellenir, bildirim gitmez, bütün
 * oturumlar sonlanır), veriler `purgeDeletedAccounts` ile 30 gün sonra kalıcı silinir.
 */
export async function requestAccountDeletion(userId: string, now = new Date()) {
  await getPrisma().$transaction([
    getPrisma().user.update({ where: { id: userId }, data: { deletedAt: now } }),
    getPrisma().session.deleteMany({ where: { userId } }),
  ]);
}

/** Süresi dolan silme taleplerini kalıcı uygular; ilişkili tüm veriler zincirleme silinir. */
export async function purgeDeletedAccounts(
  now = new Date(),
  /** Yalnızca bu kullanıcılar (testler başka hesaplara dokunmasın). */
  userIds?: string[],
): Promise<number> {
  const cutoff = new Date(now.getTime() - DELETION_GRACE_DAYS * 86_400_000);
  const { count } = await getPrisma().user.deleteMany({
    where: { deletedAt: { lte: cutoff }, ...(userIds ? { id: { in: userIds } } : {}) },
  });
  return count;
}

/**
 * KVKK m. 11 veri kopyası: kullanıcıya ait her kayıt, okunur adlarla. Giriş belirteçleri ve oturum
 * anahtarları gibi güvenlik sırları dahil edilmez.
 */
export async function exportUserData(userId: string, now = new Date()) {
  const prisma = getPrisma();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      name: true,
      image: true,
      role: true,
      createdAt: true,
      firstCardAt: true,
      firstPlanViewAt: true,
      notifyPrefs: true,
      accounts: { select: { provider: true, type: true } },
      sessions: { select: { expires: true } },
      consents: {
        orderBy: { createdAt: "asc" },
        select: { kind: true, version: true, granted: true, createdAt: true },
      },
      cards: {
        orderBy: { createdAt: "asc" },
        select: {
          nickname: true,
          limitKurus: true,
          statementDay: true,
          createdAt: true,
          cardProduct: {
            select: {
              name: true,
              program: { select: { name: true, bank: { select: { name: true } } } },
            },
          },
        },
      },
      spend: {
        select: { monthlyKurus: true, merchantIds: true, category: { select: { name: true } } },
      },
      campaignStatus: {
        select: {
          joined: true,
          joinedAt: true,
          inPlan: true,
          updatedAt: true,
          campaign: { select: { id: true, title: true } },
        },
      },
      plans: {
        orderBy: { month: "asc" },
        select: {
          month: true,
          expectedKurus: true,
          baselineKurus: true,
          computedAt: true,
          result: true,
        },
      },
      notifications: {
        orderBy: { sentAt: "asc" },
        select: { kind: true, key: true, sentAt: true },
      },
      activityDays: { orderBy: { day: "asc" }, select: { day: true } },
      pushDevices: {
        orderBy: { createdAt: "asc" },
        select: { endpoint: true, createdAt: true, lastSentAt: true },
      },
      transactions: {
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        select: {
          amountKurus: true,
          date: true,
          source: true,
          createdAt: true,
          category: { select: { name: true } },
          merchant: { select: { name: true } },
          userCard: { select: { nickname: true, cardProduct: { select: { name: true } } } },
        },
      },
      feedback: {
        orderBy: { createdAt: "asc" },
        select: {
          kind: true,
          rating: true,
          message: true,
          page: true,
          status: true,
          createdAt: true,
          campaign: { select: { title: true } },
        },
      },
      adminAuditLogs: {
        orderBy: { createdAt: "asc" },
        select: { action: true, entityType: true, entityId: true, createdAt: true },
      },
    },
  });
  const merchantIds = [...new Set(user.spend.flatMap((item) => item.merchantIds))];
  const merchants = new Map(
    (
      await prisma.merchant.findMany({
        where: { id: { in: merchantIds } },
        select: { id: true, name: true },
      })
    ).map((m) => [m.id, m.name]),
  );
  return {
    exportedAt: now.toISOString(),
    note: "Tutarlar kuruş cinsindendir (100 kuruş = 1 TL).",
    account: {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      name: user.name,
      image: user.image,
      role: user.role,
      createdAt: user.createdAt,
      loginMethods: user.accounts.map((a) => a.provider),
      activeSessions: user.sessions.length,
      notificationPreferences: user.notifyPrefs,
      firstCardAddedAt: user.firstCardAt,
      firstPlanViewedAt: user.firstPlanViewAt,
    },
    consents: user.consents,
    cards: user.cards.map((card) => ({
      bank: card.cardProduct.program.bank.name,
      program: card.cardProduct.program.name,
      card: card.cardProduct.name,
      nickname: card.nickname,
      limitKurus: card.limitKurus,
      statementDay: card.statementDay,
      addedAt: card.createdAt,
    })),
    spendProfile: user.spend.map((item) => ({
      category: item.category.name,
      monthlyKurus: item.monthlyKurus,
      preferredMerchants: item.merchantIds.map((id) => merchants.get(id) ?? id),
    })),
    campaigns: user.campaignStatus.map((status) => ({
      campaignId: status.campaign.id,
      campaign: status.campaign.title,
      joined: status.joined,
      joinedAt: status.joinedAt,
      inPlan: status.inPlan,
      updatedAt: status.updatedAt,
    })),
    monthlyPlans: user.plans,
    sentNotifications: user.notifications,
    feedback: user.feedback,
    activeDays: user.activityDays.map((item) => item.day),
    // Abonelik adresi cihaza bildirim göndermeye yarar: dosyada yalnızca servis adı.
    pushDevices: user.pushDevices.map((device) => ({
      service: new URL(device.endpoint).hostname,
      createdAt: device.createdAt,
      lastSentAt: device.lastSentAt,
    })),
    transactions: user.transactions.map((item) => ({
      date: item.date.toISOString().slice(0, 10),
      card: item.userCard.nickname || item.userCard.cardProduct.name,
      category: item.category.name,
      merchant: item.merchant?.name ?? null,
      amountKurus: item.amountKurus,
      source: item.source,
      enteredAt: item.createdAt,
    })),
    adminActions: user.adminAuditLogs,
  };
}
