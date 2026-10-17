import { withAdmin } from "@/lib/api";
import { getAdminCatalog } from "@/lib/admin-catalog";

/** Banka → program → kart ağacı; doğrulama tarihleri ve kullanım sayılarıyla. */
export function GET() {
  return withAdmin(async () => Response.json({ banks: await getAdminCatalog() }));
}
