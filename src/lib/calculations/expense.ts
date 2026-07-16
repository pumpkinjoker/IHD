import type { ExpenseRequestForm, ExpenseWorkItem } from "@/types/expense-request";

export type ExpenseAmountValue = number | null | undefined;

export function normalizeAmount(value: ExpenseAmountValue) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return value;
}

export function calculateExpenseRowTotal(item: Pick<
  ExpenseWorkItem,
  "fare" | "accommodation" | "perDiem" | "entertainment" | "otherExpense"
>) {
  return (
    normalizeAmount(item.fare) +
    normalizeAmount(item.accommodation) +
    normalizeAmount(item.perDiem) +
    normalizeAmount(item.entertainment) +
    normalizeAmount(item.otherExpense)
  );
}

export function calculateGrandTotal(workItems: ExpenseRequestForm["workItems"]) {
  return workItems.reduce(
    (total, item) => total + calculateExpenseRowTotal(item),
    0
  );
}
