import { isAvailableExpenseMonth } from "@/lib/dates/expense-period";
import { reportWorkItem } from "@/lib/reports/monthly-report";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { configuredLineStore, configuredEvidenceArchive } from "@/lib/line/config";
import { SupabaseLineStore } from "@/lib/line/store";
import { allowsExpenseRecords } from "@/lib/line/local-test-access";
import { validMonth } from "@/lib/line/records";
import { EvidenceExpiredError, SupabaseEvidenceArchive } from "@/lib/line/supabase-archive";
import { evidenceFileName } from "@/lib/images/evidence-file-name";
import { expenseWorkItemSchema } from "@/schemas/expense-request-form.schema";
import type { EvidenceImage } from "@/types/expense-request";
import { bangkokDate } from "@/lib/line/intake";
import { resolveReportEditScope } from "@/lib/reports/edit-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const scopeSchema = z.object({ employeeId: z.string().regex(/^\d{8}$/).optional(), month: z.string().refine(validMonth).optional(), reportToken: z.string().regex(/^[A-Za-z0-9_-]{22}$/).optional() });
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
class ScopeError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
async function requestedScope(input: z.infer<typeof scopeSchema>) {
  const linked = input.reportToken ? await resolveReportEditScope(input.reportToken) : null;
  if (input.reportToken && !linked) throw new ScopeError("ลิงก์หมดอายุหรือข้อมูลถูกล้างแล้ว กรุณาขอลิงก์ใหม่", 403);
  const month = linked?.month ?? input.month ?? bangkokDate(new Date()).slice(0, 7);
  if (!linked && !isAvailableExpenseMonth(month)) throw new ScopeError("เปิดได้เฉพาะเดือนปัจจุบันและเดือนก่อนหน้า");
  const employeeId = linked?.employeeId ?? input.employeeId;
  if (!employeeId) throw new ScopeError("กรุณาเลือกพนักงาน");
  if ((input.employeeId && input.employeeId !== employeeId) || (input.month && input.month !== month)) throw new ScopeError("รายการต้องเป็นของพนักงานและเดือนเดียวกับเอกสาร");
  return { employeeId, month };
}

