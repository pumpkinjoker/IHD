import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as config from "@/lib/line/config";
import { SupabaseLineStore } from "@/lib/line/store";
import { LocalEvidenceArchive } from "@/lib/line/local-archive";
import { SupabaseEvidenceArchive, EvidenceExpiredError } from "@/lib/line/supabase-archive";
import { createDefaultExpenseWorkItem } from "@/lib/expense-request/form-defaults";
import { GET, POST } from "@/app/api/expense-records/route";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64");
const entry = { workDate: "2026-10-26", subject: "จาก LINE", location: "สำนักงาน", imageId: `local:${"a".repeat(64)}`, employeeId: "12345678", employeeName: "คนทดสอบ" };
const row = { id: "event-1", data: entry };
const rollback = vi.fn(async () => undefined);
const commit = vi.fn(async () => undefined);
let failUpdate = false;
let rows = [row];
let updateBody: Record<string, unknown> | undefined;
const request = (body?: unknown) => new Request("http://127.0.0.1:3000/api/expense-records?employeeId=12345678&month=2026-10", body ? { method: "POST", headers: { origin: "http://127.0.0.1:3000" }, body: JSON.stringify(body) } : undefined);
const item = () => ({ ...createDefaultExpenseWorkItem(), id: row.id, workDate: entry.workDate, subject: "แก้ไขจากเว็บ", location: entry.location, evidenceImage: { fileName: "old.png", mimeType: "image/png", dataUrl: `data:image/png;base64,${png.toString("base64")}` } });

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("LINE_MEDIA_MODE", "local"); vi.stubEnv("VERCEL", "");
  rows = [row]; failUpdate = false; updateBody = undefined;
  const transport: typeof fetch = async (url, init) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith("ihd_employee_directory")) return Response.json([{ employee_id: entry.employeeId, name: entry.employeeName, active: true }]);
    if (parsed.pathname.endsWith("line_claim_media")) return Response.json(true);
    if (parsed.pathname.endsWith("line_release_media")) return Response.json(null);
    if (init?.method === "PATCH") {
      expect(parsed.searchParams.get("id")).toBe("eq.event-1");
      expect(parsed.searchParams.get("employee_id")).toBe("eq.12345678");
      updateBody = JSON.parse(init.body as string);
      return Response.json(failUpdate ? [] : [{ id: row.id }]);
    }
    expect(parsed.searchParams.get("employee_id")).toBe("eq.12345678");
    expect(parsed.searchParams.get("and")).toBe("(work_date.gte.2026-10-01,work_date.lt.2026-11-01)");
    return Response.json(rows);
  };
  vi.spyOn(config, "configuredLineStore").mockReturnValue(new SupabaseLineStore("https://example.supabase.co", "server-only", transport));
  vi.spyOn(LocalEvidenceArchive.prototype, "readEvidence").mockResolvedValue({ bytes: png, mimeType: "image/png" });
  vi.spyOn(LocalEvidenceArchive.prototype, "editEvidence").mockResolvedValue({ rollback, commit });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("original expense form data API", () => {
  it("keeps text and costs editable after monthly image expiry", async () => {
    const archive = new SupabaseEvidenceArchive("https://example.supabase.co", "server-only");
    vi.spyOn(config, "configuredEvidenceArchive").mockReturnValue(archive);
    vi.spyOn(archive, "readEvidence").mockRejectedValue(new EvidenceExpiredError());
    vi.spyOn(archive, "isExpired").mockResolvedValue(true);
    const edit = vi.spyOn(archive, "editEvidence");
    const response = await GET(request());
    expect((await response.json()).items[0]).toMatchObject({ subject: entry.subject, evidenceImage: null, evidenceExpired: true });
    const updated = await POST(request({ employeeId: entry.employeeId, month: "2026-10", item: { ...item(), evidenceImage: null, evidenceExpired: true, fare: 100 } }));
    expect(updated.status).toBe(200);
    expect(updateBody).toMatchObject({ data: { expense: { fare: 100, evidenceExpired: true } } });
    expect(edit).not.toHaveBeenCalled();
  });
  it("loads the selected employee and month with the original form defaults", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    const { items } = await response.json();
    expect(items[0]).toMatchObject({ id: row.id, subject: entry.subject, perDiem: 300, evidenceImage: { fileName: "20261026.png" } });
    expect(JSON.stringify(items)).not.toContain("server-only");
  });
  it("updates the same LINE entry and stores amounts without base64 in the database", async () => {
    const response = await POST(request({ employeeId: entry.employeeId, month: "2026-10", item: { ...item(), fare: 200 } }));
    expect(response.status).toBe(200);
    expect(updateBody).toMatchObject({ work_date: entry.workDate, data: { imageId: entry.imageId, subject: "แก้ไขจากเว็บ", expense: { fare: 200, evidenceImage: null } } });
    expect(commit).toHaveBeenCalledOnce();
    expect(rollback).not.toHaveBeenCalled();
  });
  it("rejects foreign IDs, another month and duplicate days before editing files", async () => {
    expect((await POST(request({ employeeId: entry.employeeId, month: "2026-10", item: { ...item(), id: "foreign" } }))).status).toBe(404);
    expect((await POST(request({ employeeId: entry.employeeId, month: "2026-10", item: { ...item(), workDate: "2026-09-30" } }))).status).toBe(400);
    rows = [row, { ...row, id: "event-2" }];
    expect((await POST(request({ employeeId: entry.employeeId, month: "2026-10", item: item() }))).status).toBe(409);
    expect(LocalEvidenceArchive.prototype.editEvidence).not.toHaveBeenCalled();
  });
  it("restores the previous photo if the database rejects an update", async () => {
    failUpdate = true;
    expect((await POST(request({ employeeId: entry.employeeId, month: "2026-10", item: item() }))).status).toBe(409);
    expect(rollback).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
  });
  it("rejects requests outside the local testing environment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await GET(request())).status).toBe(404);
    expect((await POST(request({}))).status).toBe(404);
  });
});
