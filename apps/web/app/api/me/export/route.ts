import { exportUserData } from "@/lib/account";
import { withUser } from "@/lib/api";

/** KVKK veri kopyası (JSON indirme). Onay şartı yok: ilgili kişi hakkıdır. */
export function GET() {
  return withUser(
    async (user) => {
      const data = await exportUserData(user.id);
      const day = data.exportedAt.slice(0, 10);
      return new Response(JSON.stringify(data, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="kartplan-verilerim-${day}.json"`,
          "cache-control": "no-store",
        },
      });
    },
    { consent: false },
  );
}
