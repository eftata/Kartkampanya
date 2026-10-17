import { formatBps } from "@kartplan/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ActionForm } from "@/components/admin/action-form";
import { AuditList } from "@/components/admin/audit-list";
import { Checkbox, Field, inputClass, VerifiedBadge } from "@/components/admin/fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminProgram, getAuditLog } from "@/lib/admin-catalog";
import { requireAdmin } from "@/lib/auth/session";
import {
  createCardAction,
  deleteProgramAction,
  updateProgramAction,
} from "@/lib/admin-catalog-actions";
import { CARD_TYPE_LABELS } from "@/lib/admin-labels";

async function AdminProgram({ params }: PageProps<"/admin/katalog/program/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const [program, audit] = await Promise.all([
    getAdminProgram(id),
    getAuditLog({ entityType: "Program", entityId: id }, 10),
  ]);
  if (!program) notFound();

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Link href="/admin/katalog" className="text-muted-foreground text-sm underline">
          ← Katalog
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {program.bank.name} · {program.name}
        </h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Program bilgileri</CardTitle>
            <span data-testid="program-status">
              <VerifiedBadge at={program.pointValueVerifiedAt} />
            </span>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={updateProgramAction.bind(null, program.id)}
              submitLabel="Kaydet"
              successMessage="Program kaydedildi."
              label="Program bilgileri"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="program-name" label="Program adı">
                  <input
                    id="program-name"
                    name="name"
                    defaultValue={program.name}
                    className={inputClass}
                  />
                </Field>
                <Field id="program-slug" label="Kısa ad">
                  <input
                    id="program-slug"
                    name="slug"
                    defaultValue={program.slug}
                    className={inputClass}
                  />
                </Field>
                <Field id="program-point" label="Puan adı">
                  <input
                    id="program-point"
                    name="pointName"
                    defaultValue={program.pointName}
                    className={inputClass}
                  />
                </Field>
                <Field id="program-value" label="1 puan kaç TL?">
                  <input
                    id="program-value"
                    name="pointValueTL"
                    defaultValue={program.pointValueTL.toString()}
                    className={inputClass}
                  />
                </Field>
              </div>
              <Checkbox
                id="program-verified"
                name="pointValueVerified"
                defaultChecked={Boolean(program.pointValueVerifiedAt)}
                label="Puan değerini banka kaynağından doğruladım"
              />
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kart ekle</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={createCardAction.bind(null, program.id)}
              submitLabel="Kartı ekle"
              label="Kart ekle"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="new-card-name" label="Kart adı">
                  <input
                    id="new-card-name"
                    name="name"
                    placeholder="ör. Bonus Platinum"
                    className={inputClass}
                  />
                </Field>
                <Field id="new-card-type" label="Tür">
                  <select
                    id="new-card-type"
                    name="type"
                    defaultValue="CREDIT"
                    className={inputClass}
                  >
                    {Object.entries(CARD_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="new-card-base" label="Temel oran (%)" hint="Boş = 0">
                  <input
                    id="new-card-base"
                    name="baseRate"
                    placeholder="ör. 0,5"
                    className={inputClass}
                  />
                </Field>
                <Field id="new-card-fee" label="Yıllık ücret (TL)" hint="Boş = bilinmiyor">
                  <input id="new-card-fee" name="annualFee" className={inputClass} />
                </Field>
              </div>
              <Checkbox
                id="new-card-verified"
                name="ratesVerified"
                label="Oranı banka kaynağından doğruladım"
              />
            </ActionForm>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3" aria-label="Kartlar">
        <h2 className="font-medium">Kartlar ({program.cards.length})</h2>
        {program.cards.length === 0 ? (
          <p className="text-muted-foreground text-sm">Bu programda kart yok.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left">
                <tr>
                  <th className="px-3 py-2 font-normal">Kart</th>
                  <th className="px-3 py-2 font-normal">Tür</th>
                  <th className="px-3 py-2 font-normal">Temel oran</th>
                  <th className="px-3 py-2 font-normal">Kullanıcı</th>
                  <th className="px-3 py-2 font-normal">Durum</th>
                </tr>
              </thead>
              <tbody>
                {program.cards.map((card) => (
                  <tr key={card.id} className="border-t">
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/katalog/kart/${card.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {card.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{CARD_TYPE_LABELS[card.type]}</td>
                    <td className="px-3 py-2">{formatBps(card.baseRateBps)}</td>
                    <td className="px-3 py-2">{card._count.userCards}</td>
                    <td className="px-3 py-2">
                      <VerifiedBadge at={card.ratesVerifiedAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {program.cards.length === 0 && (
        <ActionForm
          action={deleteProgramAction.bind(null, program.id)}
          submitLabel="Programı sil"
          pendingLabel="Siliniyor…"
          variant="outline"
          confirmMessage={`${program.name} silinsin mi?`}
        />
      )}

      <AuditList entries={audit} title="Programın işlem geçmişi" />
    </div>
  );
}

/** Yetki kontrolü sayfanın kendisinde: içerik build sırasında önceden üretilmez (ADR 0006). */
export default function Page(props: PageProps<"/admin/katalog/program/[id]">) {
  return (
    <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-xl" />}>
      <AdminProgram {...props} />
    </Suspense>
  );
}
