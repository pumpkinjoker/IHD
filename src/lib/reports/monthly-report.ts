import { z } from "zod";
import { expenseWorkItemDraftSchema } from "@/schemas/expense-request-form.schema";
import { evidenceImageSchema } from "@/schemas/expense-request-form.schema";
import { createDefaultExpenseWorkItem } from "@/lib/expense-request/form-defaults";
import type { ExpenseWorkItem } from "@/types/expense-request";
import type { TeamMember } from "@/types/master-data";

export const REPORT_STORAGE_ORIGIN = "https://pqyvtdvskovhbsjduskr.supabase.co";
export const REPORT_BUCKET = "ihd-monthly-reports";
function isSignedAsset(value: string, buckets: string[]) {
  try {
    const url = new URL(value);
    return url.origin === REPORT_STORAGE_ORIGIN && !url.username && !url.password
      && buckets.some((bucket) => url.pathname.startsWith(`/storage/v1/object/sign/${bucket}/`)) && Boolean(url.searchParams.get("token"));
  } catch { return false; }
}
export const isReportAsset = (value: string) => isSignedAsset(value, [REPORT_BUCKET]);
const signedUrlSchema = z.string().refine((value) => isSignedAsset(value, [REPORT_BUCKET, "ihd-evidence-test"]));
const requesterSchema = z.object({ employeeId: z.string().regex(/^\d{8}$/), firstName: z.string(), lastName: z.string(), name: z.string(), email: z.email(), position: z.string(), department: z.string() });
export const monthlyReportSchema = z.object({
  version: z.literal(1), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  title: z.string(), expiresAt: z.iso.datetime(), requester: requesterSchema,
  preview: z.boolean().optional().default(false),
  draft: z.object({ teamKey: z.string(), requesterKey: z.string(), documentDate: z.string(),
    workItems: z.array(expenseWorkItemDraftSchema.extend({ evidenceImage: evidenceImageSchema.extend({ dataUrl: signedUrlSchema }).nullable() })).min(1).max(31) })
}).superRefine((report, ctx) => {
  if (report.requester.employeeId !== report.draft.requesterKey || report.draft.workItems.some((item) => !item.workDate.startsWith(report.month + "-")))
    ctx.addIssue({ code: "custom", message: "Report ownership or period mismatch" });
});
export type MonthlyReport = z.infer<typeof monthlyReportSchema>;
export function monthlyReportTitle(month: string) {
  return `สรุปยอดเบิกเบี้ยเลี้ยงเดือน${new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${month}-01T00:00:00+07:00`))}`;
}
export function reportRequester(employee: { employee_id: string; name: string; email: string; team: string; position: string }): TeamMember {
  const [firstName, ...rest] = employee.name.trim().split(/\s+/);
  return { employeeId: employee.employee_id, name: employee.name, firstName, lastName: rest.join(" "), email: employee.email, position: employee.position, department: employee.team };
}
export function reportWorkItem(row: { id: string; data: { workDate: string; subject: string; location: string; expense?: Partial<ExpenseWorkItem> } }): ExpenseWorkItem {
  return { ...createDefaultExpenseWorkItem(), ...row.data.expense, id: row.id, workDate: row.data.workDate, subject: row.data.subject, location: row.data.location, evidenceImage: null, evidenceExpired: false };
}
