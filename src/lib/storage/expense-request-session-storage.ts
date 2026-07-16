import { storedExpenseRequestDraftSchema } from "@/schemas/expense-request-form.schema";
import type {
  ExpenseRequestForm,
  StoredExpenseRequestDraft
} from "@/types/expense-request";

export const EXPENSE_REQUEST_DRAFT_STORAGE_KEY =
  "document-generator:expense-request:draft";

export function createStoredExpenseRequestDraft(
  data: ExpenseRequestForm,
  savedAt = new Date().toISOString()
): StoredExpenseRequestDraft {
  return {
    version: 1,
    savedAt,
    data
  };
}

export function parseStoredExpenseRequestDraft(
  rawValue: string | null
): StoredExpenseRequestDraft | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    const result = storedExpenseRequestDraftSchema.safeParse(parsed);

    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function readExpenseRequestDraft() {
  if (typeof window === "undefined") {
    return null;
  }

  return parseStoredExpenseRequestDraft(
    window.sessionStorage.getItem(EXPENSE_REQUEST_DRAFT_STORAGE_KEY)
  );
}

export function writeExpenseRequestDraft(data: ExpenseRequestForm) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    EXPENSE_REQUEST_DRAFT_STORAGE_KEY,
    JSON.stringify(createStoredExpenseRequestDraft(data))
  );
}

export function clearExpenseRequestDraft() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(EXPENSE_REQUEST_DRAFT_STORAGE_KEY);
}
