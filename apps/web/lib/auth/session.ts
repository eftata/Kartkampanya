import "server-only";

import type { Session } from "next-auth";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { SIGNED_OUT_REDIRECT } from "@/lib/auth/routes";

export type CurrentUser = Session["user"];

/**
 * Veri erişim katmanının (DAL) tek kimlik giriş noktası. Oturumu okur; Cache Components
 * nedeniyle çağıran bileşen bir `<Suspense>` sınırının içinde olmalıdır.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  return session?.user ?? null;
}

/** Giriş yapılmamışsa landing'e yönlendirir. Korumalı veriye erişen her yerde çağrılır. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(SIGNED_OUT_REDIRECT);
  return user;
}