export async function GET(request: Request) {
  if (!allowsExpenseRecords(request)) return json({ error: "เว็บยังไม่พร้อมเชื่อมฐานข้อมูล กรุณาติดต่อผู้ดูแล" }, 503);
  const scope = scopeSchema.safeParse({ ...Object.fromEntries(new URL(request.url).searchParams), ...(request.headers.get("x-report-token") ? { reportToken: request.headers.get("x-report-token") } : {}) });
  if (!scope.success) return json({ error: "กรุณาเลือกพนักงาน" }, 400);
  try {
    const { employeeId, month } = await requestedScope(scope.data);
    const store = configuredLineStore();
    if (!(store instanceof SupabaseLineStore)) return json({ error: "ยังไม่ได้เชื่อม Supabase" }, 503);
    const employee = await store.findEmployee(employeeId);
    if (!employee?.active) return json({ error: "ไม่พบพนักงาน" }, 404);
    const rows = await store.employeeEntries(employee.employeeId, month);
    const archive = configuredEvidenceArchive();
    const items = [];
    for (const row of rows) {
      let evidenceImage: EvidenceImage | null = null;
      let evidenceExpired = false;
      try {
        if (row.data.imageId) {
          const media = await archive.readEvidence(row.data.imageId);
          evidenceImage = {
            fileName: evidenceFileName(row.data.workDate, media.mimeType),
            mimeType: media.mimeType as EvidenceImage["mimeType"],
            dataUrl: `data:${media.mimeType};base64,${media.bytes.toString("base64")}`
          };
        }
      } catch (error) {
        if (!(error instanceof EvidenceExpiredError)) throw error;
        evidenceExpired = true;
      }
      items.push({ ...reportWorkItem(row), id: row.id,
        workDate: row.data.workDate, subject: row.data.subject, location: row.data.location, evidenceImage, evidenceExpired, isNew: false });
    }
    return json({ items, month, employeeId });
  } catch (error) { return error instanceof ScopeError ? json({ error: error.message }, error.status) : json({ error: "โหลดรายการหรือรูปไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503); }
}

export async function POST(request: Request) {
  if (!allowsExpenseRecords(request)) return json({ error: "เว็บยังไม่พร้อมเชื่อมฐานข้อมูล กรุณาติดต่อผู้ดูแล" }, 503);
  const store = configuredLineStore();
  if (!(store instanceof SupabaseLineStore)) return json({ error: "ยังไม่ได้เชื่อม Supabase" }, 503);
  let lease: string | undefined;
  try {
    // Each request contains one image, at most 8 MB before base64 encoding.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "ไม่มีข้อมูล" }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > 12 * 1024 * 1024) return json({ error: "ไฟล์ใหญ่เกินกำหนด" }, 413);
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel(); }
    const parsed = scopeSchema.extend({ item: expenseWorkItemSchema, operation: z.enum(["create", "update"]).default("update") }).safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) return json({ error: "กรุณาตรวจสอบข้อมูลและรูปหลักฐาน" }, 400);
    const { item } = parsed.data;
    const { employeeId, month } = await requestedScope(parsed.data);
    if (!item.workDate.startsWith(`${month}-`) || new Date(`${item.workDate}T00:00:00Z`).toISOString().slice(0, 10) !== item.workDate) return json({ error: "วันที่ต้องอยู่ในเดือนของเอกสาร" }, 400);
    lease = randomUUID();
    if (!await store.claimMedia(lease)) { lease = undefined; return json({ error: "กำลังบันทึกรายการอื่น กรุณาลองใหม่" }, 409); }
    const [employee, rows] = await Promise.all([store.findEmployee(employeeId), store.employeeEntries(employeeId, month)]);
    if (employee?.team === "Event Activation / Mkt" && !item.accommodationOnly && (!item.startTime || !item.endTime)) return json({ error: "กรุณากรอกเวลาเริ่มต้นและเวลาสิ้นสุด" }, 400);
    const creating = parsed.data.operation === "create";
    const entryId = creating && !item.id.startsWith(`web:${employeeId}:`) ? `web:${employeeId}:${item.id}` : item.id;
    const row = rows.find((row) => row.id === entryId);
    if (!employee?.active || (!creating && !row)) return json({ error: "ไม่พบรายการของพนักงานในเดือนนี้" }, 404);
    if (rows.some((row) => row.id !== entryId && row.data.workDate === item.workDate)) return json({ error: "บันทึกได้วันละหนึ่งงาน วันที่นี้มีรายการแล้ว" }, 409);
    const archive = configuredEvidenceArchive();
    if (!row) {
      if (item.evidenceExpired) return json({ error: "รายการใหม่ต้องแนบรูปหลักฐาน" }, 400);
      let imageId = "";
      if (!item.accommodationOnly) {
        const image = item.evidenceImage;
        const match = image && /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image.dataUrl);
        if (!image || !match || match[1] !== image.mimeType) return json({ error: "กรุณาแนบรูปหลักฐาน" }, 400);
        imageId = await archive.saveEvidence({ messageId: `web:${randomUUID()}`, workDate: item.workDate, employee, bytes: Buffer.from(match[2], "base64"), mimeType: image.mimeType });
        // Keep the unique registered upload path; later edits can move it safely.
      }
      await store.createEmployeeEntry(entryId, employeeId, { employeeId, employeeName: employee.name, imageId,
        workDate: item.workDate, subject: item.subject, location: item.location, startTime: item.startTime, endTime: item.endTime,
        ...(item.accommodationOnly ? { kind: "accommodation" as const, accommodation: item.accommodation ?? 0 } : {}),
        expense: { ...item, id: entryId, isNew: false, evidenceImage: null, evidenceExpired: false } } as import("@/lib/line/employee-intake").EmployeeWorkEntry);
      return json({ saved: true, id: entryId });
    }
    const accommodationOnly = row.data.kind === "accommodation";
    if (Boolean(item.accommodationOnly) !== accommodationOnly) return json({ error: "ประเภทรายการไม่ตรงกับข้อมูลเดิม" }, 400);
    const expired = !accommodationOnly && archive instanceof SupabaseEvidenceArchive && await archive.isExpired(row.data.imageId);
    if (expired && item.workDate !== row.data.workDate) return json({ error: "รายการที่รูปหมดอายุแล้วไม่สามารถย้ายวันที่ได้" }, 400);
    if (!accommodationOnly && !expired && !item.evidenceImage) return json({ error: "กรุณาแนบรูปหลักฐาน" }, 400);
    let change: Awaited<ReturnType<typeof archive.editEvidence>> | undefined;
    if (!accommodationOnly && !expired) {
      const image = item.evidenceImage!;
      const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image.dataUrl);
      if (!match || match[1] !== image.mimeType) return json({ error: "รูปไม่ถูกต้อง" }, 400);
      change = await archive.editEvidence(row.data.imageId, employee, item.workDate, Buffer.from(match[2], "base64"), image.mimeType);
    }
    try {
      await store.updateEmployeeEntry(entryId, employeeId, row.data, { ...row.data,
        workDate: item.workDate, subject: item.subject, location: item.location,
        expense: { ...item, isNew: false, evidenceImage: null, evidenceExpired: expired } } as typeof row.data);
    } catch (error) { await change?.rollback(); throw error; }
    // An old spare file is harmless if cleanup fails after the database commits.
    await change?.commit().catch(() => undefined);
    return json({ saved: true, id: entryId });
  } catch (error) { return error instanceof ScopeError ? json({ error: error.message }, error.status) : json({ error: "บันทึกไม่สำเร็จ อาจมีวันที่ซ้ำหรือข้อมูลเปลี่ยนไป กรุณาโหลดข้อมูลใหม่" }, 409); }
  finally { if (lease) await store.releaseMedia(lease).catch(() => undefined); }
}


