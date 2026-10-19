import { type FormEvent, useState } from "react";
import { conditionText } from "../components/CampaignItem";
import { PageHead } from "../components/Layout";
import { BENEFIT_LABEL, CATEGORIES, categoryName } from "../lib/categories";
import {
  removeCampaign,
  removeCard,
  saveCampaign,
  saveCard,
  seedCatalog,
  seedDemoCampaigns,
} from "../lib/data";
import { formatDay, monthBounds } from "../lib/dates";
import {
  formatBps,
  kurusToInput,
  looksLikeCardNumber,
  parsePercentInput,
  parseTlInput,
} from "../lib/money";
import { PROGRAMS, slugify } from "../lib/seed";
import { useApp } from "../lib/store";
import type { Benefit, Campaign, CampaignCategory, CatalogCard } from "../lib/types";

export function Admin() {
  const [tab, setTab] = useState<"kampanya" | "kart">("kampanya");
  return (
    <>
      <PageHead kicker="Yönetim" title="Katalog ve kampanyalar" />
      <div className="segmented" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "kampanya"}
          onClick={() => setTab("kampanya")}
        >
          Kampanyalar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "kart"}
          onClick={() => setTab("kart")}
        >
          Kart kataloğu
        </button>
      </div>
      {tab === "kampanya" ? <CampaignAdmin /> : <CardAdmin />}
    </>
  );
}

// ---------------- kampanyalar ----------------

type Draft = {
  id?: string;
  title: string;
  summary: string;
  program: string;
  cardIds: string[];
  category: CampaignCategory;
  benefit: Benefit;
  minSpend: string;
  rewardKind: "sabit" | "oran";
  reward: string;
  rate: string;
  cap: string;
  requiresJoin: boolean;
  joinHint: string;
  url: string;
  startsAt: string;
  endsAt: string;
  status: "yayinda" | "taslak";
  demo: boolean;
};

function emptyDraft(today: string): Draft {
  const { end } = monthBounds(today);
  return {
    title: "",
    summary: "",
    program: PROGRAMS[0]?.slug ?? "",
    cardIds: [],
    category: "market",
    benefit: "puan",
    minSpend: "",
    rewardKind: "sabit",
    reward: "",
    rate: "",
    cap: "",
    requiresJoin: false,
    joinHint: "",
    url: "",
    startsAt: today,
    endsAt: end,
    status: "taslak",
    demo: false,
  };
}

function toDraft(c: Campaign): Draft {
  return {
    id: c.id,
    title: c.title,
    summary: c.summary,
    program: c.program,
    cardIds: c.cardIds,
    category: c.category,
    benefit: c.benefit,
    minSpend: kurusToInput(c.minSpendKurus),
    rewardKind: c.rewardKind,
    reward: kurusToInput(c.rewardKurus),
    rate: c.rateBps ? String(c.rateBps / 100).replace(".", ",") : "",
    cap: kurusToInput(c.capKurus),
    requiresJoin: c.requiresJoin,
    joinHint: c.joinHint,
    url: c.url,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    status: c.status,
    demo: !!c.demo,
  };
}

