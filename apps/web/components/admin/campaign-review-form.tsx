"use client";

import type { CampaignStatus } from "@kartplan/shared";
import { useState, useTransition } from "react";

import { Field, inputClass } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rejectCampaignAction, saveCampaignAction } from "@/lib/admin-campaign-actions";
import type { ActionResult } from "@/lib/admin-catalog-actions";
import { JOIN_METHOD_LABELS, REWARD_LABELS, THRESHOLD_LABELS } from "@/lib/admin-labels";
import { emptyRule } from "@/lib/campaign-draft";
import type { CampaignDraft, RuleDraft } from "@/lib/campaign-draft";
import { cn } from "@/lib/utils";

type Category = { id: string; name: string; merchants: { id: string; name: string }[] };

/** LLM'in `uncertain_fields` adları (snake_case) → form alanı. */
const RULE_FIELD_KEYS: Record<string, keyof RuleDraft> = {
  categories: "categoryIds",
  merchants: "merchantIds",
  threshold_type: "thresholdType",
  threshold_kurus: "threshold",
  txn_count: "txnCount",
  tier_repeat: "tierRepeat",
  reward_type: "rewardType",
  reward_kurus: "reward",
  reward_bps: "rewardRate",
  cap_kurus: "cap",
  exclusions: "exclusions",
};

const uncertainClass = "border-amber-500 bg-amber-500/5 ring-1 ring-amber-500/40";

function toggle(list: string[], id: string, on: boolean) {
  return on ? [...list, id] : list.filter((item) => item !== id);
}

