import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { type FormEvent, useState } from "react";
import { fb } from "../firebase";
import { Link } from "../lib/router";

function authMessage(code: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "E-posta ya da şifre hatalı.";
    case "auth/email-already-in-use":
      return "Bu e-postayla zaten bir hesap var. Giriş yapmayı dene.";
    case "auth/weak-password":
      return "Şifre en az 6 karakter olmalı.";
    case "auth/invalid-email":
      return "Geçerli bir e-posta adresi gir.";
    case "auth/too-many-requests":
      return "Çok fazla deneme yapıldı. Biraz sonra tekrar dene.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "";
    default:
      return "Giriş yapılamadı. Tekrar dene.";
  }
}

export function SignIn() {
  const [mode, setMode] = useState<"giris" | "kayit">("giris");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      const text = authMessage((e as { code?: string }).code ?? "");
      if (text) setMsg({ kind: "err", text });
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const { auth } = fb();
    void run(() =>
      mode === "giris"
        ? signInWithEmailAndPassword(auth, email.trim(), password)
        : createUserWithEmailAndPassword(auth, email.trim(), password),
    );
  }

  return (
    <div className="center-page">
      <div className="panel narrow">
        <Link href="/" className="wordmark">
          Kart<em>Plan</em>
        </Link>
        <h1>{mode === "giris" ? "Tekrar hoş geldin" : "Hesap oluştur"}</h1>
        <p className="muted">Kartlarını ve planını her cihazdan görebilmen için.</p>

        <button
          type="button"
          className="btn btn-google"
          disabled={busy}
          onClick={() => run(() => signInWithPopup(fb().auth, new GoogleAuthProvider()))}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#FFC107"
              d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
            />
            <path
              fill="#FF3D00"
              d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
            />
          </svg>
          Google ile devam et
        </button>

        <div className="divider">
          <span>ya da e-postayla</span>
        </div>

        <form onSubmit={submit} className="form">
          <label className="field">
            <span>E-posta</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Şifre</span>
            <input
              className="input"
              type="password"
              autoComplete={mode === "giris" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {msg && <p className={msg.kind === "err" ? "form-error" : "form-ok"}>{msg.text}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Bekle…" : mode === "giris" ? "Giriş yap" : "Kayıt ol"}
          </button>
        </form>

        <div className="signin-links">
          <button
            type="button"
            className="btn-text"
            onClick={() => setMode(mode === "giris" ? "kayit" : "giris")}
          >
            {mode === "giris" ? "Hesabın yok mu? Kayıt ol" : "Zaten hesabın var mı? Giriş yap"}
          </button>
          {mode === "giris" && (
            <button
              type="button"
              className="btn-text"
              onClick={() => {
                if (!email.trim()) {
                  setMsg({ kind: "err", text: "Önce e-posta adresini yaz." });
                  return;
                }
                void run(async () => {
                  await sendPasswordResetEmail(fb().auth, email.trim());
                  setMsg({ kind: "ok", text: "Şifre sıfırlama bağlantısı e-postana gönderildi." });
                });
              }}
            >
              Şifremi unuttum
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
