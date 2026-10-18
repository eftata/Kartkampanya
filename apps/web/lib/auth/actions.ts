"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { signIn } from "@/auth";
import {
  ACCESS_DENIED_MESSAGE,
  MAGIC_LINK_LIMIT_MESSAGE,
  SIGNED_IN_REDIRECT,
} from "@/lib/auth/routes";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const EmailSchema = z.email().max(254);

export type EmailSignInState = { error?: string; email?: string };

export async function signInWithEmail(
  _prev: EmailSignInState,
  formData: FormData,
): Promise<EmailSignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = EmailSchema.safeParse(email);
  if (!parsed.success) {
    return { error: "Geçerli bir e-posta adresi gir.", email };
  }
  // Aynı adrese ya da aynı yerden çok sayıda bağlantı isteği: e-posta bombardımanı (ADR 0021).
  const [byEmail, byIp] = await Promise.all([
    rateLimit("magicLinkEmail", parsed.data.toLowerCase()),
    rateLimit("magicLinkIp", clientIp(await headers())),
  ]);
  if (!byEmail.ok || !byIp.ok) {
    return { error: MAGIC_LINK_LIMIT_MESSAGE, email };
  }
  try {
    // redirect: false → Auth.js kendi /api/auth/verify-request sayfasına yönlendirmez; aşağıda biz yönlendiririz.
    await signIn("nodemailer", {
      email: parsed.data,
      redirectTo: SIGNED_IN_REDIRECT,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // AccessDenied: signIn geri çağrısı reddetti (silinmiş hesap, ADR 0019).
      if (error.type === "AccessDenied") return { error: ACCESS_DENIED_MESSAGE, email };
      return { error: "Giriş bağlantısı gönderilemedi. Biraz sonra tekrar dene.", email };
    }
    throw error;
  }
  redirect("/giris/dogrula");
}

export async function signInWithGoogle() {
  await signIn("google", { redirectTo: SIGNED_IN_REDIRECT });
}
