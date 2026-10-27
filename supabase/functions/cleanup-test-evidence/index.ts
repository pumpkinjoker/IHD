declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };

/** Keep the current Bangkok calendar month and the preceding month. */
export function evidenceRetentionCutoff(now = new Date()) {
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return new Date(Date.UTC(bangkok.getUTCFullYear(), bangkok.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
}

export async function cleanupTestEvidence(request: Request, env: { url: string; key: string }, transport: typeof fetch = fetch, now = new Date()) {
  const json = (value: unknown, status = 200) => Response.json(value, { status });
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  // The gateway verifies the signature. The privileged RPC below verifies it
  // again through the Data API and checks EXECUTE permission before any deletion.
  // Do not compare raw JWT strings: Supabase may issue several valid server JWTs.
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")));
    if (payload.role !== "service_role") return json({ error: "Unauthorized" }, 401);
  } catch { return json({ error: "Unauthorized" }, 401); }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const cutoff = evidenceRetentionCutoff(now);
  const api = async (path: string, method = "GET", body?: unknown) => {
    const response = await transport(`${env.url}/${path}`, { method, headers: { apikey: token, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error("Cleanup request failed");
    return response;
  };
  const lease = crypto.randomUUID();
  let locked = false;
  let removed = 0;
  let entriesRemoved = 0;
  let eventsRemoved = 0;
  let reportsRemoved = 0;
  try {
    const { dryRun = false } = await request.json().catch(() => ({}));
    locked = await (await api("rest/v1/rpc/line_claim_media", "POST", { p_lease: lease })).json();
    if (!locked) return json({ error: "Media busy; retry later" }, 409);
    const query = new URLSearchParams({ select: "reference,object_path", work_date: `lt.${cutoff}`, order: "work_date.asc,reference.asc", limit: "100" });
    const purge = async (references: string[]) => {
      const result = await (await api("rest/v1/rpc/line_purge_expired_data", "POST", { p_cutoff: cutoff, p_references: references, p_lease: lease })).json();
      entriesRemoved += result.entries;
      eventsRemoved += result.events;
    };
    // Finish within the existing 120 second media lease. Bounded work is retried
    // by the next scheduled invocation if a large backlog exists.
    const deadline = Date.now() + 65_000;
    while (Date.now() < deadline) {
      const rows = await (await api(`rest/v1/line_evidence_files?${query}`)).json() as { reference: string; object_path: string }[];
      if (dryRun) return json({ dryRun: true, cutoff, candidates: rows.length });
      if (!rows.length) { await purge([]); break; }
      // Never DELETE storage.objects using SQL: use the Storage API to remove bytes.
      await api("storage/v1/object/ihd-evidence-test", "DELETE", { prefixes: rows.map((row) => row.object_path) });
      await purge(rows.map((row) => row.reference));
      removed += rows.length;
      if (rows.length < 100) { await purge([]); break; }
    }
    // Monthly snapshots (including copied evidence) expire with their work month.
    while (Date.now() < deadline) {
      const reports = await (await api(`rest/v1/line_monthly_reports?${new URLSearchParams({ select: "id,object_paths", period: `lt.${cutoff}`, order: "period.asc,id.asc", limit: "10" })}`)).json() as { id: string; object_paths: string[] }[];
      if (!reports.length) break;
      const paths = reports.flatMap((report) => report.object_paths);
      if (paths.length) await api("storage/v1/object/ihd-monthly-reports", "DELETE", { prefixes: paths });
      await api(`rest/v1/line_monthly_reports?${new URLSearchParams({ id: `in.(${reports.map((report) => report.id).join(",")})`, period: `lt.${cutoff}` })}`, "DELETE");
      reportsRemoved += reports.length;
      if (reports.length < 10) break;
    }
    while (Date.now() < deadline) {
      const previews = await (await api(`rest/v1/line_summary_previews?${new URLSearchParams({ select: "employee_id,period,object_path", period: `lt.${cutoff}`, limit: "100" })}`)).json() as { employee_id: string; period: string; object_path: string }[];
      if (!previews.length) break;
      await api("storage/v1/object/ihd-monthly-reports", "DELETE", { prefixes: previews.map((preview) => preview.object_path) });
      await api(`rest/v1/line_summary_previews?${new URLSearchParams({ object_path: `in.(${previews.map((preview) => preview.object_path).join(",")})`, period: `lt.${cutoff}` })}`, "DELETE");
      if (previews.length < 100) break;
    }
    await api(`rest/v1/line_report_links?${new URLSearchParams({ or: `(expires_at.lt.${now.toISOString()},period.lt.${cutoff})` })}`, "DELETE");
    return json({ cutoff, removed, entriesRemoved, eventsRemoved, reportsRemoved });
  } catch { return json({ error: "Cleanup failed; safe to retry", removed }, 503); }
  finally { if (locked) await api("rest/v1/rpc/line_release_media", "POST", { p_lease: lease }).catch(() => undefined); }
}

if (typeof Deno !== "undefined") Deno.serve((request) => cleanupTestEvidence(request, {
  url: Deno.env.get("SUPABASE_URL") || "",
  key: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
}));
