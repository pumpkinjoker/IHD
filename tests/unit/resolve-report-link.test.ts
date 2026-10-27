import { expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { resolveReportLink } from "../../supabase/functions/resolve-report-link/index";
const token = "a".repeat(22);
const now = new Date("2026-10-27T01:00:00Z");
const env = { url: "https://db.example", key: "server-only" };
const request = (value = token) => new Request("https://resolver.example", { method: "POST", headers: { Origin: "https://ihd-gen.vercel.app" }, body: JSON.stringify({ token: value }) });
it("resolves only the token hash and grants at most one minute of report access", async () => {
  const transport = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.includes("line_report_links")) {
      expect(url.searchParams.get("token_hash")).toBe(`eq.${createHash("sha256").update(token).digest("hex")}`);
      expect(url.searchParams.get("expires_at")).toBe(`gt.${now.toISOString()}`);
      return Response.json([{ object_path: "previews/2026-10/12345678/summary.json", expires_at: "2026-10-28T01:00:00Z" }]);
    }
    expect(url.pathname).toBe("/storage/v1/object/sign/ihd-monthly-reports/previews/2026-10/12345678/summary.json");
    expect(JSON.parse(init!.body as string)).toEqual({ expiresIn: 60 });
    return Response.json({ signedURL: "/object/sign/ihd-monthly-reports/previews/summary.json?token=signed" });
  });
  const result = await resolveReportLink(request(), env, transport, now);
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(JSON.stringify(await result.json())).not.toContain(env.key);
});
it("rejects missing, malformed, expired and oversized tokens without revealing a report", async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));
  for (const value of ["", "a", "x".repeat(1024)]) expect((await resolveReportLink(request(value), env, transport, now)).status).toBe(404);
  expect(transport).not.toHaveBeenCalled();
  expect((await resolveReportLink(request(), env, transport, now)).status).toBe(404);
  expect(transport).toHaveBeenCalledOnce();
});
