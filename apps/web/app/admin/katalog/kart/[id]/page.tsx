import { formatBps, formatKurus } from "@kartplan/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ActionForm } from "@/components/admin/action-form";
import { AuditList } from "@/components/admin/audit-list";
import { Checkbox, Field, inputClass, VerifiedBadge } from "@/components/admin/fields";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminCard, getAuditLog } from "@/lib/admin-catalog";
import { requireAdmin } from "@/lib/auth/session";
import { deleteCardAction, updateCardAction } from "@/lib/admin-catalog-actions";
import { CARD_TYPE_LABELS } from "@/lib/admin-labels";
import { getSpendCategories } from "@/lib/spend-profile";

const percentText = (bps: number | undefined) =>
  bps === undefined ? "" : formatBps(bps).replace("%", "");

async function AdminCard({ params }: PageProps<"/admin/katalog/kart/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const [card, categories, audit] = await Promise.all([
    getAdminCard(id),
    getSpendCategories(),
    getAuditLog({ entityType: "CardProduct", entityId: id }, 10),
  ]);
  if (!card) notFound();
  const rateByCategory = new Map(card.earnRates.map((r) => [r.categoryId, r.rateBps]));

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Link
          href={`/admin/katalog/program/${card.programId}`}
          className="text-muted-foreground text-sm underline"
        >
          ← {card.program.bank.name} · {card.program.name}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{card.name}</h1>
          <span data-testid="card-status">
            <VerifiedBadge at={card.ratesVerifiedAt} />
          </span>
        </div>
        <p className="text-muted-foreground text-sm">
          {card._count.userCards} kullanıcı bu kartı seçti
          {card.annualFee !== null && ` · Yıllık ücret ${formatKurus(card.annualFee)}`}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kart ve kazanç oranları</CardTitle>
          <CardDescription>
            Temel oran tüm harcamalara uygulanır. Bir kategoride farklı sabit oran varsa o
            kategoriye yaz; boş bırakılan kategoride temel oran geçerlidir. Oranı değiştirip
            doğrulama kutusunu işaretlemezsen kart &quot;doğrulanmadı&quot; durumuna döner.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={updateCardAction.bind(null, card.id)}
            submitLabel="Kaydet"
            successMessage="Kart kaydedildi."
            label="Kart ve kazanç oranları"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field id="card-name" label="Kart adı">
                <input id="card-name" name="name" defaultValue={card.name} className={inputClass} />
              </Field>
              <Field id="card-type" label="Tür">
                <select id="card-type" name="type" defaultValue={card.type} className={inputClass}>
                  {Object.entries(CARD_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="card-base" label="Temel oran (%)">
                <input
                  id="card-base"
                  name="baseRate"
                  defaultValue={percentText(card.baseRateBps)}
                  className={inputClass}
                />
              </Field>
              <Field id="card-fee" label="Yıllık ücret (TL)" hint="Boş = bilinmiyor">
                <input
                  id="card-fee"
                  name="annualFee"
                  defaultValue={
                    card.annualFee === null ? "" : formatKurus(card.annualFee).replace("₺", "")
                  }
                  className={inputClass}
                />
              </Field>
            </div>

            <fieldset className="space-y-2 pt-2">
              <legend className="text-sm font-medium">Kategoriye özel oranlar (%)</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {categories.map((category) => (
                  <Field key={category.id} id={`rate-${category.id}`} label={category.name}>
                    <input type="hidden" name={`label:${category.id}`} value={category.name} />
                    <input
                      id={`rate-${category.id}`}
                      name={`rate:${category.id}`}
                      defaultValue={percentText(rateByCategory.get(category.id))}
                      placeholder="temel oran"
                      className={inputClass}
                    />
                  </Field>
                ))}
              </div>
            </fieldset>

            <Checkbox
              id="card-verified"
              name="ratesVerified"
              defaultChecked={Boolean(card.ratesVerifiedAt)}
              label="Temel oranı ve kategori oranlarını banka kaynağından doğruladım"
            />
          </ActionForm>
        </CardContent>
      </Card>

      {card._count.userCards === 0 ? (
        <ActionForm
          action={deleteCardAction.bind(null, card.id, card.programId)}
          submitLabel="Kartı sil"
          pendingLabel="Siliniyor…"
          variant="outline"
          confirmMessage={`${card.name} silinsin mi?`}
        />
      ) : (
        <p className="text-muted-foreground text-sm">Kullanıcıların seçtiği kart silinemez.</p>
      )}

      <AuditList entries={audit} title="Kartın işlem geçmişi" />
    </div>
  );
}

/** Yetki kontrolü sayfanın kendisinde: içerik build sırasında önceden üretilmez (ADR 0006). */
export default function Page(props: PageProps<"/admin/katalog/kart/[id]">) {
  return (
    <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
      <AdminCard {...props} />
    </Suspense>
  );
}