function fromDraft(d: Draft): { value?: Omit<Campaign, "id"> & { id?: string }; error?: string } {
  const money = (s: string) => (s.trim() === "" ? 0 : parseTlInput(s));
  const minSpendKurus = money(d.minSpend);
  const rewardKurus = d.rewardKind === "sabit" ? money(d.reward) : 0;
  const capKurus = d.rewardKind === "oran" ? money(d.cap) : 0;
  const rateBps = d.rewardKind === "oran" ? parsePercentInput(d.rate) : 0;
  if (!d.title.trim()) return { error: "Başlık gerekli." };
  if (looksLikeCardNumber(`${d.title} ${d.summary} ${d.joinHint}`))
    return { error: "Metinde kart numarasına benzeyen bir dizi var." };
  if (minSpendKurus === null || rewardKurus === null || capKurus === null)
    return { error: "Tutarlardan biri geçersiz." };
  if (rateBps === null) return { error: "Oran geçersiz (ör. 5 ya da 0,5)." };
  if (d.rewardKind === "sabit" && (rewardKurus <= 0 || minSpendKurus <= 0))
    return { error: "Sabit ödülde eşik ve ödül tutarı gerekli." };
  if (d.rewardKind === "oran" && rateBps <= 0) return { error: "Oran gerekli." };
  if (!d.startsAt || !d.endsAt || d.endsAt < d.startsAt)
    return { error: "Bitiş tarihi başlangıçtan önce olamaz." };
  if (d.url && !/^https:\/\//.test(d.url)) return { error: "Bağlantı https:// ile başlamalı." };
  const value: Omit<Campaign, "id"> & { id?: string } = {
    title: d.title.trim(),
    summary: d.summary.trim(),
    program: d.program,
    cardIds: d.cardIds,
    category: d.category,
    benefit: d.benefit,
    minSpendKurus,
    rewardKind: d.rewardKind,
    rewardKurus,
    rateBps,
    capKurus,
    requiresJoin: d.requiresJoin,
    joinHint: d.requiresJoin ? d.joinHint.trim() : "",
    url: d.url.trim(),
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    status: d.status,
    demo: d.demo,
  };
  if (d.id) value.id = d.id;
  return { value };
}

function CampaignAdmin() {
  const { campaigns, catalog, today } = useApp();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filter, setFilter] = useState<"hepsi" | "yayinda" | "taslak" | "bitti">("hepsi");
  const [msg, setMsg] = useState("");

  const list = [...campaigns]
    .filter((c) => {
      if (filter === "bitti") return c.endsAt < today;
      if (filter === "hepsi") return true;
      return c.status === filter && c.endsAt >= today;
    })
    .sort((a, b) => b.endsAt.localeCompare(a.endsAt));

  async function demo() {
    const n = await seedDemoCampaigns(today);
    setMsg(`${n} örnek kampanya eklendi (yayında, “Örnek” etiketli).`);
  }

  if (draft) return <CampaignForm draft={draft} catalog={catalog} onClose={() => setDraft(null)} />;

  return (
    <>
      <div className="toolbar">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setDraft(emptyDraft(today))}
        >
          + Yeni kampanya
        </button>
        <button type="button" className="btn btn-ghost" onClick={demo}>
          Örnek kampanyaları ekle
        </button>
        <select
          className="input"
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          aria-label="Durum"
        >
          <option value="hepsi">Tümü</option>
          <option value="yayinda">Yayında</option>
          <option value="taslak">Taslak</option>
          <option value="bitti">Süresi dolan</option>
        </select>
      </div>
      {msg && <p className="form-ok">{msg}</p>}
      <div className="admin-list">
        {list.map((c) => (
          <button
            type="button"
            key={c.id}
            className="admin-row"
            onClick={() => setDraft(toDraft(c))}
          >
            <span
              className={`dot ${c.endsAt < today ? "dot-off" : c.status === "yayinda" ? "dot-on" : "dot-draft"}`}
            />
            <span className="admin-row-main">
              <strong>{c.title}</strong>
              <small className="muted">
                {c.program} · {categoryName(c.category)} · {formatDay(c.startsAt, today)} –{" "}
                {formatDay(c.endsAt, today)}
              </small>
            </span>
            <span className="small muted">
              {c.endsAt < today ? "Bitti" : c.status === "yayinda" ? "Yayında" : "Taslak"}
            </span>
          </button>
        ))}
        {list.length === 0 && <p className="muted">Kampanya yok.</p>}
      </div>
    </>
  );
}

