import type { Metadata } from "next";
import { Suspense } from "react";

import { isGoogleEnabled } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { signInWithGoogle } from "@/lib/auth/actions";
import { ACCESS_DENIED_MESSAGE } from "@/lib/auth/routes";

import { EmailSignInForm } from "./email-form";

export const metadata: Metadata = { title: "Giriş yap" };

const ERROR_MESSAGES: Record<string, string> = {
  Verification: "Giriş bağlantısının süresi dolmuş ya da daha önce kullanılmış. Yenisini iste.",
  OAuthAccountNotLinked: "Bu e-posta başka bir giriş yöntemiyle kayıtlı.",
  AccessDenied: ACCESS_DENIED_MESSAGE,
};

async function AuthErrorNotice({
  searchParams,
}: {
  searchParams: PageProps<"/giris">["searchParams"];
}) {
  const { error } = await searchParams;
  if (typeof error !== "string") return null;
  return (
    <p role="alert" className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm">
      {ERROR_MESSAGES[error] ?? "Giriş sırasında bir sorun oluştu. Tekrar dene."}
    </p>
  );
}

export default function SignInPage({ searchParams }: PageProps<"/giris">) {
  return (
    <div className="mx-auto max-w-sm py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Giriş yap veya kayıt ol</CardTitle>
          <CardDescription>
            Şifre yok: e-postana tek kullanımlık bir giriş bağlantısı gönderiyoruz.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Suspense>
            <AuthErrorNotice searchParams={searchParams} />
          </Suspense>
          <EmailSignInForm />
        </CardContent>
        {isGoogleEnabled() && (
          <CardFooter className="flex-col gap-3">
            <div className="text-muted-foreground text-xs">veya</div>
            <form action={signInWithGoogle} className="w-full">
              <Button type="submit" variant="outline" className="w-full">
                Google ile devam et
              </Button>
            </form>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
