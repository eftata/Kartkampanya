"use client";

import { useEffect } from "react";

/**
 * Servis çalışanını kaydeder (PWA; ADR 0031): ana ekrana ekleme, bağlantı yokken sayfa ve push.
 * Kayıt başarısız olursa uygulama etkilenmez.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => undefined);
  }, []);
  return null;
}
