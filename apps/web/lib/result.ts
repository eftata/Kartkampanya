/** `lib/` iş mantığı fonksiyonlarının ortak dönüş tipi. */
export type MutationErrorCode = "not_found" | "conflict" | "limit";
export type MutationResult<T = undefined> =
  { ok: true; data: T } | { ok: false; code: MutationErrorCode; error: string };
