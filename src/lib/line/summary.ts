import { formatMoney } from "@/lib/money/format-money";
import { calculateGrandTotal } from "@/lib/calculations/expense";
import { reportWorkItem } from "@/lib/reports/monthly-report";
import type { SupabaseLineStore } from "./store";
import type { IntakeEmployee } from "./employee-intake";
import type { IntakeReply } from "./intake";
import { validMonth } from "./records";

export const SUMMARY_PAGE_SIZE = 5;
export function parseSummaryCommand(text: string, currentMonth: string) {
  const match = /^(?:ดูสรุปตาราง|สรุปตาราง|ดูสรุป)(?:\s+(\d{4}-\d{2}))?$/.exec(text.trim());
  const month = match?.[1] || currentMonth;
  return match && validMonth(month) ? { month, offset: 0 } : null;
}
export function parseSummaryPostback(data: string) {
  const match = /^summary:(\d{4}-\d{2}):(\d{1,2})$/.exec(data);
  return match && validMonth(match[1]) && Number(match[2]) <= 30 && Number(match[2]) % SUMMARY_PAGE_SIZE === 0 ? { month: match[1], offset: Number(match[2]) } : null;
}
export async function summaryReply(store: Pick<SupabaseLineStore, "employeeEntries" | "findEmployee">, employee: IntakeEmployee, month: string, offset: number, hasDraft: boolean): Promise<IntakeReply> {
  const active = await store.findEmployee(employee.employeeId);
  if (!active?.active) return { text: "ไม่พบพนักงานที่ใช้งานอยู่ กรุณาตรวจสอบรหัสพนักงานครับ", buttons: [] };
  const entries = await store.employeeEntries(active.employeeId, month);
  const items = entries.map(reportWorkItem);
  const total = formatMoney(items.reduce((sum, item) => sum + (item.perDiem ?? 0), 0));
  const rows = items.slice(offset, offset + SUMMARY_PAGE_SIZE).map((item) => ({ date: `${item.workDate.slice(8,10)}/${item.workDate.slice(5,7)}`, subject: item.subject, location: item.location || "—", amount: formatMoney(item.perDiem ?? 0) }));
  const note = `${items.length} วัน · ค่าใช้จ่ายรวม ${formatMoney(calculateGrandTotal(items))} บาท\nสรุปช่วงทดสอบจากรายการที่ยืนยันบันทึกแล้ว`;
  const subtitle = `${active.name} · ${month}${rows.length ? ` · ${offset + 1}–${offset + rows.length}` : ""}`;
  return {
    text: rows.length ? `สรุปตาราง ${subtitle}\n${rows.map((row) => `${row.date} ${row.subject} · ${row.amount} บาท`).join("\n")}\nเบี้ยเลี้ยงรวมทั้งเดือน ${total} บาท\n${note}` : `ยังไม่มีรายการที่ยืนยันบันทึกในเดือน ${month} ครับ`,
    ...(rows.length ? { table: { title: "สรุปตารางเบี้ยเลี้ยง", subtitle, rows, total, note } } : {}),
    buttons: [
      ...(offset ? [{ label: "ก่อนหน้า", data: `summary:${month}:${Math.max(0, offset - SUMMARY_PAGE_SIZE)}` }] : []),
      ...(offset + SUMMARY_PAGE_SIZE < items.length ? [{ label: "ถัดไป", data: `summary:${month}:${offset + SUMMARY_PAGE_SIZE}` }] : []),
      hasDraft ? { label: "กลับรายการที่ค้าง", data: "intake:resume" } : { label: "เพิ่มข้อมูลหน้างาน", data: "intake:start" }
    ]
  };
}
