import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Henüz geliştirilmemiş sayfalar için geçici içerik. Sprint ilerledikçe kaldırılır. */
export function PagePlaceholder({
  title,
  description,
  sprint,
}: {
  title: string;
  description: string;
  sprint: number;
}) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Yakında</CardTitle>
          <CardDescription>
            {description} (Sprint {sprint})
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
