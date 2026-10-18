import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  isProtectedPath,
  isRateLimitedRequest,
  SESSION_COOKIE_NAMES,
  SIGNED_OUT_REDIRECT,
} from "@/lib/auth/routes";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * 1. İyimser kontrol: oturum çerezi yoksa korumalı sayfaya hiç girmeden landing'e yönlendirir.
 *    Gerçek doğrulama sunucu tarafında `requireUser()` ile yapılır (çerez sahte/süresi geçmiş olabilir).
 * 2. İstek sınırı (ADR 0021): API çağrıları ve yazma istekleri oturum başına (oturum yoksa IP
 *    başına) `RATE_LIMITS.request`, ayrıca IP başına daha geniş `requestIp`; aşılırsa 429.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = SESSION_COOKIE_NAMES.map((name) => request.cookies.get(name)?.value).find(
    Boolean,
  );
  if (isProtectedPath(pathname) && !sessionToken) {
    return NextResponse.redirect(new URL(SIGNED_OUT_REDIRECT, request.url));
  }
  if (isRateLimitedRequest(request.method, pathname)) {
    const ip = clientIp(request.headers);
    const [perClient, perIp] = await Promise.all([
      rateLimit("request", sessionToken ? `session:${sessionToken}` : `ip:${ip}`),
      rateLimit("requestIp", ip),
    ]);
    if (!perClient.ok) return tooManyRequests(perClient);
    if (!perIp.ok) return tooManyRequests(perIp);
  }
  return NextResponse.next();
}

export const config = {
  // Statik dosyalar dışında her istek (istek sınırı API ve Server Action'ları da kapsar).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