export function CampaignReviewForm({
  campaignId,
  status,
  initial,
  uncertainFields,
  cards,
  categories,
}: {
  campaignId: string;
  status: CampaignStatus;
  initial: CampaignDraft;
  uncertainFields: string[];
  cards: { id: string; name: string }[];
  categories: Category[];
}) {
  const [draft, setDraft] = useState(initial);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<ActionResult>({});
  const [pending, startTransition] = useTransition();

  const uncertain = new Set<string>();
  for (const field of uncertainFields) {
    const match = /^rules\[(\d+)\]\.(\w+)$/.exec(field);
    const key = match && RULE_FIELD_KEYS[match[2]!];
    uncertain.add(match && key ? `rules.${match[1]}.${key}` : field);
  }
  const mark = (key: string) => (uncertain.has(key) ? uncertainClass : undefined);
  const unknownMerchants = uncertainFields
    .filter((field) => field.startsWith("merchant:"))
    .map((field) => field.slice("merchant:".length));

  const set = (patch: Partial<CampaignDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const setRule = (index: number, patch: Partial<RuleDraft>) =>
    setDraft((current) => ({
      ...current,
      rules: current.rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
    }));

  function run(action: () => Promise<ActionResult>) {
    setState({});
    startTransition(async () => setState(await action()));
  }

  return (
    <div className="space-y-6">
      {uncertainFields.length > 0 && (
        <div
          role="note"
          className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
        >
          <p className="font-medium">LLM şu alanlardan emin değil (sarı işaretli):</p>
          <p className="text-muted-foreground">{uncertainFields.join(", ")}</p>
          {unknownMerchants.length > 0 && (
            <p>
              Katalogda olmayan marka: <strong>{unknownMerchants.join(", ")}</strong> — gerekiyorsa
              önce katalog panelinden ekle.
            </p>
          )}
        </div>
      )}

      <form
        aria-label="Kampanya düzenle"
        noValidate
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => saveCampaignAction(campaignId, "save", draft));
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Kampanya</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field id="campaign-title" label="Başlık">
              <input
                id="campaign-title"
                value={draft.title}
                onChange={(event) => set({ title: event.target.value })}
                className={cn(inputClass, mark("title"))}
              />
            </Field>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">
                Özet (kullanıcıya gösterilir, en fazla 3)
              </legend>
              {draft.summary.map((line, index) => (
                <input
                  key={index}
                  aria-label={`Özet ${index + 1}`}
                  value={line}
                  onChange={(event) =>
                    set({
                      summary: draft.summary.map((item, i) =>
                        i === index ? event.target.value : item,
                      ),
                    })
                  }
                  className={cn(inputClass, mark("summary"))}
                />
              ))}
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="campaign-starts" label="Başlangıç">
                <input
                  id="campaign-starts"
                  type="date"
                  value={draft.startsAt}
                  onChange={(event) => set({ startsAt: event.target.value })}
                  className={cn(inputClass, mark("starts_at"))}
                />
              </Field>
              <Field id="campaign-ends" label="Bitiş">
                <input
                  id="campaign-ends"
                  type="date"
                  value={draft.endsAt}
                  onChange={(event) => set({ endsAt: event.target.value })}
                  className={cn(inputClass, mark("ends_at"))}
                />
              </Field>
              <Field id="campaign-join" label="Katılım">
                <select
                  id="campaign-join"
                  value={draft.joinMethod}
                  onChange={(event) => set({ joinMethod: event.target.value })}
                  className={cn(inputClass, mark("join_method"))}
                >
                  {Object.entries(JOIN_METHOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="campaign-deadline" label="Son katılım" hint="Boş = bitişe kadar">
                <input
                  id="campaign-deadline"
                  type="date"
                  value={draft.joinDeadline}
                  onChange={(event) => set({ joinDeadline: event.target.value })}
                  className={cn(inputClass, mark("join_deadline"))}
                />
              </Field>
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">
                Geçerli kartlar{" "}
                <span className="text-muted-foreground font-normal">
                  (hiçbiri seçilmezse programdaki tüm kartlar)
                </span>
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {cards.map((card) => (
                  <label key={card.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.cardIds.includes(card.id)}
                      onChange={(event) =>
                        set({ cardIds: toggle(draft.cardIds, card.id, event.target.checked) })
                      }
                      className="accent-primary size-4"
                    />
                    {card.name}
                  </label>
                ))}
              </div>
            </fieldset>
          </CardContent>
        </Card>

        {draft.rules.map((rule, index) => (
          <RuleEditor
            key={index}
            index={index}
            rule={rule}
            categories={categories}
            mark={(field) => mark(`rules.${index}.${field}`)}
            onChange={(patch) => setRule(index, patch)}
            onRemove={
              draft.rules.length > 1
                ? () => set({ rules: draft.rules.filter((_, i) => i !== index) })
                : undefined
            }
          />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => set({ rules: [...draft.rules, emptyRule()] })}
        >
          Kural ekle
        </Button>

        {state.error && (
          <p role="alert" className="text-destructive text-sm">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p role="status" className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm">
            Kampanya kaydedildi.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => run(() => saveCampaignAction(campaignId, "approve", draft))}
          >
            {status === "APPROVED" ? "Kaydet (yayında)" : "Kaydet ve onayla"}
          </Button>
          {status !== "APPROVED" && (
            <Button type="submit" variant="outline" size="sm" disabled={pending}>
              Taslağı kaydet
            </Button>
          )}
        </div>
      </form>

      {status !== "REJECTED" && (
        <form
          aria-label="Kampanyayı reddet"
          className="space-y-2 border-t pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!window.confirm("Kampanya reddedilsin mi?")) return;
            run(() => rejectCampaignAction(campaignId, reason));
          }}
        >
          <Field id="reject-reason" label="Ret gerekçesi" hint="Opsiyonel; işlem kaydına yazılır">
            <input
              id="reject-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Button type="submit" variant="destructive" size="sm" disabled={pending}>
            Reddet
          </Button>
        </form>
      )}
    </div>
  );
}

function RuleEditor({
  index,
  rule,
  categories,
  mark,
  onChange,
  onRemove,
}: {
  index: number;
  rule: RuleDraft;
  categories: Category[];
  mark: (field: keyof RuleDraft) => string | undefined;
  onChange: (patch: Partial<RuleDraft>) => void;
  onRemove?: () => void;
}) {
  const id = (field: string) => `rule-${index}-${field}`;
  const isCount = rule.thresholdType === "TXN_COUNT";
  return (
    <fieldset className="space-y-3 rounded-xl border p-4">
      <legend className="px-1 font-medium">Kural {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={id("threshold-type")} label="Eşik türü">
          <select
            id={id("threshold-type")}
            value={rule.thresholdType}
            onChange={(event) => onChange({ thresholdType: event.target.value })}
            className={cn(inputClass, mark("thresholdType"))}
          >
            {Object.entries(THRESHOLD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {isCount ? (
          <Field id={id("txn-count")} label="İşlem adedi">
            <input
              id={id("txn-count")}
              inputMode="numeric"
              value={rule.txnCount}
              onChange={(event) => onChange({ txnCount: event.target.value })}
              className={cn(inputClass, mark("txnCount"))}
            />
          </Field>
        ) : (
          <Field id={id("threshold")} label="Eşik (TL)">
            <input
              id={id("threshold")}
              inputMode="decimal"
              value={rule.threshold}
              onChange={(event) => onChange({ threshold: event.target.value })}
              className={cn(inputClass, mark("threshold"))}
            />
          </Field>
        )}
        <Field id={id("reward-type")} label="Ödül türü">
          <select
            id={id("reward-type")}
            value={rule.rewardType}
            onChange={(event) => onChange({ rewardType: event.target.value })}
            className={cn(inputClass, mark("rewardType"))}
          >
            {Object.entries(REWARD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field id={id("reward")} label="Ödül (TL)" hint="Sabit ödül; oransal ise boş bırak">
          <input
            id={id("reward")}
            inputMode="decimal"
            value={rule.reward}
            onChange={(event) => onChange({ reward: event.target.value })}
            className={cn(inputClass, mark("reward"))}
          />
        </Field>
        <Field id={id("reward-rate")} label="Ödül oranı (%)">
          <input
            id={id("reward-rate")}
            inputMode="decimal"
            value={rule.rewardRate}
            onChange={(event) => onChange({ rewardRate: event.target.value })}
            className={cn(inputClass, mark("rewardRate"))}
          />
        </Field>
        <Field id={id("cap")} label="Üst limit (TL)" hint="Boş = limit yok">
          <input
            id={id("cap")}
            inputMode="decimal"
            value={rule.cap}
            onChange={(event) => onChange({ cap: event.target.value })}
            className={cn(inputClass, mark("cap"))}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={rule.tierRepeat}
          onChange={(event) => onChange({ tierRepeat: event.target.checked })}
          className={cn("accent-primary size-4", mark("tierRepeat"))}
        />
        Eşik her seferinde tekrarlanır (ör. her 2.500 TL&apos;ye)
      </label>
      <Field
        id={id("exclusions")}
        label="Hariç tutulanlar"
        hint="Virgülle ayır: taksitli, nakit_avans"
      >
        <input
          id={id("exclusions")}
          value={rule.exclusions}
          onChange={(event) => onChange({ exclusions: event.target.value })}
          className={cn(inputClass, mark("exclusions"))}
        />
      </Field>
      <fieldset className={cn("space-y-1 rounded-md p-1", mark("categoryIds"))}>
        <legend className="text-sm font-medium">
          Kategoriler{" "}
          <span className="text-muted-foreground font-normal">(boş = tüm harcamalar)</span>
        </legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {categories.map((category) => (
            <label key={category.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rule.categoryIds.includes(category.id)}
                onChange={(event) =>
                  onChange({
                    categoryIds: toggle(rule.categoryIds, category.id, event.target.checked),
                  })
                }
                className="accent-primary size-4"
              />
              {category.name}
            </label>
          ))}
        </div>
      </fieldset>
      <details
        className={cn("rounded-md p-1", mark("merchantIds"))}
        open={rule.merchantIds.length > 0}
      >
        <summary className="cursor-pointer text-sm font-medium">
          Markalar ({rule.merchantIds.length} seçili){" "}
          <span className="text-muted-foreground font-normal">(boş = kategorideki tümü)</span>
        </summary>
        <div className="mt-2 space-y-2">
          {categories
            .filter((category) => category.merchants.length > 0)
            .map((category) => (
              <div key={category.id}>
                <p className="text-muted-foreground text-xs">{category.name}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {category.merchants.map((merchant) => (
                    <label key={merchant.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={rule.merchantIds.includes(merchant.id)}
                        onChange={(event) =>
                          onChange({
                            merchantIds: toggle(
                              rule.merchantIds,
                              merchant.id,
                              event.target.checked,
                            ),
                          })
                        }
                        className="accent-primary size-4"
                      />
                      {merchant.name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </details>
      {onRemove && (
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          Kuralı kaldır
        </Button>
      )}
    </fieldset>
  );
}
