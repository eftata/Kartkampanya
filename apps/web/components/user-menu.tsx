import Link from "next/link";

import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { SIGNED_OUT_REDIRECT } from "@/lib/auth/routes";

/** Oturumu doğrular (yoksa yönlendirir) ve kullanıcıyı gösterir. `<Suspense>` içinde kullanılır. */
export async function UserMenu() {
  const user = await requireUser();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: SIGNED_OUT_REDIRECT });
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      {user.role === "ADMIN" && (
        <Link href="/admin/katalog" className="text-muted-foreground hover:text-foreground">
          Admin
        </Link>
      )}
      <span className="text-muted-foreground hidden sm:inline" data-testid="user-email">
        {user.email}
      </span>
      <form action={signOutAction}>
        <Button type="submit" variant="outline" size="sm">
          Çıkış yap
        </Button>
      </form>
    </div>
  );
}
