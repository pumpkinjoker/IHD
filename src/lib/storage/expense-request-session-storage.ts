import { storedExpenseRequestDraftSchema } from "@/schemas/expense-request-form.schema";
import { findTeamByRequesterKey } from "@/lib/master-data";
import type {
  ExpenseRequestForm,
  StoredExpenseRequestDraft
} from "@/types/expense-request";

export const EXPENSE_REQUEST_DRAFT_STORAGE_KEY =
  "document-generator:expense-request:draft";

const LEGACY_REQUESTER_KEYS: Record<string, string> = {
  "60112369": "11260369"
};

let volatileDraft: StoredExpenseRequestDraft | null = null;

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

    if (!result.success) {
      return null;
    }

    const requesterKey =
      LEGACY_REQUESTER_KEYS[result.data.data.requesterKey] ??
      result.data.data.requesterKey;
    const team = requesterKey ? findTeamByRequesterKey(requesterKey) : null;

    return {
      ...result.data,
      data: {
        ...result.data.data,
        requesterKey: team ? requesterKey : "",
        teamKey: team?.key ?? result.data.data.teamKey
      }
    };
  } catch {
    return null;
  }
}

export function readExpenseRequestDraft() {
  if (typeof window === "undefined") {
    return null;
  }

  if (volatileDraft) {
    return volatileDraft;
  }

  try {
    return parseStoredExpenseRequestDraft(
      window.sessionStorage.getItem(EXPENSE_REQUEST_DRAFT_STORAGE_KEY)
    );
  } catch {
    return null;
  }
}

export function writeExpenseRequestDraft(data: ExpenseRequestForm) {
  if (typeof window === "undefined") {
    return false;
  }

  const storedDraft = createStoredExpenseRequestDraft(data);
  volatileDraft = storedDraft;

  try {
    window.sessionStorage.setItem(
      EXPENSE_REQUEST_DRAFT_STORAGE_KEY,
      JSON.stringify(storedDraft)
    );
    return true;
  } catch {
    return false;
  }
}

export function clearExpenseRequestDraft() {
  if (typeof window === "undefined") {
    return;
  }

  volatileDraft = null;

  try {
    window.sessionStorage.removeItem(EXPENSE_REQUEST_DRAFT_STORAGE_KEY);
  } catch {
    // The in-memory draft has already been cleared.
  }
}
