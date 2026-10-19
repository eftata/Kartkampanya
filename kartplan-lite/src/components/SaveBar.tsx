import { useState } from "react";

export function SaveBar({
  dirty,
  busy,
  saved,
  error,
  onSave,
  onReset,
}: {
  dirty: boolean;
  busy: boolean;
  saved: boolean;
  error: string;
  onSave: () => void;
  onReset: () => void;
}) {
  if (!dirty && !saved && !error) return null;
  return (
    <div className="savebar" role="status">
      <span>{error || (dirty ? "Kaydedilmemiş değişiklik var" : "Kaydedildi ✓")}</span>
      {dirty && (
        <span className="savebar-actions">
          <button type="button" className="btn btn-ghost" onClick={onReset} disabled={busy}>
            Vazgeç
          </button>
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={busy}>
            {busy ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </span>
      )}
    </div>
  );
}

/** Kaydet/Vazgeç akışı için küçük yardımcı. */
export function useSave(save: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  return {
    busy,
    saved,
    error,
    async run() {
      setBusy(true);
      setError("");
      try {
        await save();
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch {
        setError("Kaydedilemedi, tekrar dene.");
      } finally {
        setBusy(false);
      }
    },
  };
}
