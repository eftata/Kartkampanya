// e2e için sahte PostHog toplayıcısı: gelen olayları bellekte tutar, GET /events ile döner.
// Tarayıcı (posthog-js: JSON, base64 form ya da gzip) ve sunucu (`/capture/`) gönderimlerini çözer.
import { createServer } from "node:http";
import { gunzipSync } from "node:zlib";

const port = Number(process.env.FAKE_POSTHOG_PORT ?? 8200);
const events = [];

function decode(raw, contentType, url) {
  let body = raw;
  if (url.searchParams.get("compression") === "gzip-js" || raw[0] === 0x1f) {
    body = gunzipSync(raw);
  }
  let text = body.toString("utf8");
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const data = new URLSearchParams(text).get("data") ?? "";
    text = Buffer.from(data, "base64").toString("utf8");
  }
  const parsed = JSON.parse(text);
  const list = Array.isArray(parsed) ? parsed : (parsed.batch ?? [parsed]);
  return list.map((event) => ({ ...event, raw: text }));
}

createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);
  if (request.method === "OPTIONS") return response.end();
  if (request.method === "GET" && url.pathname === "/events") {
    response.setHeader("content-type", "application/json");
    return response.end(JSON.stringify(events));
  }
  if (request.method === "GET" && url.pathname === "/health") return response.end("ok");
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    try {
      const raw = Buffer.concat(chunks);
      if (raw.length) events.push(...decode(raw, request.headers["content-type"] ?? "", url));
    } catch (error) {
      events.push({ event: "__decode_error", error: String(error) });
    }
    response.setHeader("content-type", "application/json");
    response.end('{"status":1}');
  });
}).listen(port, "127.0.0.1");
