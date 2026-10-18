// e2e için sahte web push servisi: POST /push/<id> isteklerini bellekte tutar, GET /pushes ile döner.
// Kimliği "gone-" ile başlayan abonelik 410 alır (tarayıcı aboneliği bitmiş gibi).
import { createServer } from "node:http";

const port = Number(process.env.FAKE_PUSH_PORT ?? 8300);
const pushes = [];

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (request.method === "GET" && url.pathname === "/health") return response.end("ok");
  if (request.method === "GET" && url.pathname === "/pushes") {
    response.setHeader("content-type", "application/json");
    return response.end(JSON.stringify(pushes));
  }
  const match = /^\/push\/([\w-]+)$/.exec(url.pathname);
  if (request.method !== "POST" || !match) {
    response.statusCode = 404;
    return response.end();
  }
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    const id = match[1];
    pushes.push({
      id,
      headers: {
        ttl: request.headers.ttl,
        urgency: request.headers.urgency,
        encoding: request.headers["content-encoding"],
        authorization: request.headers.authorization,
      },
      body: Buffer.concat(chunks).toString("base64"),
    });
    response.statusCode = id.startsWith("gone-") ? 410 : 201;
    response.end();
  });
}).listen(port, "127.0.0.1");
