import { STATEMENT_MAX_BYTES } from "@kartplan/shared";

import { jsonError, withUser } from "@/lib/api";
import { parseStatementPdf } from "@/lib/engine";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { reviewStatement, STATEMENT_ERROR_MESSAGES } from "@/lib/statements";

/**
 * Ekstre PDF'i yükle → onaylanacak satırlar (ADR 0028). `multipart/form-data`: `file` (PDF, ≤ 4 MB),
 * `userCardId`, isteğe bağlı `password`. Dosya ve parola saklanmaz.
 */
export function POST(request: Request) {
  return withUser(async (user) => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonError(400, "Dosya gönderilemedi.");
    }
    const file = form.get("file");
    const userCardId = form.get("userCardId");
    const password = form.get("password");
    if (!(file instanceof File) || typeof userCardId !== "string" || !userCardId) {
      return jsonError(400, "Kart ve PDF dosyası gerekli.");
    }
    if (file.size > STATEMENT_MAX_BYTES) return jsonError(400, STATEMENT_ERROR_MESSAGES.too_large);
    const limit = await rateLimit("statementParse", user.id);
    if (!limit.ok) return tooManyRequests(limit);

    const outcome = await parseStatementPdf(
      new Uint8Array(await file.arrayBuffer()),
      typeof password === "string" && password ? password.slice(0, 100) : null,
    );
    if (!outcome.ok) {
      return Response.json(
        { error: STATEMENT_ERROR_MESSAGES[outcome.code], code: outcome.code },
        { status: outcome.code === "unavailable" ? 503 : 422 },
      );
    }
    const review = await reviewStatement(user.id, userCardId, outcome.result);
    return review.ok ? Response.json(review.data) : jsonError(404, review.error);
  });
}