export async function DELETE(request: Request) {
  if (!allowsExpenseRecords(request)) return json({ error: "เว็บยังไม่พร้อมเชื่อมฐานข้อมูล" }, 503);
  const store = configuredLineStore();
  if (!(store instanceof SupabaseLineStore)) return json({ error: "ยังไม่ได้เชื่อมฐานข้อมูล" }, 503);
  let lease: string | undefined;
  try {
    const parsed = scopeSchema.extend({ id: z.string().min(1).max(200) }).safeParse(await request.json());
    if (!parsed.success) return json({ error: "ข้อมูลรายการไม่ถูกต้อง" }, 400);
    const { employeeId, month } = await requestedScope(parsed.data);
    lease = randomUUID();
    if (!await store.claimMedia(lease)) { lease = undefined; return json({ error: "กำลังบันทึกรายการอื่น กรุณาลองใหม่" }, 409); }
    const employee = await store.findEmployee(employeeId);
    const row = (await store.employeeEntries(employeeId, month)).find(row => row.id === parsed.data.id);
    if (!employee?.active || !row) return json({ error: "ไม่พบรายการของพนักงานในเดือนนี้" }, 404);
    await store.deleteEmployeeEntry(row.id, employeeId, row.data);
    // Evidence remains private and is removed by the existing monthly retention job.
    return json({ deleted: true });
  } catch (error) { return error instanceof ScopeError ? json({ error: error.message }, error.status) : json({ error: "ลบไม่สำเร็จ กรุณาโหลดข้อมูลใหม่" }, 409); }
  finally { if (lease) await store.releaseMedia(lease).catch(() => undefined); }
}
