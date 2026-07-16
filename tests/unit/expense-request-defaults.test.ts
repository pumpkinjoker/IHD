import { describe, expect, it } from "vitest";
import { calculateExpenseRowTotal } from "@/lib/calculations/expense";
import { createDefaultExpenseWorkItem } from "@/lib/expense-request/form-defaults";

describe("expense request defaults", () => {
  it("creates new work items with default work times and per diem", () => {
    const workItem = createDefaultExpenseWorkItem();

    expect(workItem.startTime).toBe("08:00");
    expect(workItem.endTime).toBe("17:00");
    expect(workItem.totalKilometers).toBeNull();
    expect(workItem.perDiem).toBe(300);
    expect(calculateExpenseRowTotal(workItem)).toBe(300);
  });
});
