import { cn } from "@/lib/utils";

/** Basit ilerleme çubuğu (0–1); erişilebilir adıyla. */
export function ProgressBar({
  value,
  label,
  tone = "default",
}: {
  value: number;
  label: string;
  tone?: "default" | "done" | "over";
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="bg-muted h-2 w-full overflow-hidden rounded-full"
    >
      <div
        className={cn(
          "h-full rounded-full",
          tone === "done" && "bg-emerald-500",
          tone === "over" && "bg-red-500",
          tone === "default" && "bg-primary",
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
