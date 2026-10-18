import { describe, expect, it } from "vitest";

import { FeedbackInput } from "./feedback";

describe("FeedbackInput", () => {
  it("varsayılanlar ve sayfa yolunun temizlenmesi", () => {
    expect(
      FeedbackInput.parse({
        kind: "IDEA",
        message: "  Plan sayfası harika  ",
        page: "/plan?ay=x#y",
      }),
    ).toEqual({ kind: "IDEA", rating: null, message: "Plan sayfası harika", page: "/plan" });
    expect(FeedbackInput.parse({ kind: "BUG", message: "Hata var", rating: 2 })).toMatchObject({
      rating: 2,
      page: null,
    });
  });

  it.each([
    [{ kind: "BUG", message: "kısa" }, "en az 5"],
    [{ kind: "BUG", message: "x".repeat(2001) }, "En fazla 2000"],
    [{ kind: "BUG", message: "Kartım 4111 1111 1111 1111 çalışmıyor" }, "kart numarası"],
    [{ kind: "BUG", message: "Bir sorun var", rating: 6 }, ""],
    [{ kind: "SPAM", message: "Bir sorun var" }, ""],
    [{ kind: "BUG", message: "Bir sorun var", page: "https://evil.test" }, "Geçersiz sayfa"],
    [{ kind: "BUG", message: "Bir sorun var", email: "a@b.com" }, ""],
  ])("reddedilir: %o", (input, message) => {
    const result = FeedbackInput.safeParse(input);
    expect(result.success).toBe(false);
    if (message) expect(result.error?.issues[0]?.message).toContain(message);
  });
});
