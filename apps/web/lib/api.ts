import "server-only";

import type { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import type { CurrentUser } from "@/lib/auth/session";

export const jsonError = (status: number, error: string) => Response.json({ error }, { status });

/** Route handler'lar için: oturum yoksa 401 döner (sayfalardaki gibi yönlendirmez). */
export async function withUser(
  handler: (user: CurrentUser) => Promise<Response>,
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Giriş yapmalısın.");
  return handler(user);
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
