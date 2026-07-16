import type { ExpenseRequestForm, ExpenseWorkItem } from "@/types/expense-request";

function createWorkItemId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `work-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createDefaultExpenseWorkItem(): ExpenseWorkItem {
  return {
    id: createWorkItemId(),
    workDate: "",
    subject: "",
    startTime: "08:00",
    endTime: "17:00",
    location: "",
    travelFrom: "",
    travelTo: "",
    totalKilometers: null,
    fare: null,
    accommodation: null,
    perDiem: 300,
    entertainment: null,
    otherExpense: null,
    evidenceImage: null
  };
}

export function createDefaultExpenseRequestForm(): ExpenseRequestForm {
  return {
    requesterKey: "",
    documentDate: "",
    workItems: [createDefaultExpenseWorkItem()]
  };
}
