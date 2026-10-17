import "server-only";

import type { Session } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/auth";
import { CONSENT_PATH, SIGNED_OUT_REDIRECT } from "@/lib/auth/routes";
import { hasCurrentConsent } from "@/lib/consent";

export type CurrentUser = Session["user"];

/**
 * Veri erişim katmanının (DAL) tek kimlik giriş noktası. Oturumu okur; Cache Components
 * nedeniyle çağıran bileşen bir `<Suspense>` sınırının içinde olmalıdır.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // cache: aynı istekte birden çok bileşen çağırsa da oturum tek kez okunur.
  const session = await auth();
  return session?.user ?? null;
});

/**
 * Giriş yapılmamışsa landing'e yönlendirir. Korumalı veriye erişen her yerde çağrılır.
 * Güncel aydınlatma metni ve açık rıza onaylanmamışsa önce onay ekranına (`/onay`) gider (ADR 0019).
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(SIGNED_OUT_REDIRECT);
  if (!(await hasCurrentConsent(user.id))) redirect(CONSENT_PATH);
  return user;
}

/**
 * Yalnızca ADMIN rolü. Admin olmayan kullanıcıya sayfanın varlığını göstermemek için 404 döner.
 * Rol her istekte veritabanından okunur (veritabanı oturumları), yetki değişikliği hemen geçerlidir.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") notFound();
  return user;
}