function CampaignForm({
  draft: initial,
  catalog,
  onClose,
}: {
  draft: Draft;
  catalog: CatalogCard[];
  onClose: () => void;
}) {
  const [d, setD] = useState(initial);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const programCards = catalog.filter((c) => c.program === d.program);
  const preview = fromDraft(d).value;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { value, error } = fromDraft(d);
    if (!value) {
      setErr(error ?? "Geçersiz");
      return;
    }
    setBusy(true);
    try {
      await saveCampaign(value);
      onClose();
    } catch {
      setErr("Kaydedilemedi (yetki ya da bağlantı).");
      setBusy(false);
    }
  }

  async function remove() {
    if (!d.id || !confirm("Kampanya silinsin mi?")) return;
    await removeCampaign(d.id);
    onClose();
  }

  return (
    <form className="panel admin-form" onSubmit={submit}>
      <div className="admin-form-head">
        <h2>{d.id ? "Kampanyayı düzenle" : "Yeni kampanya"}</h2>
        <button type="button" className="btn-text" onClick={onClose}>
          ← Listeye dön
        </button>
      </div>

      <label className="field">
        <span>Başlık</span>
        <input
          className="input"
          value={d.title}
          onChange={(e) => set("title", e.target.value)}
          required
        />
      </label>
      <label className="field">
        <span>Kısa özet (boşsa koşullardan üretilir)</span>
        <textarea
          className="input"
          rows={2}
          value={d.summary}
          onChange={(e) => set("summary", e.target.value)}
        />
      </label>

      <div className="grid-3">
        <label className="field">
          <span>Program</span>
          <select
            className="input"
            value={d.program}
            onChange={(e) => setD({ ...d, program: e.target.value, cardIds: [] })}
          >
            {PROGRAMS.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name} · {p.bank}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Kategori</span>
          <select
            className="input"
            value={d.category}
            onChange={(e) => set("category", e.target.value as CampaignCategory)}
          >
            <option value="tumu">Tüm harcamalar</option>
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Fayda</span>
          <select
            className="input"
            value={d.benefit}
            onChange={(e) => set("benefit", e.target.value as Benefit)}
          >
            {(Object.keys(BENEFIT_LABEL) as Benefit[]).map((b) => (
              <option key={b} value={b}>
                {BENEFIT_LABEL[b]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="field">
        <legend>Geçerli kartlar (hiçbiri seçilmezse programdaki tüm kartlar)</legend>
        <div className="chips">
          {programCards.map((c) => {
            const on = d.cardIds.includes(c.id);
            return (
              <button
                type="button"
                key={c.id}
                className={`chip ${on ? "on" : ""}`}
                aria-pressed={on}
                onClick={() =>
                  set("cardIds", on ? d.cardIds.filter((x) => x !== c.id) : [...d.cardIds, c.id])
                }
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="segmented segmented-sm" role="radiogroup" aria-label="Ödül türü">
        <button
          type="button"
          role="radio"
          aria-checked={d.rewardKind === "sabit"}
          onClick={() => set("rewardKind", "sabit")}
        >
          Eşiğe sabit ödül
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={d.rewardKind === "oran"}
          onClick={() => set("rewardKind", "oran")}
        >
          Yüzde ödül
        </button>
      </div>

      <div className="grid-3">
        <label className="field">
          <span>Harcama eşiği (₺)</span>
          <input
            className="input"
            inputMode="decimal"
            value={d.minSpend}
            onChange={(e) => set("minSpend", e.target.value)}
            placeholder="1500"
          />
        </label>
        {d.rewardKind === "sabit" ? (
          <label className="field">
            <span>Ödül (₺)</span>
            <input
              className="input"
              inputMode="decimal"
              value={d.reward}
              onChange={(e) => set("reward", e.target.value)}
              placeholder="150"
            />
          </label>
        ) : (
          <>
            <label className="field">
              <span>Oran (%)</span>
              <input
                className="input"
                inputMode="decimal"
                value={d.rate}
                onChange={(e) => set("rate", e.target.value)}
                placeholder="5"
              />
            </label>
            <label className="field">
              <span>Üst limit (₺, boş = yok)</span>
              <input
                className="input"
                inputMode="decimal"
                value={d.cap}
                onChange={(e) => set("cap", e.target.value)}
                placeholder="100"
              />
            </label>
          </>
        )}
      </div>

      <div className="grid-3">
        <label className="field">
          <span>Başlangıç</span>
          <input
            className="input"
            type="date"
            value={d.startsAt}
            onChange={(e) => set("startsAt", e.target.value)}
          />
        </label>
        <label className="field">
          <span>Bitiş (dahil)</span>
          <input
            className="input"
            type="date"
            value={d.endsAt}
            onChange={(e) => set("endsAt", e.target.value)}
          />
        </label>
        <label className="field">
          <span>Bankanın sayfası</span>
          <input
            className="input"
            type="url"
            value={d.url}
            onChange={(e) => set("url", e.target.value)}
            placeholder="https://"
          />
        </label>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={d.requiresJoin}
          onChange={(e) => set("requiresJoin", e.target.checked)}
        />
        Katılım gerekli
      </label>
      {d.requiresJoin && (
        <label className="field">
          <span>Nasıl katılınır</span>
          <input
            className="input"
            value={d.joinHint}
            onChange={(e) => set("joinHint", e.target.value)}
            placeholder="Mobil uygulamadan “Katıl”"
          />
        </label>
      )}
      <label className="check">
        <input type="checkbox" checked={d.demo} onChange={(e) => set("demo", e.target.checked)} />
        Örnek kampanya (gerçek değil, “Örnek” etiketi gösterilir)
      </label>

      {preview && (
        <p className="preview">
          <span className="kicker">Kullanıcı şöyle görecek</span>
          {preview.summary || conditionText({ ...preview, id: "" })}
        </p>
      )}
      {err && <p className="form-error">{err}</p>}

      <div className="admin-form-foot">
        {d.id && (
          <button type="button" className="btn btn-danger-ghost" onClick={remove}>
            Sil
          </button>
        )}
        <span className="spacer" />
        <select
          className="input"
          value={d.status}
          onChange={(e) => set("status", e.target.value as Draft["status"])}
          aria-label="Durum"
        >
          <option value="taslak">Taslak</option>
          <option value="yayinda">Yayında</option>
        </select>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
    </form>
  );
}

// ---------------- kart kataloğu ----------------

function CardAdmin() {
  const { catalog } = useApp();
  const [msg, setMsg] = useState("");
  const [newCard, setNewCard] = useState({ program: PROGRAMS[0]?.slug ?? "", name: "" });

  async function seed() {
    const n = await seedCatalog();
    setMsg(n ? `${n} kart eklendi.` : "Katalog zaten tam; hiçbir kayıt değişmedi.");
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const p = PROGRAMS.find((x) => x.slug === newCard.program);
    const name = newCard.name.trim();
    if (!p || !name) return;
    const id = slugify(name);
    if (catalog.some((c) => c.id === id)) {
      setMsg("Bu adla bir kart zaten var.");
      return;
    }
    await saveCard({
      id,
      bank: p.bank,
      program: p.slug,
      programName: p.name,
      name,
      baseRateBps: 0,
      verified: false,
    });
    setNewCard({ ...newCard, name: "" });
    setMsg(`${name} eklendi.`);
  }

  return (
    <>
      <div className="toolbar">
        <button type="button" className="btn btn-ghost" onClick={seed}>
          Kataloğu yükle (eksikleri ekle)
        </button>
      </div>
      {msg && <p className="form-ok">{msg}</p>}
      <form className="toolbar" onSubmit={add}>
        <select
          className="input"
          value={newCard.program}
          onChange={(e) => setNewCard({ ...newCard, program: e.target.value })}
          aria-label="Program"
        >
          {PROGRAMS.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder="Kart adı"
          value={newCard.name}
          onChange={(e) => setNewCard({ ...newCard, name: e.target.value })}
        />
        <button className="btn btn-primary">Ekle</button>
      </form>
      <p className="muted small">
        Temel oranı yalnızca bankanın kaynağından doğruladıktan sonra gir ve “doğrulandı” işaretle.
        Doğrulanmamış kartlarda kullanıcıya uyarı gösterilir.
      </p>
      <div className="admin-list">
        {catalog.map((c) => (
          <CardRow key={c.id} card={c} />
        ))}
      </div>
    </>
  );
}

function CardRow({ card }: { card: CatalogCard }) {
  const [rate, setRate] = useState(
    card.baseRateBps ? String(card.baseRateBps / 100).replace(".", ",") : "0",
  );
  const [verified, setVerified] = useState(card.verified);
  const [state, setState] = useState("");
  const bps = parsePercentInput(rate);
  const dirty = bps !== card.baseRateBps || verified !== card.verified;

  async function save() {
    if (bps === null) {
      setState("Oran geçersiz");
      return;
    }
    await saveCard({ ...card, baseRateBps: bps, verified });
    setState("Kaydedildi");
  }

  return (
    <div className="admin-row admin-row-static">
      <span className={`dot ${card.verified ? "dot-on" : "dot-draft"}`} />
      <span className="admin-row-main">
        <strong>{card.name}</strong>
        <small className="muted">
          {card.programName} · {card.bank} · şu an {formatBps(card.baseRateBps)}
        </small>
      </span>
      <span className="card-edit">
        <span className="money-input money-input-sm">
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            aria-label={`${card.name} temel oran`}
            inputMode="decimal"
          />
          <span>%</span>
        </span>
        <label className="check small">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => setVerified(e.target.checked)}
          />
          doğrulandı
        </label>
        <button type="button" className="btn btn-soft" disabled={!dirty} onClick={save}>
          Kaydet
        </button>
        <button
          type="button"
          className="btn-text"
          onClick={() => confirm(`${card.name} katalogdan silinsin mi?`) && removeCard(card.id)}
        >
          Sil
        </button>
        {state && <small className="muted">{state}</small>}
      </span>
    </div>
  );
}
