import { Link } from "../lib/router";

export function Landing() {
  return (
    <div className="landing">
      <header className="topbar topbar-plain">
        <span className="wordmark">
          Kart<em>Plan</em>
        </span>
        <Link href="/giris" className="btn btn-ghost">
          Giriş yap
        </Link>
      </header>

      <section className="hero">
        <p className="kicker">Kredi kartı kampanyaları, tek planda</p>
        <h1>
          Hangi harcamayı <em>hangi kartla</em> yapacağını bil.
        </h1>
        <p className="lead">
          Kartlarını ve aylık harcamanı gir; KartPlan bankaların kampanyalarını tarayıp bu ay en çok
          kazandıracak dağılımı çıkarsın. Kart numarası yok, banka şifresi yok.
        </p>
        <div className="hero-cta">
          <Link href="/giris" className="btn btn-primary btn-lg">
            Ücretsiz başla
          </Link>
          <span className="muted small">3 dakikada kurulum</span>
        </div>

        <div className="hero-demo" aria-hidden="true">
          <span className="hero-demo-label">Örnek plan</span>
          <div className="demo-row">
            <span>🛒 Market</span>
            <span className="demo-card prog-bonus">Bonus</span>
            <strong className="num">+150 ₺</strong>
          </div>
          <div className="demo-row">
            <span>⛽ Akaryakıt</span>
            <span className="demo-card prog-maximum">Maximum</span>
            <strong className="num">+100 ₺</strong>
          </div>
          <div className="demo-row">
            <span>📦 E-ticaret</span>
            <span className="demo-card prog-world">World</span>
            <strong className="num">+75 ₺</strong>
          </div>
          <div className="demo-total">
            <span>Bu ay beklenen</span>
            <strong className="num">325 ₺</strong>
          </div>
        </div>
      </section>

      <section className="steps">
        <div>
          <span className="step-no">01</span>
          <h3>Kartlarını seç</h3>
          <p>Banka ve programdan kartlarını işaretle. Hiçbir kart bilgisi istemeyiz.</p>
        </div>
        <div>
          <span className="step-no">02</span>
          <h3>Harcamanı anlat</h3>
          <p>Market, akaryakıt, e-ticaret… Aylık yaklaşık tutarları kaydırıcıyla gir.</p>
        </div>
        <div>
          <span className="step-no">03</span>
          <h3>Planını al</h3>
          <p>Kategori başına kart, tutar ve kampanya. Katılman gerekenleri de hatırlatırız.</p>
        </div>
      </section>

      <footer className="footer">
        <span>KartPlan · bağımsız bir araçtır, hiçbir bankayla bağlantılı değildir.</span>
        <Link href="/aydinlatma">Aydınlatma metni</Link>
      </footer>
    </div>
  );
}
