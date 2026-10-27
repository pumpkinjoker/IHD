import type { EmployeeWorkEntry } from "./employee-intake";
import type { IntakeReply } from "./intake";

export const RECORD_PAGE_SIZE = 5;
export type EntryPage = { entries: EmployeeWorkEntry[]; hasMore: boolean };
export function validMonth(month: string) { return /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month); }
export function parseRecordCommand(text: string, currentMonth: string) {
  const match = /^(?:ดูรายการ|รายการของฉัน|ดูข้อมูล)(?:\s+(\d{4}-\d{2}))?$/.exec(text.trim());
  const month = match?.[1] ?? currentMonth;
  return match && validMonth(month) ? { month, offset: 0 } : null;
}
export function parseRecordPostback(data: string) {
  const match = /^records:(\d{4}-\d{2}):(\d{1,5})$/.exec(data);
  return match && validMonth(match[1]) && Number(match[2]) <= 10000 ? { month: match[1], offset: Number(match[2]) } : null;
}
export function recordReply(page: EntryPage, month: string, offset: number, hasDraft: boolean): IntakeReply {
  return {
    text: page.entries.length ? `รายการที่บันทึกแล้ว ${month}\n\n${page.entries.map((entry, index) =>
      `${offset + index + 1}. ${entry.workDate}\n${entry.subject}\nสถานที่: ${entry.location}`).join("\n\n")}` : `ยังไม่มีรายการที่ยืนยันบันทึกในเดือน ${month} ครับ`,
    buttons: [
      ...(offset ? [{ label: "ก่อนหน้า", data: `records:${month}:${Math.max(0, offset - RECORD_PAGE_SIZE)}` }] : []),
      ...(page.hasMore ? [{ label: "ถัดไป", data: `records:${month}:${offset + RECORD_PAGE_SIZE}` }] : []),
      ...(hasDraft ? [{ label: "กลับรายการที่ค้าง", data: "intake:resume" }] : [{ label: "เพิ่มข้อมูล", data: "intake:start" }])
    ]
  };
}
