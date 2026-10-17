import type { Metadata } from "next";

import {
  ACIK_RIZA_METNI,
  AYDINLATMA_METNI,
  LEGAL_DRAFT_NOTICE,
  LEGAL_VERSIONS,
  PAZARLAMA_METNI,
} from "@/lib/legal";

export const metadata: Metadata = { title: "KVKK Aydınlatma Metni" };

export default function DisclosurePage() {
  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">KVKK Aydınlatma Metni</h1>
        <p className="text-muted-foreground text-sm">Sürüm {LEGAL_VERSIONS.aydinlatma}</p>
        <p role="note" className="rounded-md bg-amber-500/10 px-3 py-2 text-sm">
          {LEGAL_DRAFT_NOTICE}
        </p>
      </div>
      {AYDINLATMA_METNI.map((section) => (
        <section key={section.title} className="space-y-2">
          <h2 className="font-medium">{section.title}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="text-sm leading-relaxed">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
      <section id="acik-riza" className="space-y-2">
        <h2 className="font-medium">Açık rıza metni</h2>
        <p className="text-sm leading-relaxed">{ACIK_RIZA_METNI}</p>
      </section>
      <section id="pazarlama" className="space-y-2">
        <h2 className="font-medium">Pazarlama iletisi izni</h2>
        <p className="text-sm leading-relaxed">{PAZARLAMA_METNI}</p>
      </section>
    </article>
  );
}
