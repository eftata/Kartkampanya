import { PrismaAdapter } from "@auth/prisma-adapter";
import { getPrisma } from "@kartplan/db";
import type { Role } from "@kartplan/db";
import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";

import { sendMagicLink, smtpOptions } from "@/lib/email/magic-link";

declare module "next-auth" {
  interface Session {
    user: { id: string; email: string; name?: string | null; role: Role };
  }
}

// Prisma adaptörü User satırının tamamını döndürür; Auth.js'in AdapterUser tipi bu alanları bilmez.
type DbUserFields = { role: Role; deletedAt: Date | null };

export const isGoogleEnabled = () =>
  Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

// Yapılandırma ilk istekte kurulur: modül içe aktarılırken veritabanına bağlanılmaz (build güvenli).
export const { handlers, auth, signIn, signOut } = NextAuth((): NextAuthConfig => {
  const providers: NextAuthConfig["providers"] = [
    Nodemailer({
      server: smtpOptions(),
      from: process.env.EMAIL_FROM ?? "KartPlan <no-reply@kartplan.local>",
      maxAge: 24 * 60 * 60,
      sendVerificationRequest: ({ identifier, url, provider }) =>
        sendMagicLink({ identifier, url, from: provider.from ?? "" }),
    }),
  ];
  if (isGoogleEnabled()) {
    // Google e-postayı doğruladığı için aynı e-postalı magic link hesabına bağlanmasına izin verilir.
    providers.push(Google({ allowDangerousEmailAccountLinking: true }));
  }

  return {
    adapter: PrismaAdapter(getPrisma()),
    session: { strategy: "database" },
    trustHost: true,
    providers,
    pages: {
      signIn: "/giris",
      verifyRequest: "/giris/dogrula",
      error: "/giris",
    },
    callbacks: {
      // Silinmek üzere işaretlenmiş (KVKK) hesaplar giriş yapamaz.
      signIn: ({ user }) => !(user as Partial<DbUserFields>).deletedAt,
      session: ({ session, user }) => {
        const { role } = user as typeof user & DbUserFields;
        return { ...session, user: { id: user.id, email: user.email, name: user.name, role } };
      },
    },
  };
});
