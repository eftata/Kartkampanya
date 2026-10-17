import { formatKurus } from "@kartplan/shared";
import Link from "next/link";

import { JoinToggle } from "@/components/join-toggle";
import type { PlanCampaignRef, PlanView as PlanViewData } from "@/lib/plan";

const monthFormat = new Intl.DateTimeFormat("tr-TR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div role="group" aria-label={label} className="rounded-xl border p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
    </div>
  );
}

function CampaignLinks({ refs }: { refs: PlanCampaignRef[] }) {
  if (refs.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="space-y-0.5">
      {refs.map((ref) => (
        <li key={ref.id}>
          <Link href={`/kampanyalarim/${ref.id}`} className="underline-offset-4 hover:underline">
            {ref.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Kampanya başına tekilleştirir (bir kampanyanın birden çok kuralı olabilir). */
function uniqueCampaigns(ruleIds: string[], lookup: Record<string, PlanCampaignRef>) {
  const seen = new Map<string, PlanCampaignRef>();
  for (const id of ruleIds) {
    const ref = lookup[id];
    if (ref) seen.set(ref.id, ref);
  }
  return [...seen.values()];
}

export function monthLabel(month: string) {
  return monthFormat.format(new Date(`${month}-01T00:00:00Z`));
}

export function PlanView({ view }: { view: PlanViewData }) {
  const { plan, categoryName, cardName, ruleCampaign } = view;
  const gain = plan.totalExpected - plan.baseline.total;
  const hitCampaigns = uniqueCampaigns(
    plan.campaignsHit.map((hit) => hit.id),
    ruleCampaign,
  );
  const toJoin = hitCampaigns.filter((ref) => ref.joinRequired && !ref.joined);
  const nearMisses = new Map<string, { ref: PlanCampaignRef; missing: number; extra: number }>();
  for (const miss of plan.nearMisses) {
    const ref = ruleCampaign[miss.id];
    if (ref && !nearMisses.has(ref.id)) {
      nearMisses.set(ref.id, { ref, missing: miss.missingAmount, extra: miss.extraReward });
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile label="Beklenen kazanç" value={formatKurus(plan.totalExpected)} />
        <Tile
          label="Her şeyi tek kartla ödeseydin"
          value={formatKurus(plan.baseline.total)}
          hint={plan.baseline.card ? `En iyi tek kart: ${cardName[plan.baseline.card]}` : undefined}
        />
        <Tile
          label="Plan sayesinde fazladan"
          value={gain > 0 ? `+${formatKurus(gain)}` : formatKurus(0)}
        />
      </div>

      {toJoin.length > 0 && (
        <section
          aria-label="Katılman gereken kampanyalar"
          className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4"
        >
          <h2 className="font-medium">Plan bu kampanyalara katılmana bağlı</h2>
          <ul className="space-y-2">
            {toJoin.map((ref) => (
              <li key={ref.id} className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/kampanyalarim/${ref.id}`} className="underline underline-offset-4">
                  {ref.title}
                </Link>
                <JoinToggle key={String(ref.joined)} campaignId={ref.id} joined={ref.joined} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Harcama dağılımı" className="space-y-3">
        <h2 className="font-medium">Hangi harcama hangi kartla?</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left">
              <tr>
                <th className="px-3 py-2 font-normal">Kategori</th>
                <th className="px-3 py-2 font-normal">Kart</th>
                <th className="px-3 py-2 text-right font-normal">Tutar</th>
                <th className="px-3 py-2 font-normal">Kampanyalar</th>
                <th className="px-3 py-2 text-right font-normal">Beklenen kazanç</th>
              </tr>
            </thead>
            <tbody>
              {plan.allocations.map((row) => (
                <tr key={`${row.category}|${row.card}`} className="border-t align-top">
                  <td className="px-3 py-2 font-medium">{categoryName[row.category]}</td>
                  <td className="px-3 py-2">{cardName[row.card]}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {formatKurus(row.amount)}
                  </td>
                  <td className="px-3 py-2">
                    <CampaignLinks refs={uniqueCampaigns(row.campaigns, ruleCampaign)} />
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {formatKurus(row.expectedReward)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {plan.unallocated.length > 0 && (
        <p role="status" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm">
          Kart limitlerin bu harcamalara yetmiyor:{" "}
          {plan.unallocated
            .map((item) => `${categoryName[item.category]} ${formatKurus(item.amount)}`)
            .join(", ")}
          .{" "}
          <Link href="/kartlarim" className="underline">
            Limitleri güncelle
          </Link>
        </p>
      )}

      {nearMisses.size > 0 && (
        <section aria-label="Yakın kampanyalar" className="space-y-2">
          <h2 className="font-medium">Az kaldı</h2>
          <p className="text-muted-foreground text-sm">
            Gereksiz harcamaya teşvik etmeyiz: yalnızca zaten yapacağın bir harcamaysa işine yarar.
          </p>
          <ul className="space-y-1 text-sm">
            {[...nearMisses.values()].slice(0, 5).map(({ ref, missing, extra }) => (
              <li key={ref.id}>
                <Link href={`/kampanyalarim/${ref.id}`} className="underline underline-offset-4">
                  {ref.title}
                </Link>
                : {formatKurus(missing)} daha harcarsan +{formatKurus(extra)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="text-muted-foreground space-y-1 text-xs">
        <p>
          Tutarlar bu ay için harcama profiline göre tahmindir; kesin kampanya koşulları bankanın
          sayfasında geçerlidir.
        </p>
        {view.unverifiedRates && (
          <p>Bazı kartlarının temel kazanç oranları henüz kaynaktan doğrulanmadı.</p>
        )}
        {plan.status !== "OPTIMAL" && (
          <p>
            {plan.status === "FEASIBLE"
              ? "Süre içinde bulunan en iyi plan; daha iyisi olabilir."
              : "Yaklaşık plan (hızlı yöntem)."}
          </p>
        )}
      </div>
    </div>
  );
}
