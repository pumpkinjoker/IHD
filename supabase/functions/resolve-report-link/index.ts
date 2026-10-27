declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };

// A random 128-bit bearer token authorizes only its registered report.
export async function resolveReportLink(request: Request, env: { url: string; key: string }, transport: typeof fetch = fetch, now = new Date()) {
  const origin = request.headers.get("origin");
  const allowed = ["https://ihd-gen.vercel.app", "http://127.0.0.1:3000", "http://localhost:3000"];
  const headers = { "Cache-Control": "no-store", "Vary": "Origin", ...(origin && allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}) };
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (origin && !allowed.includes(origin)) return json({ error: "Forbidden" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type" } });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const missing = () => json({ error: "Link unavailable" }, 404);
  try {
    const reader = request.body?.getReader();
    if (!reader) return missing();
    let text = "", size = 0;
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 512) { await reader.cancel(); return missing(); }
      text += decoder.decode(value, { stream: true });
    }
    const { token } = JSON.parse(text + decoder.decode());
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(token)) return missing();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const api = (path: string, body?: unknown) => transport(`${env.url}/${path}`, { method: body === undefined ? "GET" : "POST", headers: { apikey: env.key, Authorization: `Bearer ${env.key}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
    const lookup = await api(`rest/v1/line_report_links?${new URLSearchParams({ token_hash: `eq.${hash}`, expires_at: `gt.${now.toISOString()}`, select: "object_path,expires_at", limit: "1" })}`);
    if (!lookup.ok) throw new Error("Lookup failed");
    const [row] = await lookup.json() as { object_path: string; expires_at: string }[];
    if (!row) return missing();
    const expiresIn = Math.min(60, Math.floor((new Date(row.expires_at).getTime() - now.getTime()) / 1000));
    if (expiresIn < 1) return missing();
    const path = row.object_path.split("/").map(encodeURIComponent).join("/");
    const result = await api(`storage/v1/object/sign/ihd-monthly-reports/${path}`, { expiresIn });
    if (!result.ok) return missing();
    const { signedURL } = await result.json();
    if (typeof signedURL !== "string" || !signedURL.startsWith("/object/sign/ihd-monthly-reports/")) throw new Error("Invalid asset");
    return json({ url: `${env.url}/storage/v1${signedURL}` });
  } catch { return missing(); }
}

if (typeof Deno !== "undefined") Deno.serve((request) => resolveReportLink(request, { url: Deno.env.get("SUPABASE_URL") || "", key: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "" }));
