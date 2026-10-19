import { type User, onAuthStateChanged } from "firebase/auth";
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { fb } from "../firebase";
import { isAdmin, watchCampaigns, watchCards, watchUser } from "./data";
import { turkeyToday } from "./dates";
import type { Campaign, CatalogCard, UserDoc } from "./types";

type AppState = {
  authReady: boolean;
  user: User | null;
  /** undefined = yükleniyor, null = kayıt yok (yeni kullanıcı). */
  profile: UserDoc | null | undefined;
  admin: boolean;
  catalog: CatalogCard[];
  campaigns: Campaign[];
  myCards: CatalogCard[];
  today: string;
  error: string | null;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null | undefined>(undefined);
  const [admin, setAdmin] = useState(false);
  const [catalog, setCatalog] = useState<CatalogCard[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const today = turkeyToday();

  useEffect(
    () =>
      onAuthStateChanged(fb().auth, async (u) => {
        setUser(u);
        setProfile(undefined);
        setAdmin(u ? await isAdmin(u.uid) : false);
        setAuthReady(true);
      }),
    [],
  );

  const onError = (e: Error) => setError(e.message);

  useEffect(() => watchCards(setCatalog, onError), []);
  useEffect(() => watchCampaigns(admin, setCampaigns, onError), [admin]);
  useEffect(() => (user ? watchUser(user.uid, setProfile, onError) : undefined), [user]);

  const value = useMemo<AppState>(() => {
    const ids = new Set(profile?.cardIds ?? []);
    return {
      authReady,
      user,
      profile,
      admin,
      catalog,
      campaigns,
      myCards: catalog.filter((c) => ids.has(c.id)),
      today,
      error,
    };
  }, [authReady, user, profile, admin, catalog, campaigns, today, error]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("AppProvider eksik");
  return v;
}

/** Oturum açık sayfalar için: kullanıcı ve profil kesin var. */
export function useSession() {
  const s = useApp();
  if (!s.user || !s.profile) throw new Error("Oturum yok");
  return { ...s, user: s.user, profile: s.profile };
}
