import { type JSX, useEffect } from "react";
import { Layout } from "./components/Layout";
import { CONSENT_VERSION } from "./lib/data";
import { navigate, usePath } from "./lib/router";
import { useApp } from "./lib/store";
import { Admin } from "./pages/Admin";
import { Calculator } from "./pages/Calculator";
import { Campaigns } from "./pages/Campaigns";
import { Landing } from "./pages/Landing";
import { MyCards } from "./pages/MyCards";
import { Onboarding } from "./pages/Onboarding";
import { Plan } from "./pages/Plan";
import { Privacy } from "./pages/Privacy";
import { Profile } from "./pages/Profile";
import { SignIn } from "./pages/SignIn";
import { Spend } from "./pages/Spend";

const PAGES: Record<string, () => JSX.Element> = {
  "/plan": Plan,
  "/kampanyalar": Campaigns,
  "/hesapla": Calculator,
  "/kartlarim": MyCards,
  "/harcama": Spend,
  "/profil": Profile,
};

export function App() {
  const { authReady, user, profile, admin } = useApp();
  const { path } = usePath();

  const needsOnboarding =
    !!user &&
    profile !== undefined &&
    (!profile?.onboarded || (profile?.consentVersion ?? 0) < CONSENT_VERSION);

  useEffect(() => {
    if (!authReady) return;
    if (user && (path === "/" || path === "/giris")) navigate("/plan", true);
    if (!user && (PAGES[path] || path === "/admin" || path === "/baslangic"))
      navigate("/giris", true);
  }, [authReady, user, path]);

  if (path === "/aydinlatma") return <Privacy />;
  if (!authReady || (user && profile === undefined)) return <Splash />;
  if (!user) return path === "/giris" ? <SignIn /> : <Landing />;
  // Admin, katalog boşken de (kendi kurulumundan önce) yönetim sayfasına girebilir.
  if (path === "/admin" && admin) {
    return (
      <Layout>
        <Admin />
      </Layout>
    );
  }
  if (needsOnboarding) return <Onboarding />;
  const Page = PAGES[path] ?? Plan;
  return (
    <Layout>
      <Page />
    </Layout>
  );
}

function Splash() {
  return (
    <div className="splash" aria-busy="true">
      <span className="wordmark">
        Kart<em>Plan</em>
      </span>
    </div>
  );
}
