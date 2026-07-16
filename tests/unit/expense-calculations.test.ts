import { describe, expect, it } from "vitest";
import {
  calculateExpenseRowTotal,
  calculateGrandTotal,
  normalizeAmount
} from "@/lib/calculations/expense";
import type { ExpenseWorkItem } from "@/types/expense-request";

const baseWorkItem: ExpenseWorkItem = {
  id: "work-1",
  workDate: "2026-07-16",
  subject: "ถ่ายวิดีโอ",
  startTime: "08:00",
  endTime: "17:00",
  location: "Marketing",
  travelFrom: "",
  travelTo: "",
  totalKilometers: null,
  fare: null,
  accommodation: null,
  perDiem: null,
  entertainment: null,
  otherExpense: null,
  evidenceImage: {
    fileName: "evidence.png",
    mimeType: "image/png",
    dataUrl: "data:image/png;base64,test"
  }
};

describe("expense calculations", () => {
  it("treats empty amount values as zero", () => {
    expect(normalizeAmount(null)).toBe(0);
    expect(calculateExpenseRowTotal(baseWorkItem)).toBe(0);
  });

  it("calculates row total from expense fields", () => {
    expect(
      calculateExpenseRowTotal({
        ...baseWorkItem,
        fare: 100,
        accommodation: 400,
        perDiem: 300,
        entertainment: 50,
        otherExpense: 25
      })
    ).toBe(875);
  });

  it("calculates grand total from all work items", () => {
    expect(
      calculateGrandTotal([
        { ...baseWorkItem, id: "work-1", perDiem: 300 },
        { ...baseWorkItem, id: "work-2", fare: 200, otherExpense: 100 }
      ])
    ).toBe(600);
  });
});
