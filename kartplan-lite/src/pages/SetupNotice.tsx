export function SetupNotice() {
  return (
    <div className="center-page">
      <div className="panel narrow">
        <span className="wordmark">
          Kart<em>Plan</em>
        </span>
        <h1>Firebase bağlantısı yok</h1>
        <p>
          Uygulama Firebase yapılandırmasını bulamadı. Yerelde çalıştırıyorsan{" "}
          <code>.env.example</code> dosyasını <code>.env</code> olarak kopyalayıp Firebase web
          uygulaması bilgilerini gir, ya da <code>VITE_USE_EMULATORS=1</code> ile emülatörleri
          kullan.
        </p>
        <p className="muted">
          Firebase Hosting'e deploy edilen sürüm yapılandırmayı kendiliğinden alır.
        </p>
      </div>
    </div>
  );
}
