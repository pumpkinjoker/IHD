import { randomUUID } from "node:crypto";
import { z } from "zod";
import { configuredLineStore, configuredEvidenceArchive } from "@/lib/line/config";
import { SupabaseLineStore } from "@/lib/line/store";
import { allowsExpenseRecords } from "@/lib/line/local-test-access";
import { validMonth } from "@/lib/line/records";
import { EvidenceExpiredError, SupabaseEvidenceArchive } from "@/lib/line/supabase-archive";
import { createDefaultExpenseWorkItem } from "@/lib/expense-request/form-defaults";
import { evidenceFileName } from "@/lib/images/evidence-file-name";
import { expenseWorkItemSchema } from "@/schemas/expense-request-form.schema";
import type { EvidenceImage } from "@/types/expense-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const scopeSchema = z.object({ employeeId: z.string().regex(/^\d{8}$/), month: z.string().refine(validMonth) });
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  if (!allowsExpenseRecords(request)) return new Response(null, { status: 404 });
  const scope = scopeSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!scope.success) return json({ error: "กรุณาเลือกพนักงานและเดือน" }, 400);
  try {
    const store = configuredLineStore();
    if (!(store instanceof SupabaseLineStore)) return json({ error: "ยังไม่ได้เชื่อม Supabase" }, 503);
    const employee = await store.findEmployee(scope.data.employeeId);
    if (!employee?.active) return json({ error: "ไม่พบพนักงาน" }, 404);
    const rows = await store.employeeEntries(employee.employeeId, scope.data.month);
    const archive = configuredEvidenceArchive();
    const items = [];
    for (const row of rows) {
      let evidenceImage: EvidenceImage | null = null;
      let evidenceExpired = false;
      try {
        const media = await archive.readEvidence(row.data.imageId);
        evidenceImage = {
        fileName: evidenceFileName(row.data.workDate, media.mimeType),
        mimeType: media.mimeType as EvidenceImage["mimeType"],
        dataUrl: `data:${media.mimeType};base64,${media.bytes.toString("base64")}`
        };
      } catch (error) {
        if (!(error instanceof EvidenceExpiredError)) throw error;
        evidenceExpired = true;
      }
      items.push({ ...createDefaultExpenseWorkItem(), ...row.data.expense, id: row.id,
        workDate: row.data.workDate, subject: row.data.subject, location: row.data.location, evidenceImage, evidenceExpired });
    }
    return json({ items });
  } catch { return json({ error: "โหลดรายการหรือรูปไม่สำเร็จ กรุณาลองอีกครั้ง" }, 503); }
}

export async function POST(request: Request) {
  if (!allowsExpenseRecords(request)) return new Response(null, { status: 404 });
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
    const parsed = scopeSchema.extend({ item: expenseWorkItemSchema }).safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) return json({ error: "กรุณาตรวจสอบข้อมูลและรูปหลักฐาน" }, 400);
    const { employeeId, month, item } = parsed.data;
    if (!item.workDate.startsWith(`${month}-`) || new Date(`${item.workDate}T00:00:00Z`).toISOString().slice(0, 10) !== item.workDate) return json({ error: "วันที่ต้องอยู่ในเดือนที่เลือก" }, 400);
    lease = randomUUID();
    if (!await store.claimMedia(lease)) { lease = undefined; return json({ error: "กำลังบันทึกรายการอื่น กรุณาลองใหม่" }, 409); }
    const [employee, rows] = await Promise.all([store.findEmployee(employeeId), store.employeeEntries(employeeId, month)]);
    const row = rows.find((row) => row.id === item.id);
    if (!employee?.active || !row) return json({ error: "ไม่พบรายการของพนักงานในเดือนนี้" }, 404);
    if (rows.some((row) => row.id !== item.id && row.data.workDate === item.workDate)) return json({ error: "บันทึกได้วันละหนึ่งงาน วันที่นี้มีรายการแล้ว" }, 409);
    const archive = configuredEvidenceArchive();
    const expired = archive instanceof SupabaseEvidenceArchive && await archive.isExpired(row.data.imageId);
    if (expired && item.workDate !== row.data.workDate) return json({ error: "รายการที่รูปหมดอายุแล้วไม่สามารถย้ายวันที่ได้" }, 400);
    if (!expired && !item.evidenceImage) return json({ error: "กรุณาแนบรูปหลักฐาน" }, 400);
    let change: Awaited<ReturnType<typeof archive.editEvidence>> | undefined;
    if (!expired) {
      const image = item.evidenceImage!;
      const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image.dataUrl);
      if (!match || match[1] !== image.mimeType) return json({ error: "รูปไม่ถูกต้อง" }, 400);
      change = await archive.editEvidence(row.data.imageId, employee, item.workDate, Buffer.from(match[2], "base64"), image.mimeType);
    }
    try {
      await store.updateEmployeeEntry(item.id, employeeId, row.data, { ...row.data,
        workDate: item.workDate, subject: item.subject, location: item.location,
        expense: { ...item, evidenceImage: null, evidenceExpired: expired } } as typeof row.data);
    } catch (error) { await change?.rollback(); throw error; }
    // An old spare file is harmless if cleanup fails after the database commits.
    await change?.commit().catch(() => undefined);
    return json({ saved: true });
  } catch { return json({ error: "บันทึกไม่สำเร็จ อาจมีวันที่ซ้ำหรือข้อมูลเปลี่ยนไป กรุณาโหลดข้อมูลใหม่" }, 409); }
  finally { if (lease) await store.releaseMedia(lease).catch(() => undefined); }
}
