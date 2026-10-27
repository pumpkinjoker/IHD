import { afterEach, expect, it, vi } from "vitest";
import { allowsExpenseRecords, allowsLocalTest } from "@/lib/line/local-test-access";
afterEach(() => vi.unstubAllEnvs());
it("allows the member form on a configured deployment while keeping admin/test APIs local", () => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL", "1");
  vi.stubEnv("LINE_DATABASE_MODE", "supabase"); vi.stubEnv("LINE_MEDIA_MODE", "supabase");
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-only");
  const request = new Request("https://ihd.example/api/expense-records", { method: "POST", headers: { origin: "https://ihd.example", "sec-fetch-site": "same-origin" } });
  expect(allowsExpenseRecords(request)).toBe(true);
  expect(allowsLocalTest(request)).toBe(false);
  expect(allowsExpenseRecords(new Request(request, { headers: { origin: "https://other.example", "sec-fetch-site": "cross-site" } }))).toBe(false);
  expect(allowsExpenseRecords(new Request(request, { headers: {} }))).toBe(false);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  expect(allowsExpenseRecords(request)).toBe(false);
});
