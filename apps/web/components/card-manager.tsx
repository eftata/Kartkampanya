"use client";

import { formatKurus } from "@kartplan/shared";
import type { CatalogBank, UserCardDto } from "@kartplan/shared";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addCardAction, removeCardAction, updateCardAction } from "@/lib/user-cards-actions";
import { cn } from "@/lib/utils";

type Step = "bank" | "program" | "card" | "details";
type Program = CatalogBank["programs"][number];
type CatalogCard = Program["cards"][number];

const STATEMENT_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const inputClass =
  "border-input focus-visible:ring-ring/50 h-10 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]";

/** TL tutarını düzenleme alanı için yazar: 5000000 → "50.000". */
const limitText = (kurus: number | null) =>
  kurus === null ? "" : formatKurus(kurus).replace("₺", "");

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
        "disabled:hover:border-border disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
      )}
    >
      <div className="font-medium">{title}</div>
      {subtitle && <div className="text-muted-foreground mt-1 text-sm">{subtitle}</div>}
    </button>
  );
}

/** Takma ad, limit ve kesim günü alanları; ekleme ve düzenleme formlarında ortak. */
function CardDetailFields({
  card,
  idPrefix,
  stacked = false,
}: {
  card?: UserCardDto;
  idPrefix: string;
  /** Dar alanlarda (kart listesi) alanları alt alta dizer. */
  stacked?: boolean;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-nickname`} className="text-sm font-medium">
          Kartın adı (isteğe bağlı)
        </label>
        <input
          id={`${idPrefix}-nickname`}
          name="nickname"
          maxLength={40}
          autoComplete="off"
          placeholder="ör. Maaş kartım"
          defaultValue={card?.nickname ?? ""}
          className={inputClass}
        />
      </div>
      <div className={cn("grid gap-4", !stacked && "sm:grid-cols-2")}>
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-limit`} className="text-sm font-medium">
            Kart limiti, TL (isteğe bağlı)
          </label>
          <input
            id={`${idPrefix}-limit`}
            name="limit"
            inputMode="decimal"
            autoComplete="off"
            placeholder="ör. 50.000"
            defaultValue={limitText(card?.limitKurus ?? null)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-statementDay`} className="text-sm font-medium">
            Hesap kesim günü (isteğe bağlı)
          </label>
          <select
            id={`${idPrefix}-statementDay`}
            name="statementDay"
            className={inputClass}
            defaultValue={card?.statementDay ?? ""}
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
    </>
  );
}

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-destructive text-sm">
      {error}
    </p>
  ) : null;
}

function UserCardItem({
  card,
  onChanged,
  onRemoved,
}: {
  card: UserCardDto;
  onChanged: (card: UserCardDto) => void;
  onRemoved: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const label = card.nickname ?? card.cardName;

  function save(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateCardAction(card.id, formData);
      if (result.card) {
        onChanged(result.card);
        setEditing(false);
      } else {
        setError(result.error ?? "Kaydedilemedi.");
      }
    });
  }

  function remove() {
    // Kartın harcama kayıtları da silinir (ADR 0027).
    const message = `${card.cardName} kartını kaldırırsan bu karta girdiğin harcamalar da silinir. Devam edilsin mi?`;
    if (!window.confirm(message)) return;
    setError(null);
    startTransition(async () => {
      const result = await removeCardAction(card.id);
      if (result.error) setError(result.error);
      else onRemoved(card.id);
    });
  }

  return (
    <li className="space-y-3 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm">
          <div className="font-medium">{label}</div>
          <div className="text-muted-foreground">
            {card.bankName} · {card.cardName}
            {card.limitKurus !== null && ` · Limit ${formatKurus(card.limitKurus)}`}
            {card.statementDay !== null && ` · Kesim ${card.statementDay}`}
          </div>
        </div>
        {!editing && (
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setEditing(true)}
              aria-label={`${card.cardName} kartını düzenle`}
            >
              Düzenle
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={remove}
              aria-label={`${card.cardName} kartını kaldır`}
            >
              Kaldır
            </Button>
          </div>
        )}
      </div>
      {editing && (
        <form
          action={save}
          className="space-y-3 border-t pt-3"
          aria-label={`${card.cardName} düzenle`}
          noValidate
        >
          <CardDetailFields card={card} idPrefix={`edit-${card.id}`} stacked />
          <ErrorText error={error} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Kaydediliyor…" : "Kaydet"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Vazgeç
            </Button>
          </div>
        </form>
      )}
      {!editing && <ErrorText error={error} />}
    </li>
  );
}

/**
 * Kart ekleme sihirbazı (banka → program → kart → ayrıntılar) ve kullanıcının kart listesi
 * (düzenle / kaldır). Onboarding ve Kartlarım sayfası birlikte kullanır.
 */
export function CardManager({
  banks,
  initialCards,
  footer,
}: {
  banks: CatalogBank[];
  initialCards: UserCardDto[];
  footer?: (cardCount: number) => ReactNode;
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

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
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
              <CardDetailFields idPrefix="new" />
              <ErrorText error={error} />
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
                <UserCardItem
                  key={c.id}
                  card={c}
                  onChanged={(updated) =>
                    setCards((current) => current.map((x) => (x.id === updated.id ? updated : x)))
                  }
                  onRemoved={(id) => setCards((current) => current.filter((x) => x.id !== id))}
                />
              ))}
            </ul>
          )}
          {footer?.(cards.length)}
        </CardContent>
      </Card>
    </div>
  );
}
