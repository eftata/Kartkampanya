"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { subscribePushAction, testPushAction, unsubscribePushAction } from "@/lib/push-actions";

type Status = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

/** VAPID açık anahtarı (base64url) → `applicationServerKey`. */
function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration() {
  return (
    (await navigator.serviceWorker.getRegistration("/")) ??
    (await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }))
  );
}

function supported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function isIosBrowser() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !standalone;
}

/**
 * Bu cihazda anlık bildirim (ADR 0031). Açılınca tarayıcı izni istenir, abonelik sunucuya yazılır;
 * e-posta bildirimleriyle aynı tercihler geçerlidir.
 */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<{ ok?: string; error?: string }>({});
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const check = async (): Promise<Status> => {
      if (!supported()) return isIosBrowser() ? "ios-install" : "unsupported";
      if (Notification.permission === "denied") return "denied";
      const existing = await (await registration()).pushManager.getSubscription();
      return existing ? "on" : "off";
    };
    check()
      .catch((): Status => "unsupported")
      .then((next) => {
        if (!cancelled) setStatus(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!publicKey) return null;

  const run = (action: () => Promise<{ status?: Status; ok?: string; error?: string }>) => {
    setMessage({});
    startTransition(async () => {
      try {
        const result = await action();
        if (result.status) setStatus(result.status);
        setMessage({ ok: result.ok, error: result.error });
      } catch {
        setMessage({ error: "Tarayıcı bildirim aboneliğini tamamlayamadı. Yeniden dene." });
      }
    });
  };

  const enable = () =>
    run(async () => {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        return {
          status: permission === "denied" ? "denied" : "off",
          error: "Bildirim izni verilmedi.",
        };
      }
      const pushManager = (await registration()).pushManager;
      // Sunucu anahtarı değiştiyse eski abonelik geçersizdir.
      await (await pushManager.getSubscription())?.unsubscribe();
      const subscription = await pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      });
      const result = await subscribePushAction(subscription.toJSON());
      if (result.error) {
        await subscription.unsubscribe();
        return { error: result.error };
      }
      return { status: "on", ok: "Bu cihazda bildirimler açık." };
    });

  const disable = () =>
    run(async () => {
      const subscription = await (await registration()).pushManager.getSubscription();
      if (subscription) {
        await unsubscribePushAction({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      return { status: "off", ok: "Bu cihazda bildirimler kapatıldı." };
    });

  const test = () =>
    run(async () => {
      const result = await testPushAction();
      return result.error ? { error: result.error } : { ok: "Deneme bildirimi gönderildi." };
    });

  return (
    <section aria-label="Anlık bildirimler" className="space-y-2 border-t pt-4 text-sm">
      <h3 className="font-medium">Bu cihazda anlık bildirim</h3>
      {status === "loading" && <p className="text-muted-foreground">Denetleniyor…</p>}
      {status === "unsupported" && (
        <p className="text-muted-foreground">Bu tarayıcı anlık bildirimleri desteklemiyor.</p>
      )}
      {status === "ios-install" && (
        <p className="text-muted-foreground">
          iPhone ve iPad&apos;de önce Safari&apos;de Paylaş → <strong>Ana Ekrana Ekle</strong> ile
          KartPlan&apos;ı ekle, sonra uygulamayı ana ekrandan açıp buradan bildirimleri aç.
        </p>
      )}
      {status === "denied" && (
        <p className="text-muted-foreground">
          Bu site için bildirimler engelli. Tarayıcı ayarlarından izin verip sayfayı yenile.
        </p>
      )}
      {status === "off" && (
        <>
          <p className="text-muted-foreground">
            Yukarıdaki bildirimler e-postanın yanında bu cihaza da gelsin.
          </p>
          <Button type="button" size="sm" onClick={enable} disabled={pending}>
            Bu cihazda aç
          </Button>
        </>
      )}
      {status === "on" && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={test} disabled={pending}>
            Deneme bildirimi gönder
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={disable} disabled={pending}>
            Bu cihazda kapat
          </Button>
        </div>
      )}
      {message.ok && <p role="status">{message.ok}</p>}
      {message.error && (
        <p role="alert" className="text-destructive">
          {message.error}
        </p>
      )}
    </section>
  );
}
