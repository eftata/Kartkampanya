// Firestore erişimi tek dosyada. Koleksiyonlar:
//   cards/{id}       katalog (herkes okur, admin yazar)
//   campaigns/{id}   kampanyalar (yayındakini herkes, taslağı admin okur; admin yazar)
//   users/{uid}      kullanıcının kartları, harcama profili, katıldıkları (yalnızca kendisi)
//   admins/{uid}     admin işareti (yalnızca konsoldan eklenir)

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  deleteField,
} from "firebase/firestore";
import { fb } from "../firebase";
import { SEED_CARDS, demoCampaigns } from "./seed";
import type { Campaign, CatalogCard, UserDoc } from "./types";

export const CONSENT_VERSION = 1;

export const EMPTY_USER: UserDoc = {
  cardIds: [],
  spend: {},
  joined: {},
  onboarded: false,
  consentVersion: 0,
};

export function watchCards(cb: (cards: CatalogCard[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    collection(fb().db, "cards"),
    (snap) => {
      const cards = snap.docs.map((d) => ({ ...(d.data() as Omit<CatalogCard, "id">), id: d.id }));
      cards.sort(
        (a, b) =>
          a.programName.localeCompare(b.programName, "tr") || a.name.localeCompare(b.name, "tr"),
      );
      cb(cards);
    },
    onError,
  );
}

export function watchCampaigns(
  admin: boolean,
  cb: (c: Campaign[]) => void,
  onError: (e: Error) => void,
) {
  const col = collection(fb().db, "campaigns");
  const q = admin ? col : query(col, where("status", "==", "yayinda"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Omit<Campaign, "id">), id: d.id }))),
    onError,
  );
}

export function watchUser(
  uid: string,
  cb: (u: UserDoc | null) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    doc(fb().db, "users", uid),
    (snap) => cb(snap.exists() ? { ...EMPTY_USER, ...(snap.data() as Partial<UserDoc>) } : null),
    onError,
  );
}

export async function isAdmin(uid: string): Promise<boolean> {
  try {
    return (await getDoc(doc(fb().db, "admins", uid))).exists();
  } catch {
    return false;
  }
}

export async function saveUser(uid: string, patch: Partial<UserDoc>) {
  await setDoc(
    doc(fb().db, "users", uid),
    { ...patch, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function setJoined(uid: string, campaignId: string, joined: boolean) {
  await updateDoc(doc(fb().db, "users", uid), {
    [`joined.${campaignId}`]: joined ? true : deleteField(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteUserData(uid: string) {
  await deleteDoc(doc(fb().db, "users", uid));
}

// ---- admin ----

export async function saveCard(card: CatalogCard) {
  const { id, ...rest } = card;
  await setDoc(doc(fb().db, "cards", id), rest);
}

export async function removeCard(id: string) {
  await deleteDoc(doc(fb().db, "cards", id));
}

export async function saveCampaign(c: Omit<Campaign, "id"> & { id?: string }) {
  const { id, ...rest } = c;
  const data = { ...rest, updatedAt: serverTimestamp() };
  if (id) await setDoc(doc(fb().db, "campaigns", id), data);
  else await addDoc(collection(fb().db, "campaigns"), data);
}

export async function removeCampaign(id: string) {
  await deleteDoc(doc(fb().db, "campaigns", id));
}

/** Eksik katalog kartlarını ekler; mevcutları ezmez. Eklenen sayıyı döner. */
export async function seedCatalog(): Promise<number> {
  const existing = new Set((await getDocs(collection(fb().db, "cards"))).docs.map((d) => d.id));
  const batch = writeBatch(fb().db);
  let n = 0;
  for (const { id, ...rest } of SEED_CARDS) {
    if (existing.has(id)) continue;
    batch.set(doc(fb().db, "cards", id), rest);
    n++;
  }
  if (n) await batch.commit();
  return n;
}

export async function seedDemoCampaigns(today: string): Promise<number> {
  const batch = writeBatch(fb().db);
  const list = demoCampaigns(today);
  for (const c of list)
    batch.set(doc(collection(fb().db, "campaigns")), { ...c, updatedAt: serverTimestamp() });
  await batch.commit();
  return list.length;
}
