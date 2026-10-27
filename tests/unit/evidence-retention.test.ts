import { describe, expect, it, vi } from "vitest";
import { cleanupTestEvidence, evidenceRetentionCutoff } from "../../supabase/functions/cleanup-test-evidence/index";
const serverToken = `header.${btoa(JSON.stringify({ role: "service_role" }))}.signature`;

describe("calendar-month test image retention", () => {
  it("removes monthly snapshot objects before deleting their private report rows", async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    const transport: typeof fetch = async (url, init) => {
      const path = String(url);
      calls.push({ url: path, method: init?.method || "GET", body: init?.body ? JSON.parse(init.body as string) : null });
      if (path.includes("line_summary_previews")) return Response.json([]);
      if (path.includes("line_claim_media")) return Response.json(true);
      if (path.includes("line_purge_expired_data")) return Response.json({ entries: 0, events: 0 });
      if (path.includes("line_evidence_files")) return Response.json([]);
      if (path.includes("line_monthly_reports") && init?.method === "GET") {
        expect(new URL(path).searchParams.get("period")).toBe("lt.2026-02-01");
        return Response.json([{ id: "report-id", object_paths: ["2026-01/person/summary.json", "2026-01/person/photo.png"] }]);
      }
      return Response.json(null);
    };
    const response = await cleanupTestEvidence(new Request("https://example.test", { method: "POST", headers: { Authorization: `Bearer ${serverToken}` }, body: "{}" }), { url: "https://example.test", key: "server-key" }, transport, new Date("2026-02-28T17:00:00Z"));
    expect(await response.json()).toMatchObject({ reportsRemoved: 1 });
    const deletions = calls.filter((call) => call.method === "DELETE");
    expect(deletions[0]).toMatchObject({ url: "https://example.test/storage/v1/object/ihd-monthly-reports", body: { prefixes: ["2026-01/person/summary.json", "2026-01/person/photo.png"] } });
    expect(deletions[1].url).toContain("rest/v1/line_monthly_reports");
  });
  it("expires January at midnight Bangkok on March 1, with year and leap-day boundaries", () => {
    expect(evidenceRetentionCutoff(new Date("2026-02-28T16:59:59Z"))).toBe("2026-01-01");
    expect(evidenceRetentionCutoff(new Date("2026-02-28T17:00:00Z"))).toBe("2026-02-01");
    expect(evidenceRetentionCutoff(new Date("2027-01-01T00:00:00Z"))).toBe("2026-12-01");
    expect(evidenceRetentionCutoff(new Date("2028-02-29T17:00:00Z"))).toBe("2028-02-01");
  });
  it("requires the server credential, including when an anon JWT passes the gateway", async () => {
    const transport = vi.fn();
    expect((await cleanupTestEvidence(new Request("https://example.test", { method: "POST", headers: { Authorization: "Bearer anon" } }), { url: "https://example.test", key: "server-key" }, transport)).status).toBe(401);
    expect(transport).not.toHaveBeenCalled();
  });
  it("deletes expired objects before purging their work entries", async () => {
    const calls: { url: string; method?: string; body: unknown }[] = [];
    const transport: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(init.body as string) : null });
      if (String(url).includes("line_monthly_reports") || String(url).includes("line_summary_previews")) return Response.json([]);
      if (String(url).includes("line_claim_media")) return Response.json(true);
      if (String(url).includes("line_purge_expired_data")) return Response.json({ entries: JSON.parse(init!.body as string).p_references.length ? 1 : 0, events: 0 });
      if (String(url).includes("select=")) {
        expect(new URL(String(url)).searchParams.get("work_date")).toBe("lt.2026-02-01");
        return Response.json([{ reference: "supabase:" + "a".repeat(64), object_path: "2026/2026-01/person/หลักฐาน/20260131.png" }]);
      }
      return Response.json(null);
    };
    const response = await cleanupTestEvidence(new Request("https://example.test", { method: "POST", headers: { Authorization: `Bearer ${serverToken}` }, body: "{}" }), { url: "https://example.test", key: "server-key" }, transport, new Date("2026-02-28T17:00:00Z"));
    expect(await response.json()).toMatchObject({ cutoff: "2026-02-01", removed: 1 });
    expect(calls.find((call) => call.method === "DELETE")).toMatchObject({ url: "https://example.test/storage/v1/object/ihd-evidence-test", body: { prefixes: ["2026/2026-01/person/หลักฐาน/20260131.png"] } });
    expect(calls.findIndex((call) => call.method === "DELETE")).toBeLessThan(calls.findIndex((call) => call.url.includes("line_purge_expired_data")));
    expect(calls.some((call) => call.url.includes("line_release_media"))).toBe(true);
  });
  it("does not purge data if Storage deletion fails", async () => {
    const methods: string[] = [];
    const transport: typeof fetch = async (url, init) => {
      methods.push(init?.method || "GET");
      if (String(url).includes("line_claim_media")) return Response.json(true);
      if (String(url).includes("select=")) return Response.json([{ reference: "supabase:" + "a".repeat(64), object_path: "sample.png" }]);
      if (init?.method === "DELETE") return new Response(null, { status: 503 });
      return Response.json(null);
    };
    expect((await cleanupTestEvidence(new Request("https://example.test", { method: "POST", headers: { Authorization: `Bearer ${serverToken}` }, body: "{}" }), { url: "https://example.test", key: "server-key" }, transport)).status).toBe(503);
    expect(methods).not.toContain("PATCH");
  });
  it("does not trust a forged service-role claim when the Data API denies access", async () => {
    const calls: string[] = [];
    const transport: typeof fetch = async (url) => { calls.push(String(url)); return new Response(null, { status: 403 }); };
    expect((await cleanupTestEvidence(new Request("https://example.test", { method: "POST", headers: { Authorization: `Bearer ${serverToken}` }, body: "{}" }), { url: "https://example.test", key: "server-key" }, transport)).status).toBe(503);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("line_claim_media");
  });
});
