import { requestAccountDeletion } from "@/lib/account";
import { withUser } from "@/lib/api";

/** Hesap silme: hesap hemen kapanır, veriler 30 gün sonra kalıcı silinir (ADR 0019). */
export function DELETE() {
  return withUser(
    async (user) => {
      await requestAccountDeletion(user.id);
      return new Response(null, { status: 204 });
    },
    { consent: false },
  );
}
