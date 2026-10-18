import "server-only";

import type { z } from "zod";

import { noteActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth/session";
import { hasCurrentConsent } from "@/lib/consent";
import type { CurrentUser } from "@/lib/auth/session";

export const jsonError = (status: number, error: string) => Response.json({ error }, { status });

/**
 * Route handler'lar için: oturum yoksa 401 döner (sayfalardaki gibi yönlendirmez). Güncel KVKK onayı
 * yoksa 403; veri indirme ve hesap silme gibi ilgili kişi hakları `{ consent: false }` ile muaftır.
 */
export async function withUser(
  handler: (user: CurrentUser) => Promise<Response>,
  { consent = true }: { consent?: boolean } = {},
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Giriş yapmalısın.");
  if (consent && !(await hasCurrentConsent(user.id))) {
    return jsonError(403, "Önce aydınlatma metnini ve açık rıza metnini onayla.");
  }
  if (consent) noteActivity(user.id);
  return handler(user);
}

/** `/api/admin/*` için: oturum yoksa 401, ADMIN değilse 403. */
export async function withAdmin(
  handler: (user: CurrentUser) => Promise<Response>,
): Promise<Response> {
  return withUser((user) =>
    user.role === "ADMIN" ? handler(user) : Promise.resolve(jsonError(403, "Yetkin yok.")),
  );
}

/** JSON gövdesini zod şemasıyla doğrular. */
export async function parseJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: jsonError(400, "Geçersiz JSON.") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: Response.json(
        {
          error: parsed.error.issues[0]?.message ?? "Geçersiz istek.",
          issues: parsed.error.issues,
        },
        { status: 400 },
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

/** `MutationResult` hatasını HTTP durumuna çevirir. */
export function mutationError(
  result: { code: "not_found" | "conflict" | "limit"; error: string },
  notFoundStatus = 404,
): Response {
  const status = { not_found: notFoundStatus, conflict: 409, limit: 422 }[result.code];
  return jsonError(status, result.error);
}
