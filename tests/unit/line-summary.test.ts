import { describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { summaryReply, parseSummaryCommand, parseSummaryPostback } from "@/lib/line/summary";
import { toLineMessage } from "@/lib/line/webhook";

const employee = { employeeId: "12345678", name: "คนทดสอบ", active: true };
describe("test LINE summary table", () => {
  it("parses current/explicit months and rejects invalid page requests", () => {
    expect(parseSummaryCommand("ดูสรุปตาราง", "2026-10")).toEqual({ month: "2026-10", offset: 0 });
    expect(parseSummaryCommand("ดูสรุปตาราง 2026-09", "2026-10")?.month).toBe("2026-09");
    expect(parseSummaryCommand("ดูสรุปตาราง 2026-13", "2026-10")).toBeNull();
    expect(parseSummaryPostback("summary:2026-10:5")).toEqual({ month: "2026-10", offset: 5 });
    expect(parseSummaryPostback("summary:2026-10:31")).toBeNull();
    expect(parseSummaryPostback("summary:2026-10:3")).toBeNull();
  });
  it("reads only the bound employee/month and paginates while retaining the full month's total", async () => {
    const store = { findEmployee: vi.fn().mockResolvedValue(employee), employeeEntries: vi.fn().mockResolvedValue(Array.from({ length: 6 }, (_, index) => ({ id: `one-${index}`, data: { workDate: `2026-10-0${index+1}`, subject: "งานทดสอบ", location: "สำนักงานใหญ่", imageId: "unused", employeeId: employee.employeeId, employeeName: employee.name, ...(index === 5 ? { expense: { perDiem: 450, fare: 100 } } : {}) } }))) };
    const reply = await summaryReply(store, employee, "2026-10", 0, true);
    expect(store.employeeEntries).toHaveBeenCalledWith(employee.employeeId, "2026-10");
    expect(reply.table?.rows).toHaveLength(5);
    expect(reply.table?.total).toBe("1,950.00");
    expect(reply.table?.title).toBe("ตารางสรุปเดือนตุลาคม");
    expect(reply.table?.subtitle).toBe(employee.name);
    expect(reply.table?.rows[0].date).toBe("01");
    expect(reply.buttons.map((button) => button.data)).toEqual(["summary:2026-10:5", "summary-link:2026-10", "intake:resume"]);
    const next = await summaryReply(store, employee, "2026-10", 5, false);
    expect(next.table?.rows[0].amount).toBe("450.00");
    const message = toLineMessage(reply);
    expect(message.type).toBe("flex");
    if (process.env.IHD_SAVE_SUMMARY_SAMPLE === "1") writeFileSync(".local-data/line/summary-flex.json", JSON.stringify({ messages: [message] }));
  });
  it("does not read entries for an inactive employee and handles an empty month", async () => {
    const store = { findEmployee: vi.fn().mockResolvedValue(null), employeeEntries: vi.fn().mockResolvedValue([]) };
    expect((await summaryReply(store, employee, "2026-10", 0, false)).text).toContain("ไม่พบพนักงาน");
    expect(store.employeeEntries).not.toHaveBeenCalled();
    store.findEmployee.mockResolvedValue(employee);
    expect((await summaryReply(store, employee, "2026-10", 0, false)).text).toContain("ยังไม่มีรายการ");
  });
});
