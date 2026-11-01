import type { EmployeeWorkEntry } from "./employee-intake";
import type { ExpenseWorkItem } from "@/types/expense-request";
export type ExpenseEntry = EmployeeWorkEntry & { expense?: Partial<ExpenseWorkItem> };
export function hasExpenseKind(entry: ExpenseEntry, kind: "work" | "accommodation") {
  return kind === "work" ? entry.kind !== "accommodation" : entry.accommodation !== undefined || entry.expense?.accommodation != null;
}
