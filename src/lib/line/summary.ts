import { reportWorkItem } from "@/lib/reports/monthly-report";
import type { SupabaseLineStore } from "./store";
import type { IntakeEmployee } from "./employee-intake";
import type { IntakeReply } from "./intake";
import { validMonth } from "./records";
import { calculateExpenseRowTotal, calculateGrandTotal } from "@/lib/calculations/expense";

const wholeBaht = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
export function parseSummaryLink(text: string, currentMonth: string) {
  const match = /^(?:ลิงก์เอกสารเบิก|ขอลิงก์สรุป|ขอลิงค์สรุป|ดูลิงก์สรุป)(?:\s+(\d{4}-\d{2}))?$/.exec(text.trim());
  const month = match?.[1] || currentMonth;
  return match && validMonth(month) ? { month } : null;
}
export function parseSummaryLinkPostback(data: string) {
  const match = /^summary-link:(\d{4}-\d{2})$/.exec(data);
  return match && validMonth(match[1]) ? { month: match[1] } : null;
}
export function parseSummaryCommand(text: string, currentMonth: string) {
  const match = /^(?:ตารางสรุป|ดูสรุปตาราง|สรุปตาราง|ดูสรุป)(?:\s+(\d{4}-\d{2}))?$/.exec(text.trim());
  const month = match?.[1] || currentMonth;
  return match && validMonth(month) ? { month, offset: 0 } : null;
}
export function parseSummaryPostback(data: string) {
  const match = /^summary:(\d{4}-\d{2}):(\d{1,2})$/.exec(data);
  // Accept existing page buttons, but always reopen the complete month.
  return match && validMonth(match[1]) && Number(match[2]) <= 30 && Number(match[2]) % 5 === 0 ? { month: match[1], offset: 0 } : null;
}
export async function summaryReply(store: Pick<SupabaseLineStore, "employeeEntries" | "findEmployee">, employee: IntakeEmployee, month: string, offset: number, hasDraft: boolean): Promise<IntakeReply> {
  void offset; // Older callers may still supply a page offset.
  const active = await store.findEmployee(employee.employeeId);
  if (!active?.active) return { text: "ไม่พบพนักงานที่ใช้งานอยู่ กรุณาตรวจสอบรหัสพนักงานครับ", buttons: [] };
  const entries = await store.employeeEntries(active.employeeId, month);
  const items = entries.map(reportWorkItem);
  const total = wholeBaht.format(calculateGrandTotal(items));
  const rows = items.map((item) => ({ date: item.workDate.slice(8,10), subject: item.subject, location: item.location || "—", amount: wholeBaht.format(calculateExpenseRowTotal(item)) }));
  const title = `ตารางสรุปเดือน${new Intl.DateTimeFormat("th-TH", { month: "long", timeZone: "Asia/Bangkok" }).format(new Date(`${month}-01T00:00:00+07:00`))}`;
  const subtitle = active.name;
  return {
    text: rows.length ? `${title}\n${subtitle}\n${rows.map((row) => `${row.date} ${row.subject} · ${row.amount} บาท`).join("\n")}\nเบิกค่าใช้จ่ายทั้งหมด ${total} บาท` : `ยังไม่มีรายการที่ยืนยันบันทึกในเดือน ${month} ครับ`,
    ...(rows.length ? { table: { title, subtitle, rows, total } } : {}),
    buttons: [
      ...(items.length ? [{ label: "ลิงก์เอกสารเบิก", data: `summary-link:${month}` }] : []),
      hasDraft ? { label: "กลับรายการที่ค้าง", data: "intake:resume" } : { label: "เพิ่มข้อมูล", data: "intake:start" }
    ]
  };
}
