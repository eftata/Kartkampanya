const ACTION_LABELS: Record<string, string> = {
  "bank.create": "Banka eklendi",
  "bank.update": "Banka güncellendi",
  "bank.delete": "Banka silindi",
  "program.create": "Program eklendi",
  "program.update": "Program güncellendi",
  "program.verify_point_value": "Puan değeri doğrulandı",
  "program.delete": "Program silindi",
  "card.create": "Kart eklendi",
  "card.update": "Kart güncellendi",
  "card.verify_rates": "Oranlar doğrulandı",
  "card.delete": "Kart silindi",
};

const dateFormat = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" });

type Entry = {
  id: string;
  action: string;
  actorEmail: string;
  entityType: string;
  data: unknown;
  createdAt: Date;
};

export function AuditList({
  entries,
  title = "Son işlemler",
}: {
  entries: Entry[];
  title?: string;
}) {
  return (
    <section className="space-y-3" aria-label={title}>
      <h2 className="font-medium">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">Henüz işlem yok.</p>
      ) : (
        <ul className="divide-y rounded-lg border text-sm">
          {entries.map((entry) => {
            const fields =
              entry.data && typeof entry.data === "object" ? Object.keys(entry.data) : [];
            return (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2"
              >
                <span>
                  <span className="font-medium">{ACTION_LABELS[entry.action] ?? entry.action}</span>
                  {fields.length > 0 && (
                    <span className="text-muted-foreground"> · {fields.join(", ")}</span>
                  )}
                </span>
                <span className="text-muted-foreground text-xs">
                  {entry.actorEmail} · {dateFormat.format(entry.createdAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
