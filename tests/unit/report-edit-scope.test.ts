import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { resolveReportEditScope } from "@/lib/reports/edit-scope";
afterEach(() => vi.unstubAllEnvs());
it("looks up only the token hash and rejects expired or malformed grants", async () => {
  vi.stubEnv("SUPABASE_URL", "https://db.example");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-only");
  const token = "a".repeat(22), now = new Date("2026-11-01T01:00:00Z");
  const transport = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = new URL(String(input));
    expect(url.searchParams.get("token_hash")).toBe(`eq.${createHash("sha256").update(token).digest("hex")}`);
    expect(String(input)).not.toContain(token);
    return Response.json([{ employee_id: "12345678", period: "2026-10-01", expires_at: "2026-11-30T17:00:00Z" }]);
  });
  expect(await resolveReportEditScope(token, process.env, transport, now)).toEqual({ employeeId: "12345678", month: "2026-10" });
  expect(await resolveReportEditScope("bad", process.env, transport, now)).toBeNull();
  expect(transport).toHaveBeenCalledOnce();
  transport.mockResolvedValue(Response.json([{ employee_id: "12345678", period: "2026-10-01", expires_at: "2026-10-01T00:00:00Z" }]));
  expect(await resolveReportEditScope(token, process.env, transport, now)).toBeNull();
});
