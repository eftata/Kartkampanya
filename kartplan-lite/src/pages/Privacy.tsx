import { Link } from "../lib/router";

export function Privacy() {
  return (
    <div className="center-page">
      <article className="panel prose">
        <Link href="/" className="wordmark">
          Kart<em>Plan</em>
        </Link>
        <h1>Aydınlatma metni</h1>
        <p className="muted small">Sürüm 1 · Taslak, hukuki inceleme bekliyor.</p>
        <h2>Hangi verileri işliyoruz?</h2>
        <ul>
          <li>Giriş için e-posta adresin (Firebase Authentication).</li>
          <li>
            Seçtiğin kart türleri (ör. “Bonus Gold”). Kart numarası, son kullanma tarihi ve CVV asla
            alınmaz.
          </li>
          <li>Kategori başına yaklaşık aylık harcama tutarların.</li>
          <li>Katıldığını işaretlediğin kampanyalar.</li>
        </ul>
        <h2>Ne için?</h2>
        <p>
          Yalnızca sana aylık kart kullanım planı ve kampanya önerisi hesaplamak için. Veriler
          reklam ya da üçüncü taraf analitiği için kullanılmaz.
        </p>
        <h2>Nerede saklanıyor?</h2>
        <p>
          Google Firebase (Cloud Firestore) üzerinde. Sunucular yurt dışında olabilir; uygulamayı
          kullanarak bu aktarıma açık rıza vermiş olursun.
        </p>
        <h2>Hakların</h2>
        <p>Profil sayfasından verilerini indirebilir ve hesabını tamamen silebilirsin.</p>
      </article>
    </div>
  );
}
