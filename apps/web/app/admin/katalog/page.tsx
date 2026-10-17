import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { AuditList } from "@/components/admin/audit-list";
import { Checkbox, Field, inputClass, VerifiedBadge } from "@/components/admin/fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminCatalog, getAuditLog } from "@/lib/admin-catalog";
import {
  createBankAction,
  createProgramAction,
  deleteBankAction,
  updateBankAction,
} from "@/lib/admin-catalog-actions";

export default async function AdminCatalogPage() {
  const [banks, audit] = await Promise.all([getAdminCatalog(), getAuditLog({}, 15)]);
  const programs = banks.flatMap((b) => b.programs);
  const cards = programs.flatMap((p) => p.cards);
  const verifiedCards = cards.filter((c) => c.ratesVerifiedAt).length;
  const verifiedPrograms = programs.filter((p) => p.pointValueVerifiedAt).length;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Katalog</h1>
        <p className="text-muted-foreground" data-testid="verification-summary">
          Oranı doğrulanan kart: {verifiedCards} / {cards.length} · Puan değeri doğrulanan program:{" "}
          {verifiedPrograms} / {programs.length}
        </p>
        <p className="text-muted-foreground text-sm">
          Doğrulanmamış oranlar planlarda kullanıcıya &quot;tahmini&quot; olarak gösterilir. Bir
          değeri banka kaynağından kontrol ettiğinde ilgili sayfada &quot;doğrulandı&quot; olarak
          işaretle; her değişiklik işlem kaydına yazılır.
        </p>
      </div>

      {banks.map((bank) => (
        <Card key={bank.id}>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>{bank.name}</CardTitle>
            <div className="flex flex-wrap gap-2">
              <details className="text-sm">
                <summary className="cursor-pointer select-none">Yeniden adlandır</summary>
                <ActionForm
                  action={updateBankAction.bind(null, bank.id)}
                  submitLabel="Kaydet"
                  label={`${bank.name} yeniden adlandır`}
                  className="mt-2 w-64"
                >
                  <Field id={`bank-name-${bank.id}`} label="Banka adı">
                    <input
                      id={`bank-name-${bank.id}`}
                      name="name"
                      defaultValue={bank.name}
                      className={inputClass}
                    />
                  </Field>
                </ActionForm>
              </details>
              {bank.programs.length === 0 && (
                <ActionForm
                  action={deleteBankAction.bind(null, bank.id)}
                  submitLabel="Bankayı sil"
                  pendingLabel="Siliniyor…"
                  variant="outline"
                  confirmMessage={`${bank.name} silinsin mi?`}
                />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {bank.programs.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground text-left">
                    <tr>
                      <th className="py-2 pr-3 font-normal">Program</th>
                      <th className="py-2 pr-3 font-normal">Puan</th>
                      <th className="py-2 pr-3 font-normal">Puan değeri</th>
                      <th className="py-2 pr-3 font-normal">Kartlar (oranı doğrulanan)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bank.programs.map((program) => (
                      <tr key={program.id} className="border-t">
                        <td className="py-2 pr-3">
                          <Link
                            href={`/admin/katalog/program/${program.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {program.name}
                          </Link>
                          <span className="text-muted-foreground"> · {program.slug}</span>
                        </td>
                        <td className="py-2 pr-3">{program.pointName}</td>
                        <td className="py-2 pr-3">
                          <span className="mr-2">1 = {program.pointValueTL.toString()} TL</span>
                          <VerifiedBadge at={program.pointValueVerifiedAt} />
                        </td>
                        <td className="py-2 pr-3">
                          {program.cards.length} (
                          {program.cards.filter((c) => c.ratesVerifiedAt).length})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <details>
              <summary className="cursor-pointer text-sm select-none">Program ekle</summary>
              <ActionForm
                action={createProgramAction.bind(null, bank.id)}
                submitLabel="Programı ekle"
                label={`${bank.name} program ekle`}
                className="mt-3 max-w-xl"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id={`p-name-${bank.id}`} label="Program adı">
                    <input
                      id={`p-name-${bank.id}`}
                      name="name"
                      placeholder="ör. Bonus"
                      className={inputClass}
                    />
                  </Field>
                  <Field
                    id={`p-slug-${bank.id}`}
                    label="Kısa ad"
                    hint="Küçük harf, rakam, tire (ör. bonus)"
                  >
                    <input id={`p-slug-${bank.id}`} name="slug" className={inputClass} />
                  </Field>
                  <Field id={`p-point-${bank.id}`} label="Puan adı">
                    <input
                      id={`p-point-${bank.id}`}
                      name="pointName"
                      placeholder="ör. MaxiPuan"
                      className={inputClass}
                    />
                  </Field>
                  <Field id={`p-value-${bank.id}`} label="1 puan kaç TL?">
                    <input
                      id={`p-value-${bank.id}`}
                      name="pointValueTL"
                      defaultValue="1"
                      className={inputClass}
                    />
                  </Field>
                </div>
                <Checkbox
                  id={`p-verified-${bank.id}`}
                  name="pointValueVerified"
                  label="Puan değerini banka kaynağından doğruladım"
                />
              </ActionForm>
            </details>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Banka ekle</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={createBankAction}
            submitLabel="Bankayı ekle"
            successMessage="Banka eklendi."
            resetOnSuccess
            label="Banka ekle"
            className="max-w-sm"
          >
            <Field id="new-bank-name" label="Banka adı">
              <input id="new-bank-name" name="name" className={inputClass} />
            </Field>
          </ActionForm>
        </CardContent>
      </Card>

      <AuditList entries={audit} />
    </div>
  );
}
