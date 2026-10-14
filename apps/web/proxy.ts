import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isProtectedPath, SESSION_COOKIE_NAMES, SIGNED_OUT_REDIRECT } from "@/lib/auth/routes";

/**
 * İyimser kontrol: oturum çerezi yoksa korumalı sayfaya hiç girmeden landing'e yönlendirir.
 * Gerçek doğrulama sunucu tarafında `requireUser()` ile yapılır (çerez sahte/süresi geçmiş olabilir).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
  if (isProtectedPath(pathname) && !hasSessionCookie) {
    return NextResponse.redirect(new URL(SIGNED_OUT_REDIRECT, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/plan/:path*",
    "/kartlarim/:path*",
    "/kampanyalarim/:path*",
    "/profil/:path*",
    "/admin/:path*",
  ],
};
