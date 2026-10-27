import { describe, expect, it, vi } from "vitest";
import { buildMonthlyReport, monthlyPeriod, monthlyReportMessage, runMonthlyReports } from "../../supabase/functions/monthly-report-worker/index";
import { monthlyReportSchema, isReportAsset } from "@/lib/reports/monthly-report";
const token = `header.${btoa(JSON.stringify({ role: "service_role" }))}.signature`;
const signed = "https://pqyvtdvskovhbsjduskr.supabase.co/storage/v1/object/sign/ihd-monthly-reports/test/20261001.png?token=sample";
const job = { id: "11111111-1111-4111-8111-111111111111", period: "2026-10-01", employee_id: "12345678", line_user_id: "U" + "a".repeat(32),
  snapshot: { employee: { employee_id: "12345678", name: "คน ทดสอบ", email: "employee@example.com", team: "Team", position: "Position" },
    entries: [{ id: "one", data: { workDate: "2026-10-01", subject: "งานหนึ่ง", location: "สำนักงาน", imageId: "supabase:" + "a".repeat(64) } },
      { id: "two", data: { workDate: "2026-10-02", subject: "งานสอง", location: "สำนักงาน", imageId: "supabase:" + "b".repeat(64), expense: { perDiem: 450, fare: 100, accommodation: 1000 } } }] },
  report_url: "https://ihd-gen.vercel.app/line/monthly#private-link", push_text: "frozen report message", retry_key: "22222222-2222-4222-8222-222222222222", expires_at: "2026-11-30T17:00:00Z" };
const request = (dryRun = false) => new Request("https://worker.example", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ dryRun }) });

describe("monthly personal report", () => {
  it("selects the previous month across Bangkok midnight and a year change", () => {
    expect(monthlyPeriod(new Date("2026-10-31T16:59:59Z"))).toMatchObject({ period: "2026-09-01", day: 31 });
    expect(monthlyPeriod(new Date("2026-10-31T17:00:00Z"))).toMatchObject({ period: "2026-10-01", day: 1, hour: 0 });
    expect(monthlyPeriod(new Date("2027-01-01T01:00:00Z"))).toMatchObject({ period: "2026-12-01", day: 1, hour: 8 });
  });
  it("uses the employee's own data, 300 per day by default and edited amounts when present", () => {
    const report = buildMonthlyReport(job, [1,2].map(() => ({ fileName: "20261001.png", mimeType: "image/png", dataUrl: signed })));
    expect(monthlyReportSchema.safeParse(report).success).toBe(true);
    expect(report.draft.workItems.map((item) => item.perDiem)).toEqual([300,450]);
    expect(report.requester.email).toBe("employee@example.com");
    expect(report.draft.documentDate).toBe("2026-11-01");
    const message = monthlyReportMessage(report, "https://ihd-gen.vercel.app/s#sample");
    expect(message).toContain("สรุปยอดเบิกค่าใช้จ่ายเดือนตุลาคม 2569");
    expect(message).toContain("เบิกค่าใช้จ่ายรวม 1,850 บาท");
    expect(message).not.toContain("เบี้ยเลี้ยง");
    expect(message).not.toContain("รอบล้าง");
    expect(() => buildMonthlyReport({ ...job, employee_id: "87654321" }, [])).toThrow();
    expect(isReportAsset("https://other.example/file.json?token=sample")).toBe(false);
    expect(isReportAsset("https://pqyvtdvskovhbsjduskr.supabase.co/storage/v1/object/public/ihd-monthly-reports/report.json")).toBe(false);
  });
  it("pushes a frozen personal link once and treats LINE retry acceptance as success", async () => {
    let pending = true;
    let pushes = 0;
    const transport: typeof fetch = async (url, init) => {
      const path = String(url);
      if (path.includes("line_monthly_config")) return Response.json({ lineToken: "test-token", appOrigin: "https://ihd-gen.vercel.app" });
      if (path.includes("line_prepare_monthly_reports")) return Response.json(0);
      if (path.includes("line_claim_monthly_report")) return Response.json(pending ? job : null);
      if (path.includes("line_monthly_mark_attempt")) return Response.json(true);
      if (path === "https://api.line.me/v2/bot/message/push") {
        pushes++;
        expect((init!.headers as Record<string,string>)["X-Line-Retry-Key"]).toBe(job.retry_key);
        expect(JSON.parse(init!.body as string)).toEqual({ to: job.line_user_id, messages: [{ type: "text", text: job.push_text }] });
        return new Response(null, { status: 409, headers: { "x-line-accepted-request-id": "accepted" } });
      }
      if (init?.method === "PATCH") { pending = false; return Response.json([{ id: job.id }]); }
      throw new Error("Unexpected request");
    };
    const now = new Date("2026-11-01T01:00:00Z");
    expect(await (await runMonthlyReports(request(), { url: "https://db.example" }, transport, now)).json()).toMatchObject({ sent: 1 });
    expect(await (await runMonthlyReports(request(), { url: "https://db.example" }, transport, now)).json()).toMatchObject({ sent: 0 });
    expect(pushes).toBe(1);
  });
  it("dry-runs without preparing jobs or sending any messages", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ lineToken: "test-token" }));
    expect(await (await runMonthlyReports(request(true), { url: "https://db.example" }, transport)).json()).toMatchObject({ dryRun: true, emailConfigured: false });
    expect(transport).toHaveBeenCalledOnce();
  });
});
