import { type FirebaseApp, type FirebaseOptions, initializeApp } from "firebase/app";
import { type Auth, connectAuthEmulator, getAuth } from "firebase/auth";
import { type Firestore, connectFirestoreEmulator, getFirestore } from "firebase/firestore";

export type FirebaseHandles = { app: FirebaseApp; auth: Auth; db: Firestore };

let handles: FirebaseHandles | null = null;

function envConfig(): FirebaseOptions | null {
  const env = import.meta.env;
  if (!env.VITE_FIREBASE_API_KEY || !env.VITE_FIREBASE_PROJECT_ID) return null;
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
}

/**
 * Yapılandırma önce .env'den, yoksa Firebase Hosting'in sağladığı /__/firebase/init.json'dan okunur
 * (deploy edilen sürüm ek ayar istemez).
 */
export async function initFirebase(): Promise<FirebaseHandles | null> {
  if (handles) return handles;
  let config = envConfig();
  if (!config) {
    try {
      const res = await fetch("/__/firebase/init.json");
      if (res.ok && res.headers.get("content-type")?.includes("json"))
        config = (await res.json()) as FirebaseOptions;
    } catch {
      config = null;
    }
  }
  if (!config) return null;
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (import.meta.env.VITE_USE_EMULATORS === "1") {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  auth.languageCode = "tr";
  handles = { app, auth, db };
  return handles;
}

export function fb(): FirebaseHandles {
  if (!handles) throw new Error("Firebase başlatılmadı");
  return handles;
}
