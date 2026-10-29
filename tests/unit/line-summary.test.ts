import { describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { summaryReply, parseSummaryCommand, parseSummaryPostback } from "@/lib/line/summary";
import { toLineMessage, toLineMessages } from "@/lib/line/webhook";
import { LineClient } from "@/lib/line/client";

const employee = { employeeId: "12345678", name: "คนทดสอบ", active: true };
describe("test LINE summary table", () => {
  it("parses current/explicit months and rejects invalid page requests", () => {
    expect(parseSummaryCommand("ตารางสรุป", "2026-10")).toEqual({ month: "2026-10", offset: 0 });
    expect(parseSummaryCommand("ดูสรุปตาราง", "2026-10")).toEqual({ month: "2026-10", offset: 0 });
    expect(parseSummaryCommand("ดูสรุปตาราง 2026-09", "2026-10")?.month).toBe("2026-09");
    expect(parseSummaryCommand("ดูสรุปตาราง 2026-13", "2026-10")).toBeNull();
    expect(parseSummaryPostback("summary:2026-10:5")).toEqual({ month: "2026-10", offset: 0 });
    expect(parseSummaryPostback("summary:2026-10:31")).toBeNull();
    expect(parseSummaryPostback("summary:2026-10:3")).toBeNull();
  });
  it("shows every entry for the bound employee/month with the matching total and no next-page button", async () => {
    const store = { findEmployee: vi.fn().mockResolvedValue(employee), employeeEntries: vi.fn().mockResolvedValue(Array.from({ length: 6 }, (_, index) => ({ id: `one-${index}`, data: { workDate: `2026-10-0${index+1}`, subject: "งานทดสอบ", location: "สำนักงานใหญ่", imageId: "unused", employeeId: employee.employeeId, employeeName: employee.name, ...(index === 5 ? { expense: { perDiem: 450, fare: 100 } } : {}) } }))) };
    const reply = await summaryReply(store, employee, "2026-10", 0, true);
    expect(store.employeeEntries).toHaveBeenCalledWith(employee.employeeId, "2026-10");
    expect(reply.table?.rows).toHaveLength(6);
    expect(reply.table?.total).toBe("2,050");
    expect(reply.table?.title).toBe("ตารางสรุปเดือนตุลาคม");
    expect(reply.table?.subtitle).toBe(employee.name);
    expect(reply.table?.rows[0].date).toBe("01");
    expect(reply.buttons.map((button) => button.data)).toEqual(["summary-link:2026-10", "intake:resume"]);
    const next = await summaryReply(store, employee, "2026-10", 5, false);
    expect(next.table?.rows).toEqual(reply.table?.rows);
    expect(next.table?.rows[5].amount).toBe("550");
    const message = toLineMessage(reply);
    expect(message.type).toBe("flex");
    if (process.env.IHD_SAVE_SUMMARY_SAMPLE === "1") writeFileSync(".local-data/line/summary-flex.json", JSON.stringify({ messages: [message] }));
  });
  it("delivers all 31 long rows within LINE limits, with navigation and the total only at the end", async () => {
    const rows = Array.from({ length: 31 }, (_, index) => ({
      date: String(index + 1).padStart(2, "0"), subject: `${index + 1}:` + "ก".repeat(297), location: "ข".repeat(300), amount: "300"
    }));
    const reply = { text: "สรุปเดือน", table: { title: "ตารางสรุปเดือนตุลาคม", subtitle: employee.name, rows, total: "9,300" }, buttons: [{ label: "เพิ่มข้อมูล", data: "intake:start" }] };
    const messages = toLineMessages(reply);
    expect(messages.length).toBeGreaterThan(1);
    expect(messages.length).toBeLessThanOrEqual(5);
    const serialized = messages.map((message) => JSON.stringify(message));
    for (const text of serialized) expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(30_000);
    const all = serialized.join("");
    for (const row of rows) expect(all.split(JSON.stringify(row.subject)).length - 1).toBe(1);
    expect(serialized.slice(0, -1).every((text) => !text.includes("เบิกค่าใช้จ่ายทั้งหมด") && !text.includes("quickReply"))).toBe(true);
    expect(serialized.at(-1)).toContain("เบิกค่าใช้จ่ายทั้งหมด 9,300 บาท");
    expect(serialized.at(-1)).toContain("intake:start");
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
    await new LineClient("test-only", request).reply("not-sent", reply);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body)).messages).toEqual(messages);
    if (process.env.IHD_SAVE_SUMMARY_SAMPLE === "1") writeFileSync(".local-data/line/summary-all-flex.json", JSON.stringify({ messages }));
  });
  it("does not read entries for an inactive employee and handles an empty month", async () => {
    const store = { findEmployee: vi.fn().mockResolvedValue(null), employeeEntries: vi.fn().mockResolvedValue([]) };
    expect((await summaryReply(store, employee, "2026-10", 0, false)).text).toContain("ไม่พบพนักงาน");
    expect(store.employeeEntries).not.toHaveBeenCalled();
    store.findEmployee.mockResolvedValue(employee);
    expect((await summaryReply(store, employee, "2026-10", 0, false)).text).toContain("ยังไม่มีรายการ");
  });
});
