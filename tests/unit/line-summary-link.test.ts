import { expect, it, vi } from "vitest";
import { summaryLinkReply } from "@/lib/line/summary-link";
import { parseSummaryLink, parseSummaryLinkPostback } from "@/lib/line/summary";
import { REPORT_STORAGE_ORIGIN, monthlyReportSchema } from "@/lib/reports/monthly-report";
import { readFileSync } from "node:fs";
const employee = { employeeId: "12345678", name: "คนทดสอบ", active: true };
const details = { employee_id: employee.employeeId, name: employee.name, email: "employee@example.com", team: "Team", position: "Staff" };
const reference = "supabase:" + "a".repeat(64);
const row = { id: "one", data: { employeeId: employee.employeeId, employeeName: employee.name, imageId: reference, workDate: "2026-10-01", subject: "งาน", location: "สถานที่", expense: { perDiem: 450 } } };

it("parses a request for a private link and rejects invalid months", () => {
  expect(parseSummaryLink("ขอลิงก์สรุป", "2026-10")).toEqual({ month: "2026-10" });
  expect(parseSummaryLinkPostback("summary-link:2026-10")).toEqual({ month: "2026-10" });
  expect(parseSummaryLinkPostback("summary-link:2026-13")).toBeNull();
});
it("creates an owned, short-lived preview without touching the final monthly outbox", async () => {
  const store = { employeeDetails: vi.fn().mockResolvedValue(details), employeeEntries: vi.fn().mockResolvedValue([row]) };
  const calls: string[] = [];
  let snapshot: unknown;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(url.pathname);
    if (url.pathname.includes("line_evidence_files")) {
      expect(url.searchParams.get("employee_id")).toBe("eq.12345678");
      return Response.json([{ reference, object_path: "2026/2026-10/12345678/evidence/20261001.png", mime_type: "image/png" }]);
    }
    if (url.pathname.includes("/object/sign/")) {
      expect(JSON.parse(init!.body as string).expiresIn).toBe(86400);
      return Response.json({ signedURL: url.pathname.replace("/storage/v1", "") + "?token=sample" });
    }
    if (url.pathname.includes("/object/ihd-monthly-reports/")) snapshot = JSON.parse(init!.body as string);
    return new Response(null, { status: 201 });
  };
  const reply = await summaryLinkReply(store, { SUPABASE_URL: REPORT_STORAGE_ORIGIN, SUPABASE_SERVICE_ROLE_KEY: "server-key" }, employee, "2026-10", true, transport, new Date("2026-10-27T01:00:00Z"));
  expect(reply.text).toContain("https://ihd-gen.vercel.app/line/monthly#");
  const report = monthlyReportSchema.parse(snapshot);
  expect(report.preview).toBe(true);
  expect(report.requester.employeeId).toBe(employee.employeeId);
  expect(report.draft.workItems[0].perDiem).toBe(450);
  expect(reply.buttons.some((button) => button.data === "intake:resume")).toBe(true);
  expect(calls.some((path) => path.includes("line_monthly_reports"))).toBe(false);
  expect(reply.text).not.toContain("server-key");
});
it("does not create a link when no confirmed entries exist", async () => {
  const transport = vi.fn();
  const reply = await summaryLinkReply({ employeeDetails: vi.fn().mockResolvedValue(details), employeeEntries: vi.fn().mockResolvedValue([]) }, {}, employee, "2026-10", false, transport);
  expect(reply.text).toContain("ยังไม่มีรายการ");
  expect(transport).not.toHaveBeenCalled();
});

it.skipIf(process.env.IHD_LINK_SMOKE !== "1")("opens an actual signed preview and image from private Supabase Storage, then removes its fixtures", async (context) => {
  const base = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const id = crypto.randomUUID();
  const fake = { employeeId: "00000000", name: "Preview Smoke", active: true };
  const month = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }).slice(0, 7);
  const previewPath = `previews/${month}/00000000/summary.json`;
  const sourcePath = `.preview-smoke/${id}/photo.png`;
  const ref = "supabase:" + (id.replaceAll("-", "") + id.replaceAll("-", ""));
  const filter = new URLSearchParams({ employee_id: "eq.00000000", period: `eq.${month}-01` });
  const api = async (path: string, method = "GET", body?: unknown, extra: Record<string,string> = {}) => {
    const response = await fetch(`${base}/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra }, body: body === undefined ? undefined : body instanceof Uint8Array ? new Blob([Buffer.from(body)]) : JSON.stringify(body) });
    if (!response.ok) throw new Error(`Preview smoke failed (${response.status})`);
    return response;
  };
  if ((await (await api(`rest/v1/line_summary_previews?${filter}`)).json()).length) context.skip();
  try {
    await api(`storage/v1/object/ihd-evidence-test/${sourcePath}`, "POST", readFileSync("public/brand/toa-logo.png"), { "Content-Type": "image/png" });
    await api("rest/v1/line_evidence_files", "POST", { reference: ref, employee_id: fake.employeeId, object_path: sourcePath, work_date: `${month}-01`, mime_type: "image/png" });
    const reply = await summaryLinkReply({ employeeDetails: vi.fn().mockResolvedValue({ ...details, employee_id: fake.employeeId, name: fake.name }), employeeEntries: vi.fn().mockResolvedValue([{ ...row, data: { ...row.data, employeeId: fake.employeeId, imageId: ref, workDate: `${month}-01` } }]) }, process.env, fake, month, false);
    const link = reply.text.match(/https:\/\/ihd-gen\.vercel\.app\/line\/monthly#[^\s]+/)?.[0];
    expect(link).toBeTruthy();
    const response = await fetch(decodeURIComponent(link!.split("#")[1]));
    expect(response.ok).toBe(true);
    const report = monthlyReportSchema.parse(await response.json());
    expect(report.preview).toBe(true);
    expect(report.requester.employeeId).toBe(fake.employeeId);
    expect((await fetch(report.draft.workItems[0].evidenceImage!.dataUrl)).ok).toBe(true);
  } finally {
    await api("storage/v1/object/ihd-monthly-reports", "DELETE", { prefixes: [previewPath] });
    await api(`rest/v1/line_summary_previews?${filter}`, "DELETE");
    await api("storage/v1/object/ihd-evidence-test", "DELETE", { prefixes: [sourcePath] });
    await api(`rest/v1/line_evidence_files?${new URLSearchParams({ reference: `eq.${ref}` })}`, "DELETE");
  }
}, 60_000);
