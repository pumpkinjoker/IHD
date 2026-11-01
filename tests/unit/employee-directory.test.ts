import { expect, it, vi } from "vitest";
import { loadExpenseTeams } from "@/lib/expense-request/directory.server";
import { findRequesterByKey, findTeamByRequesterKey } from "@/lib/master-data";
import { createStoredExpenseRequestDraft, parseStoredExpenseRequestDraft } from "@/lib/storage/expense-request-session-storage";
import { createDefaultExpenseRequestForm } from "@/lib/expense-request/form-defaults";

const env = { NODE_ENV: "production" as const, VERCEL: "1", SUPABASE_URL: "https://database.example", SUPABASE_SERVICE_ROLE_KEY: "test-server-key" };
const employee = { employee_id: "00000042", name: "ทดสอบ รายชื่อใหม่", english_name: "Test Employee", email: "test@example.com", team: "Field Operations", position: "S2" };

it("loads active database staff into web teams, lookup and restored document drafts", async () => {
  const transport = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    expect(url.pathname).toBe("/rest/v1/ihd_employee_directory");
    expect(url.searchParams.get("active")).toBe("eq.true");
    expect(init?.cache).toBe("no-store");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-server-key");
    return Response.json([employee]);
  });
  const teams = await loadExpenseTeams(env, transport);
  expect(teams).toHaveLength(1);
  const member = findRequesterByKey(employee.employee_id, teams);
  expect(member).toMatchObject({ name: employee.name, email: employee.email, englishName: employee.english_name, department: employee.team });
  expect(findTeamByRequesterKey(employee.employee_id, teams)?.key).toBe(teams[0].key);
  const stored = createStoredExpenseRequestDraft({ ...createDefaultExpenseRequestForm(), requesterKey: employee.employee_id, teamKey: teams[0].key });
  expect(parseStoredExpenseRequestDraft(JSON.stringify(stored), teams)?.data.requesterKey).toBe(employee.employee_id);
  expect(JSON.stringify(teams)).not.toContain(env.SUPABASE_SERVICE_ROLE_KEY);
});
it("keeps existing team keys when names match the directory", async () => {
  const teams = await loadExpenseTeams(env, async () => Response.json([{ ...employee, team: "Corporate Marketing" }]));
  expect(teams[0].key).toBe("corporate-marketing");
});
it("does not silently replace a failing production database with old source data", async () => {
  await expect(loadExpenseTeams(env, async () => new Response(null, { status: 503 }))).rejects.toThrow("unavailable");
  await expect(loadExpenseTeams({ NODE_ENV: "production", VERCEL: "1" })).rejects.toThrow("not configured");
});
