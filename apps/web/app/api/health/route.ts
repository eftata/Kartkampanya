import { connection } from "next/server";

export async function GET() {
  // Her gerçek istekte çalışsın; build sırasında statik olarak üretilmesin.
  await connection();
  return Response.json({ status: "ok" });
}
