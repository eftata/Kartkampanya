import { deleteUser, signOut } from "firebase/auth";
import { useState } from "react";
import { PageHead } from "../components/Layout";
import { fb } from "../firebase";
import { deleteUserData } from "../lib/data";
import { Link } from "../lib/router";
import { useSession } from "../lib/store";

export function Profile() {
  const { user, profile, myCards } = useSession();
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState("");

  function exportData() {
    const data = {
      email: user.email,
      cards: myCards.map((c) => ({ id: c.id, name: c.name, bank: c.bank })),
      spendKurus: profile.spend,
      joinedCampaigns: Object.keys(profile.joined),
      consentVersion: profile.consentVersion,
      exportedAt: new Date().toISOString(),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "kartplan-verilerim.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function removeAccount() {
    setMsg("");
    try {
      await deleteUserData(user.uid);
      await deleteUser(user);
    } catch (e) {
      if ((e as { code?: string }).code === "auth/requires-recent-login") {
        setMsg(
          "Verilerin silindi. Hesabı da silmek için çıkış yapıp tekrar giriş yap, sonra yeniden dene.",
        );
      } else {
        setMsg("Silinemedi, tekrar dene.");
      }
    }
  }

  return (
    <>
      <PageHead kicker="Profil" title={user.displayName || user.email || "Hesabın"}>
        {user.email}
      </PageHead>

      <section className="panel">
        <h2>Oturum</h2>
        <button type="button" className="btn btn-ghost" onClick={() => signOut(fb().auth)}>
          Çıkış yap
        </button>
      </section>

      <section className="panel">
        <h2>Verilerin ve gizlilik</h2>
        <p className="muted">
          Saklanan: seçtiğin kart türleri, aylık harcama profilin, katıldığını işaretlediğin
          kampanyalar. <Link href="/aydinlatma">Aydınlatma metni</Link>
        </p>
        <div className="row-actions">
          <button type="button" className="btn btn-ghost" onClick={exportData}>
            Verilerimi indir
          </button>
          {!confirm ? (
            <button type="button" className="btn btn-danger-ghost" onClick={() => setConfirm(true)}>
              Hesabımı sil
            </button>
          ) : (
            <span className="confirm">
              Kalıcı olarak silinsin mi?
              <button type="button" className="btn btn-danger" onClick={removeAccount}>
                Evet, sil
              </button>
              <button type="button" className="btn-text" onClick={() => setConfirm(false)}>
                Vazgeç
              </button>
            </span>
          )}
        </div>
        {msg && <p className="form-error">{msg}</p>}
      </section>
    </>
  );
}
