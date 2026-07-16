import { describe, expect, it } from "vitest";
import { isValidTimeRange } from "@/lib/dates/date-utils";
import { expenseRequestFormSchema } from "@/schemas/expense-request-form.schema";
import type { ExpenseRequestForm } from "@/types/expense-request";

const validForm: ExpenseRequestForm = {
  requesterKey: "60112112",
  documentDate: "2026-07-16",
  workItems: [
    {
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
      perDiem: 300,
      entertainment: null,
      otherExpense: null,
      evidenceImage: {
        fileName: "evidence.png",
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,test"
      }
    }
  ]
};

describe("expense request validation", () => {
  it("accepts valid form data", () => {
    expect(expenseRequestFormSchema.safeParse(validForm).success).toBe(true);
  });

  it("rejects negative amount values", () => {
    const result = expenseRequestFormSchema.safeParse({
      ...validForm,
      workItems: [{ ...validForm.workItems[0], perDiem: -1 }]
    });

    expect(result.success).toBe(false);
  });

  it("requires a subject", () => {
    const result = expenseRequestFormSchema.safeParse({
      ...validForm,
      workItems: [{ ...validForm.workItems[0], subject: "" }]
    });

    expect(result.success).toBe(false);
  });

  it("requires a valid time range when both times are present", () => {
    expect(isValidTimeRange("08:00", "17:00")).toBe(true);
    expect(isValidTimeRange("17:00", "08:00")).toBe(false);

    const result = expenseRequestFormSchema.safeParse({
      ...validForm,
      workItems: [
        { ...validForm.workItems[0], startTime: "17:00", endTime: "08:00" }
      ]
    });

    expect(result.success).toBe(false);
  });
});
