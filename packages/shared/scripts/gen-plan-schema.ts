/**
 * PlanRequest / PlanResponse JSON Schema'larını `schema/` altına yazar (ADR 0015). Çıktı
 * commit'lenir; `src/plan.test.ts` güncel olduğunu denetler. Sonra motor modelleri üretilir:
 *
 *   pnpm plan:gen   (kök)
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { planJsonSchemas } from "../src/plan";

const outDir = resolve(import.meta.dirname, "../schema");
for (const [name, schema] of Object.entries(planJsonSchemas())) {
  writeFileSync(resolve(outDir, name), JSON.stringify(schema, null, 2) + "\n");
}
