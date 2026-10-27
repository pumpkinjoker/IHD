import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";

/** Exposes only the signed webhook, never the Next.js dev server or local files. */
export async function handleWebhookRelay(request, response, options) {
  const finish = (status, text) => {
    response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    response.end(text);
  };
  if (request.method !== "POST" || request.url !== "/api/line/webhook") return finish(404, "Not found");
  const signature = request.headers["x-line-signature"];
  if (typeof signature !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return finish(401, "Invalid signature");
  if (Number(request.headers["content-length"]) > 1024 * 1024) return finish(413, "Payload too large");
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > 1024 * 1024) return finish(413, "Payload too large");
      chunks.push(bytes);
    }
    const body = Buffer.concat(chunks);
    const received = Buffer.from(signature, "base64");
    const expected = createHmac("sha256", options.secret).update(body).digest();
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return finish(401, "Invalid signature");
    const upstream = await (options.fetch ?? fetch)("http://127.0.0.1:3000/api/line/webhook", {
      method: "POST", headers: { "Content-Type": "application/json", "x-line-signature": signature },
      body, signal: AbortSignal.timeout(120_000)
    });
    finish(upstream.status, upstream.ok ? "OK" : "Webhook processing failed");
  } catch { finish(503, "Webhook unavailable"); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) throw new Error("LINE_CHANNEL_SECRET is required");
  const server = createServer((request, response) => { void handleWebhookRelay(request, response, { secret }); });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.listen(8787, "127.0.0.1", () => console.log("LINE-only webhook relay listening on 127.0.0.1:8787"));
}
