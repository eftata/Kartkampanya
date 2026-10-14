"use client";

import { formatKurus } from "@kartplan/shared";
import type { CatalogBank, UserCardDto } from "@kartplan/shared";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addCardAction, removeCardAction } from "@/lib/user-cards-actions";
import { cn } from "@/lib/utils";

type Step = "bank" | "program" | "card" | "details";
type Program = CatalogBank["programs"][number];
type CatalogCard = Program["cards"][number];

const STATEMENT_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const inputClass =
  "border-input focus-visible:ring-ring/50 h-10 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]";

function ChoiceButton({
  title,
  subtitle,
  disabled,
  onClick,
}: {
  title: string;
  subtitle?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "hover:border-primary hover:bg-accent focus-visible:ring-ring/50 rounded-lg border p-4 text-left transition-colors outline-none focus-visible:ring-[3px]",
        "disabled:hover:bg-transparent disabled:hover:border-border disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <div className="font-medium">{title}</div>
      {subtitle && <div className="text-muted-foreground mt-1 text-sm">{subtitle}</div>}
    </button>
  );
}

export function CardWizard({
  banks,
  initialCards,
}: {
  banks: CatalogBank[];
  initialCards: UserCardDto[];
}) {
  const [cards, setCards] = useState(initialCards);
  const [step, setStep] = useState<Step>("bank");
  const [bank, setBank] = useState<CatalogBank | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [card, setCard] = useState<CatalogCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const addedProductIds = new Set(cards.map((c) => c.cardProductId));

  function reset() {
    setStep("bank");
    setBank(null);
    setProgram(null);
    setCard(null);
    setError(null);
  }

  function chooseBank(next: CatalogBank) {
    setBank(next);
    setNotice(null);
    // Tek programı olan bankada program adımı atlanır.
    if (next.programs.length === 1) {
      setProgram(next.programs[0] ?? null);
      setStep("card");
    } else {
      setStep("program");
    }
  }

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addCardAction({ status: "idle" }, formData);
      if (result.status === "added") {
        setCards((current) => [...current, result.card]);
        setNotice(`${result.card.cardName} eklendi.`);
        reset();
      } else if (result.status === "error") {
        setError(result.error);
      }
    });
  }

  function remove(userCardId: string) {
    startTransition(async () => {
      const result = await removeCardAction(userCardId);
      if (result.error) setError(result.error);
      else setCards((current) => current.filter((c) => c.id !== userCardId));
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle>
            {step === "bank" && "Kartın hangi bankanın?"}
            {step === "program" && `${bank?.name}: hangi program?`}
            {step === "card" && `${program?.name}: hangi kart?`}
            {step === "details" && card?.name}
          </CardTitle>
          <CardDescription>
            Kart numarası, CVV veya son kullanma tarihi asla istemiyoruz; yalnızca kart türünü seç.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {notice && (
            <p role="status" className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm">
              {notice}
            </p>
          )}

          {step === "bank" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {banks.map((b) => (
                <ChoiceButton
                  key={b.id}
                  title={b.name}
                  subtitle={b.programs.map((p) => p.name).join(", ")}
                  onClick={() => chooseBank(b)}
                />
              ))}
            </div>
          )}

          {step === "program" && bank && (
            <div className="grid gap-3 sm:grid-cols-2">
              {bank.programs.map((p) => (
                <ChoiceButton
                  key={p.id}
                  title={p.name}
                  subtitle={`Puan: ${p.pointName}`}
                  onClick={() => {
                    setProgram(p);
                    setStep("card");
                  }}
                />
              ))}
            </div>
          )}

          {step === "card" && program && (
            <div className="grid gap-3 sm:grid-cols-2">
              {program.cards.map((c) => (
                <ChoiceButton
                  key={c.id}
                  title={c.name}
                  subtitle={addedProductIds.has(c.id) ? "Ekli" : undefined}
                  disabled={addedProductIds.has(c.id)}
                  onClick={() => {
                    setCard(c);
                    setStep("details");
                  }}
                />
              ))}
            </div>
          )}

          {step === "details" && card && (
            <form action={submit} className="space-y-4" noValidate>
              <input type="hidden" name="cardProductId" value={card.id} />
              <p className="text-muted-foreground text-sm">
                Bu bilgiler isteğe bağlı; planı daha doğru yapmamıza yardım eder.
              </p>
              <div className="space-y-1.5">
                <label htmlFor="nickname" className="text-sm font-medium">
                  Kartın adı (isteğe bağlı)
                </label>
                <input
                  id="nickname"
                  name="nickname"
                  maxLength={40}
                  autoComplete="off"
                  placeholder="ör. Maaş kartım"
                  className={inputClass}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="limit" className="text-sm font-medium">
                    Kart limiti, TL (isteğe bağlı)
                  </label>
                  <input
                    id="limit"
                    name="limit"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="ör. 50.000"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="statementDay" className="text-sm font-medium">
                    Hesap kesim günü (isteğe bağlı)
                  </label>
                  <select
                    id="statementDay"
                    name="statementDay"
                    className={inputClass}
                    defaultValue=""
                  >
                    <option value="">Bilmiyorum</option>
                    {STATEMENT_DAYS.map((day) => (
                      <option key={day} value={day}>
                        Ayın {day}. günü
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending ? "Ekleniyor…" : "Kartı ekle"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setStep("card")}>
                  Geri
                </Button>
              </div>
            </form>
          )}

          {step !== "bank" && step !== "details" && (
            <Button type="button" variant="ghost" onClick={reset}>
              Başka banka seç
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kartların ({cards.length})</CardTitle>
          <CardDescription>
            {cards.length === 0 ? "Henüz kart eklemedin." : "Başka kartın varsa eklemeye devam et."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {cards.length > 0 && (
            <ul className="space-y-2" aria-label="Eklenen kartlar">
              {cards.map((c) => (
                <li
                  key={c.id}
                  className="flex items-start justify-between gap-2 rounded-md border p-3"
                >
                  <div className="text-sm">
                    <div className="font-medium">{c.nickname ?? c.cardName}</div>
                    <div className="text-muted-foreground">
                      {c.bankName} · {c.cardName}
                      {c.limitKurus !== null && ` · Limit ${formatKurus(c.limitKurus)}`}
                      {c.statementDay !== null && ` · Kesim ${c.statementDay}`}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => remove(c.id)}
                    aria-label={`${c.cardName} kartını kaldır`}
                  >
                    Kaldır
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {cards.length > 0 ? (
            // Harcama profili ekranı hazır olunca onboarding'in 2. adımına yönlenecek.
            <Button asChild className="w-full">
              <Link href="/plan">Devam et</Link>
            </Button>
          ) : (
            <Button className="w-full" disabled>
              Devam et
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
