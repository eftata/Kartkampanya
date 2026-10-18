// KartPlan servis çalışanı (ADR 0031): web push bildirimleri ve bağlantı yokken sayfa.
// Kişisel sayfalar ve API yanıtları önbelleğe alınmaz; yalnızca çevrimdışı sayfası ve simgeler.

const CACHE = "kartplan-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

// Yalnızca sayfa gezinmeleri: ağ yoksa çevrimdışı sayfası. Diğer istekler tarayıcıya kalır.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()),
    ),
  );
});

/** Yalnızca uygulama içi yol açılır ("/plan"); başka adres yok sayılır. */
function safePath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/plan";
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" ? data.title : "KartPlan";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      lang: "tr",
      ...(typeof data.tag === "string" ? { tag: data.tag } : {}),
      data: { url: safePath(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(
    safePath(event.notification.data && event.notification.data.url),
    self.location.origin,
  );
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === url.origin);
      if (!open) return self.clients.openWindow(url.href);
      // Kontrol edilmeyen pencerede navigate başarısız olur: yeni pencere aç.
      return open
        .navigate(url.href)
        .then((client) => (client ?? open).focus())
        .catch(() => self.clients.openWindow(url.href));
    }),
  );
});

// Tarayıcı aboneliği yenilerse sunucudaki kayıt güncellenir (oturum çerezi gider).
self.addEventListener("pushsubscriptionchange", (event) => {
  const update = async () => {
    if (event.oldSubscription) {
      await fetch("/api/me/push", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: event.oldSubscription.endpoint }),
      });
    }
    if (event.newSubscription) {
      await fetch("/api/me/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event.newSubscription.toJSON()),
      });
    }
  };
  event.waitUntil(update().catch(() => undefined));
});
