declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };
const REPORT_BUCKET = "ihd-monthly-reports";
type Employee = { employee_id: string; name: string; email: string; team: string; position: string };
type Entry = { id: string; data: { workDate: string; subject: string; location: string; imageId: string; expense?: Record<string, unknown> } };
type Job = { id: string; period: string; employee_id: string; line_user_id: string; snapshot: { employee: Employee; entries: Entry[] }; report_url: string | null; push_text: string | null; retry_key: string; expires_at: string };
type Image = { fileName: string; mimeType: string; dataUrl: string };

export function monthlyPeriod(now = new Date()) {
  const thai = new Date(now.getTime() + 7 * 3600_000);
  return { period: new Date(Date.UTC(thai.getUTCFullYear(), thai.getUTCMonth() - 1, 1)).toISOString().slice(0, 10), day: thai.getUTCDate(), hour: thai.getUTCHours() };
}
export function buildMonthlyReport(job: Job, images: Image[]) {
  const employee = job.snapshot.employee;
  if (employee.employee_id !== job.employee_id || images.length !== job.snapshot.entries.length || !images.length) throw new Error("Report ownership mismatch");
  const [firstName, ...rest] = employee.name.trim().split(/\s+/);
  const month = job.period.slice(0, 7);
  const title = `สรุปยอดเบิกเบี้ยเลี้ยงเดือน${new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${month}-01T00:00:00+07:00`))}`;
  const nextMonth = new Date(`${job.period}T00:00:00Z`); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const workItems = job.snapshot.entries.map((row, index) => ({
    startTime: "08:00", endTime: "17:00", travelFrom: "", travelTo: "", totalKilometers: null, fare: null, accommodation: null,
    perDiem: 300, entertainment: null, otherExpense: null, ...row.data.expense,
    id: row.id, workDate: row.data.workDate, subject: row.data.subject, location: row.data.location, evidenceImage: images[index], evidenceExpired: false
  }));
  if (workItems.some((item) => !item.workDate.startsWith(month + "-")) || new Set(workItems.map((item) => item.workDate)).size !== workItems.length) throw new Error("Report period mismatch");
  return { version: 1, month, title, expiresAt: new Date(job.expires_at).toISOString(),
    requester: { employeeId: employee.employee_id, firstName, lastName: rest.join(" "), name: employee.name, email: employee.email, position: employee.position, department: employee.team },
    draft: { teamKey: employee.team, requesterKey: employee.employee_id, documentDate: nextMonth.toISOString().slice(0, 10), workItems } };
}

export async function runMonthlyReports(request: Request, env: { url: string }, transport: typeof fetch = fetch, now = new Date()) {
  const json = (data: unknown, status = 200) => Response.json(data, { status });
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  try { if (JSON.parse(atob(token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/"))).role !== "service_role") return json({ error: "Unauthorized" }, 401); }
  catch { return json({ error: "Unauthorized" }, 401); }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const api = async (path: string, method = "GET", body?: unknown, extra: Record<string, string> = {}) => {
    const response = await transport(`${env.url}/${path}`, { method, headers: { apikey: token, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra },
      body: body === undefined ? undefined : body instanceof Uint8Array ? new Blob([new Uint8Array(body)]) : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Report API request failed (${response.status})`);
    return response;
  };
  const rpc = async (name: string, body: unknown) => {
    const response = await api(`rest/v1/rpc/${name}`, "POST", body);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
  const objectPath = (path: string) => path.split("/").map(encodeURIComponent).join("/");
  const signed = async (path: string, expiresAt: string) => {
    const expiresIn = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
    if (expiresIn <= 0) throw new Error("Report expired");
    const result = await (await api(`storage/v1/object/sign/${REPORT_BUCKET}/${objectPath(path)}`, "POST", { expiresIn })).json();
    const relative = result.signedURL as string;
    if (!relative?.startsWith(`/object/sign/${REPORT_BUCKET}/`)) throw new Error("Invalid report asset URL");
    return `${env.url}/storage/v1${relative}`;
  };
  let sent = 0;
  let failed = 0;
  try {
    const { dryRun = false } = await request.json().catch(() => ({}));
    // This privileged RPC validates the JWT through the Data API before any work.
    const config = await rpc("line_monthly_config", {});
    const { period, day, hour } = monthlyPeriod(now);
    if (dryRun) return json({ dryRun: true, period, scheduledDay: 1, scheduledHourBangkok: 8, lineConfigured: Boolean(config.lineToken), emailConfigured: false, delivery: "private_web_link" });
    if (day !== 1 || hour < 8) return json({ skipped: "outside_monthly_window", period });
    if (!config.lineToken || config.appOrigin !== "https://ihd-gen.vercel.app") return json({ error: "Monthly delivery is not configured" }, 503);
    await rpc("line_prepare_monthly_reports", { p_period: period });
    const deadline = Date.now() + 65_000;
    while (Date.now() < deadline) {
      const lease = crypto.randomUUID();
      const job = await rpc("line_claim_monthly_report", { p_period: period, p_lease: lease }) as Job | null;
      if (!job) break;
      const update = async (body: Record<string, unknown>) => {
        const rows = await (await api(`rest/v1/line_monthly_reports?${new URLSearchParams({ id: `eq.${job.id}`, lease_token: `eq.${lease}`, select: "id" })}`, "PATCH", body, { Prefer: "return=representation" })).json();
        if (rows.length !== 1) throw new Error("Report lease lost");
      };
      let mediaLocked = false;
      try {
        if (!job.report_url) {
          mediaLocked = await rpc("line_claim_media", { p_lease: lease });
          if (!mediaLocked) throw new Error("Media busy");
          const sourceImages: { row: Entry; source: string; mimeType: string; destination: string }[] = [];
          for (const row of job.snapshot.entries) {
            const registry = await (await api(`rest/v1/line_evidence_files?${new URLSearchParams({ reference: `eq.${row.data.imageId}`, employee_id: `eq.${job.employee_id}`, purged_at: "is.null", select: "object_path,mime_type", limit: "1" })}`)).json();
            if (!registry[0] || !["image/jpeg", "image/png", "image/webp"].includes(registry[0].mime_type)) throw new Error("Source image missing");
            const extension = registry[0].mime_type === "image/jpeg" ? "jpg" : registry[0].mime_type.split("/")[1];
            sourceImages.push({ row, source: registry[0].object_path, mimeType: registry[0].mime_type, destination: `${period.slice(0, 7)}/${job.employee_id}/${job.id}/${row.data.workDate.replaceAll("-", "")}.${extension}` });
          }
          const reportPath = `${period.slice(0, 7)}/${job.employee_id}/${job.id}/summary.json`;
          await update({ object_paths: [...sourceImages.map((image) => image.destination), reportPath] });
          const images: Image[] = [];
          // Keep memory bounded to one photo. Copies preserve the monthly snapshot.
          for (const image of sourceImages) {
            const source = await api(`storage/v1/object/ihd-evidence-test/${objectPath(image.source)}`);
            const bytes = new Uint8Array(await source.arrayBuffer());
            if (bytes.length > 8 * 1024 * 1024) throw new Error("Evidence too large");
            await api(`storage/v1/object/${REPORT_BUCKET}/${objectPath(image.destination)}`, "POST", bytes, { "Content-Type": image.mimeType, "x-upsert": "true", "cache-control": "no-store" });
            images.push({ fileName: image.destination.split("/").at(-1)!, mimeType: image.mimeType, dataUrl: await signed(image.destination, job.expires_at) });
          }
          const report = buildMonthlyReport(job, images);
          const content = new TextEncoder().encode(JSON.stringify(report));
          await api(`storage/v1/object/${REPORT_BUCKET}/${objectPath(reportPath)}`, "POST", content, { "Content-Type": "application/json", "x-upsert": "true", "cache-control": "no-store" });
          const shortToken = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
          const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(shortToken))), (byte) => byte.toString(16).padStart(2, "0")).join("");
          await api("rest/v1/line_report_links", "POST", { token_hash: hash, employee_id: job.employee_id, period: job.period, object_path: reportPath, expires_at: job.expires_at });
          const reportUrl = `${config.appOrigin}/s#${shortToken}`;
          const perDiem = report.draft.workItems.reduce((sum, item) => sum + Number(item.perDiem || 0), 0);
          const message = `${report.title}\n${report.requester.name}\n${report.draft.workItems.length} วัน · เบี้ยเลี้ยงรวม ${perDiem.toLocaleString("th-TH")} บาท\n\nเปิดสรุปและบันทึก PDF ตามแบบฟอร์มเดิม:\n${reportUrl}\n\nลิงก์ส่วนตัวนี้ใช้ได้ถึงก่อนรอบล้างข้อมูลเดือนที่ 3`;
          if (message.length > 5000) throw new Error("Report link too long");
          await update({ report_url: reportUrl, push_text: message });
          job.report_url = reportUrl; job.push_text = message;
        }
        if (mediaLocked) { await rpc("line_release_media", { p_lease: lease }); mediaLocked = false; }
        if (!await rpc("line_monthly_mark_attempt", { p_id: job.id, p_lease: lease })) { failed++; continue; }
        const pushed = await transport("https://api.line.me/v2/bot/message/push", { method: "POST", headers: { Authorization: `Bearer ${config.lineToken}`, "Content-Type": "application/json", "X-Line-Retry-Key": job.retry_key },
          body: JSON.stringify({ to: job.line_user_id, messages: [{ type: "text", text: job.push_text }] }), signal: AbortSignal.timeout(15_000) });
        if (pushed.ok || (pushed.status === 409 && pushed.headers.has("x-line-accepted-request-id"))) {
          await update({ status: "sent", sent_at: new Date().toISOString(), lease_token: null, lease_until: null, last_error: null }); sent++;
        } else if (pushed.status >= 400 && pushed.status < 500 && pushed.status !== 429) {
          await update({ status: "blocked", last_error: `line_rejected_${pushed.status}`, lease_token: null, lease_until: null }); failed++;
        } else throw new Error("LINE temporarily unavailable");
      } catch {
        failed++;
        await update({ last_error: "delivery_failed", lease_token: null, lease_until: new Date(Date.now() + 5 * 60_000).toISOString() }).catch(() => undefined);
      } finally { if (mediaLocked) await rpc("line_release_media", { p_lease: lease }).catch(() => undefined); }
    }
    return json({ period, sent, failed, emailConfigured: false });
  } catch { return json({ error: "Monthly summary failed", sent, failed }, 503); }
}

if (typeof Deno !== "undefined") Deno.serve((request) => runMonthlyReports(request, { url: Deno.env.get("SUPABASE_URL") || "" }));
