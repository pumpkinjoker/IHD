import { describe, expect, it } from "vitest";
import {
  createStoredExpenseRequestDraft,
  parseStoredExpenseRequestDraft
} from "@/lib/storage/expense-request-session-storage";
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

describe("expense request storage", () => {
  it("validates stored draft shape", () => {
    const storedDraft = createStoredExpenseRequestDraft(
      validForm,
      "2026-07-16T00:00:00.000Z"
    );

    expect(parseStoredExpenseRequestDraft(JSON.stringify(storedDraft))?.data).toEqual(
      validForm
    );
  });

  it("safely ignores corrupted session data", () => {
    expect(parseStoredExpenseRequestDraft("not json")).toBeNull();
    expect(
      parseStoredExpenseRequestDraft(
        JSON.stringify({ version: 99, savedAt: "bad", data: {} })
      )
    ).toBeNull();
  });

  it("strips legacy work description values from stored drafts", () => {
    const storedDraft = createStoredExpenseRequestDraft(
      validForm,
      "2026-07-16T00:00:00.000Z"
    );

    const parsedDraft = parseStoredExpenseRequestDraft(
      JSON.stringify({
        ...storedDraft,
        data: {
          ...storedDraft.data,
          workItems: [
            {
              ...storedDraft.data.workItems[0],
              description: "legacy detail"
            }
          ]
        }
      })
    );

    expect(parsedDraft?.data.workItems[0]).not.toHaveProperty("description");
  });
});
