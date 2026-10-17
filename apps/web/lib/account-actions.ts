"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requestAccountDeletion } from "@/lib/account";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/routes";
import { getCurrentUser } from "@/lib/auth/session";
import { recordConsents, setMarketingConsent } from "@/lib/consent";

export type FormState = { error?: string; saved?: boolean };

/** Onay ekranı: aydınlatma metni + açık rıza zorunlu, pazarlama isteğe bağlı (ADR 0019). */
export async function giveConsentAction(_state: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (formData.get("aydinlatma") !== "on" || formData.get("acikRiza") !== "on") {
    return { error: "Devam etmek için aydınlatma metnini okuduğunu ve açık rızanı onayla." };
  }
  await recordConsents(user.id, formData.get("pazarlama") === "on");
  redirect("/plan");
}

/** Profilim: pazarlama iznini verir ya da geri çeker. */
export async function setMarketingConsentAction(granted: boolean): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Giriş yapmalısın." };
  await setMarketingConsent(user.id, granted);
  return { saved: true };
}

/**
 * Hesap silme: kullanıcı e-postasını yazarak onaylar. KVKK onayı olmadan da kullanılabilir
 * (onay ekranından da çağrılır). Oturum kapanır, landing'e döner.
 */
export async function deleteAccountAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const typed = String(formData.get("email") ?? "")
    .trim()
    .toLocaleLowerCase("tr");
  if (typed !== user.email.toLocaleLowerCase("tr")) {
    return { error: "Onaylamak için e-posta adresini aynen yaz." };
  }
  // Silme bütün oturumları veritabanından kaldırır; signOut aynı oturumu yeniden silmeye çalışıp
  // hata verirdi. Tarayıcıdaki oturum çerezi burada temizlenir.
  await requestAccountDeletion(user.id);
  const jar = await cookies();
  for (const name of SESSION_COOKIE_NAMES) jar.delete(name);
  redirect("/?hesap=silindi");
}
