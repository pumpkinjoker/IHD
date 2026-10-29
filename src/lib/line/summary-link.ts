import { REPORT_BUCKET, monthlyReportSchema, monthlyReportTitle, reportRequester, reportWorkItem } from "@/lib/reports/monthly-report";
import { evidenceFileName } from "@/lib/images/evidence-file-name";
import { bangkokDate, type IntakeReply } from "./intake";
import type { IntakeEmployee } from "./employee-intake";
import type { SupabaseLineStore } from "./store";
import { randomBytes, createHash } from "node:crypto";

type Store = Pick<SupabaseLineStore, "employeeEntries" | "employeeDetails">;
export async function summaryLinkReply(store: Store, env: Record<string, string | undefined>, employee: IntakeEmployee, month: string, hasDraft: boolean, request: typeof fetch = fetch, now = new Date()): Promise<IntakeReply> {
  const buttons = [{ label: "ตารางสรุป", data: `summary:${month}:0` }, hasDraft ? { label: "กลับรายการที่ค้าง", data: "intake:resume" } : { label: "เพิ่มข้อมูล", data: "intake:start" }];
  try {
    const details = await store.employeeDetails(employee.employeeId);
    if (!details) return { text: "ไม่พบพนักงานที่ใช้งานอยู่ครับ", buttons };
    const entries = await store.employeeEntries(details.employee_id, month);
    if (!entries.length) return { text: `ยังไม่มีรายการที่ยืนยันบันทึกในเดือน ${month} ครับ`, buttons };
    const [year, number] = month.split("-").map(Number);
    const expiresAt = Math.min(now.getTime() + 24 * 3600_000, Date.UTC(year, number + 1, 1) - 7 * 3600_000);
    const expiresIn = Math.floor((expiresAt - now.getTime()) / 1000);
    if (expiresIn <= 0) return { text: "ข้อมูลเดือนนี้พ้นรอบเก็บแล้วครับ", buttons };
    const url = env.SUPABASE_URL?.replace(/\/$/, "");
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Preview configuration missing");
    const api = async (path: string, method = "GET", body?: unknown, extra: Record<string,string> = {}) => {
      const response = await request(`${url}/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra },
        body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("Preview request failed");
      return response;
    };
    const paths = entries.map((row) => row.data.imageId);
    const registry = await (await api(`rest/v1/line_evidence_files?${new URLSearchParams({ reference: `in.(${paths.join(",")})`, employee_id: `eq.${details.employee_id}`, purged_at: "is.null", select: "reference,object_path,mime_type" })}`)).json() as { reference: string; object_path: string; mime_type: string }[];
    const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");
    const signed = async (bucket: string, path: string) => {
      const result = await (await api(`storage/v1/object/sign/${bucket}/${encodePath(path)}`, "POST", { expiresIn })).json();
      if (!result.signedURL?.startsWith(`/object/sign/${bucket}/`)) throw new Error("Invalid signed asset");
      return `${url}/storage/v1${result.signedURL}`;
    };
    const workItems = await Promise.all(entries.map(async (row) => {
      const image = registry.find((record) => record.reference === row.data.imageId);
      if (!image) throw new Error("Source evidence missing");
      return { ...reportWorkItem(row), evidenceImage: { fileName: evidenceFileName(row.data.workDate, image.mime_type), mimeType: image.mime_type, dataUrl: await signed("ihd-evidence-test", image.object_path) } };
    }));
    const report = monthlyReportSchema.parse({ version: 1, preview: true, month, title: monthlyReportTitle(month), expiresAt: new Date(expiresAt).toISOString(), requester: reportRequester(details),
      draft: { teamKey: details.team, requesterKey: details.employee_id, documentDate: bangkokDate(now), workItems } });
    const objectPath = `previews/${month}/${details.employee_id}/summary.json`;
    // Register first so an interrupted upload is still covered by retention cleanup.
    await api("rest/v1/line_summary_previews", "POST", { employee_id: details.employee_id, period: `${month}-01`, object_path: objectPath }, { Prefer: "resolution=merge-duplicates" });
    await api(`storage/v1/object/${REPORT_BUCKET}/${objectPath}`, "POST", report, { "x-upsert": "true", "cache-control": "no-store" });
    const token = randomBytes(16).toString("base64url");
    await api("rest/v1/line_report_links", "POST", { token_hash: createHash("sha256").update(token).digest("hex"), employee_id: details.employee_id, period: `${month}-01`, object_path: objectPath, expires_at: new Date(expiresAt).toISOString() });
    const link = `https://ihd-gen.vercel.app/s#${token}`;
    return { text: `ลิงก์สรุปเดือน ${month}\n${details.name}\n${link}\n\nเปิดดูตารางและบันทึกเป็น PDF ได้ ลิงก์ใช้ได้ไม่เกิน 24 ชั่วโมงครับ`, buttons };
  } catch { return { text: "สร้างลิงก์สรุปไม่สำเร็จ กรุณาลองใหม่อีกครั้งครับ", buttons }; }
}
