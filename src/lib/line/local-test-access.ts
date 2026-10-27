import { lineStorageModes } from "./storage-config";
export function allowsLocalTest(request: Request) {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL || !["local", "supabase"].includes(lineStorageModes().media)) return false;
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return request.method === "GET";
  try { return new URL(origin).host === host && new URL(origin).protocol === "http:"; }
  catch { return false; }
}

/** Member form uses the agreed employee-ID selection; admin/test APIs stay local. */
export function allowsExpenseRecords(request: Request) {
  if (allowsLocalTest(request)) return true;
  const modes = lineStorageModes();
  if (modes.database !== "supabase" || modes.media !== "supabase" || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const origin = request.headers.get("origin");
  if (!origin) return request.method === "GET";
  try { return new URL(origin).host === host && new URL(origin).protocol === "https:"; }
  catch { return false; }
}
