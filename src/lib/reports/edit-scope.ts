import { createHash } from "node:crypto";

/** A report bearer token grants edits only within its registered employee/month. */
export async function resolveReportEditScope(token: string, env: NodeJS.ProcessEnv = process.env, request: typeof fetch = fetch, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) return null;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Report configuration missing");
  const hash = createHash("sha256").update(token).digest("hex");
  const query = new URLSearchParams({ token_hash: `eq.${hash}`, expires_at: `gt.${now.toISOString()}`, select: "employee_id,period,expires_at", limit: "1" });
  const response = await request(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/line_report_links?${query}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }, cache: "no-store", signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error("Report lookup failed");
  const [row] = await response.json() as { employee_id: string; period: string; expires_at: string }[];
  if (!row || !/^\d{8}$/.test(row.employee_id) || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(row.period) || !(new Date(row.expires_at).getTime() > now.getTime())) return null;
  return { employeeId: row.employee_id, month: row.period.slice(0, 7) };
}
