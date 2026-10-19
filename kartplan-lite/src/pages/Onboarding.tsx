import { signOut } from "firebase/auth";
import { useState } from "react";
import { CardPicker } from "../components/CardPicker";
import { SpendForm } from "../components/SpendForm";
import { fb } from "../firebase";
import { CONSENT_VERSION, saveUser } from "../lib/data";
import { formatKurus } from "../lib/money";
import { Link, navigate } from "../lib/router";
import { useApp } from "../lib/store";
import type { SpendProfile } from "../lib/types";

export function Onboarding() {
  const { user, profile, catalog } = useApp();
  const [step, setStep] = useState(profile?.cardIds.length ? 2 : 1);
  const [cardIds, setCardIds] = useState<string[]>(profile?.cardIds ?? []);
  const [spend, setSpend] = useState<SpendProfile>(profile?.spend ?? {});
  const [consent, setConsent] = useState((profile?.consentVersion ?? 0) >= CONSENT_VERSION);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const total = Object.values(spend).reduce((s, v) => s + (v ?? 0), 0);

  async function finish() {
    if (!user) return;
    setBusy(true);
    setErr("");
    try {
      await saveUser(user.uid, {
        cardIds,
        spend,
        joined: profile?.joined ?? {},
        onboarded: true,
        consentVersion: CONSENT_VERSION,
      });
      navigate("/plan", true);
    } catch {
      setErr("Kaydedilemedi. Bağlantını kontrol edip tekrar dene.");
      setBusy(false);
    }
  }

  return (
    <div className="onboard">
      <header className="topbar topbar-plain">
        <span className="wordmark">
          Kart<em>Plan</em>
        </span>
        <button type="button" className="btn btn-ghost" onClick={() => signOut(fb().auth)}>
          Çıkış
        </button>
      </header>

      <ol className="stepper" aria-label="Kurulum adımları">
        <li className={step === 1 ? "now" : "done"}>
          <span>1</span> Kartların
        </li>
        <li className={step === 2 ? "now" : ""}>
          <span>2</span> Harcaman
        </li>
      </ol>

      {step === 1 ? (
        <section className="onboard-body">
          <h1>Hangi kartları kullanıyorsun?</h1>
          <p className="lead">
            Yalnızca kart türünü seç. Kart numarası, son kullanma tarihi ya da CVV asla istemeyiz.
          </p>
          <CardPicker catalog={catalog} selected={cardIds} onChange={setCardIds} />
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              <Link href="/aydinlatma" target="_blank">
                Aydınlatma metnini
              </Link>{" "}
              okudum; kartlarımın ve harcama profilimin plan hesaplamak için saklanmasına onay
              veriyorum.
            </span>
          </label>
          <div className="sticky-actions">
            <span className="muted">{cardIds.length} kart seçildi</span>
            <button
              type="button"
              className="btn btn-primary"
              disabled={cardIds.length === 0 || !consent}
              onClick={() => setStep(2)}
            >
              Devam
            </button>
          </div>
        </section>
      ) : (
        <section className="onboard-body">
          <h1>Ayda yaklaşık ne harcıyorsun?</h1>
          <p className="lead">
            Kabaca yeterli; istediğin zaman “Harcamam” sayfasından değiştirebilirsin.
          </p>
          <SpendForm value={spend} onChange={setSpend} />
          {err && <p className="form-error">{err}</p>}
          <div className="sticky-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
              Geri
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || total === 0}
              onClick={finish}
            >
              {busy ? "Kaydediliyor…" : `Planımı çıkar · ${formatKurus(total)}`}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
