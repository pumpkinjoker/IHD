import { z } from "zod";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .or(z.literal(""));
const optionalAmountSchema = z
  .number()
  .nonnegative("กรุณากรอกจำนวนที่ไม่ติดลบ")
  .nullable();

const draftDateSchema = isoDateSchema.or(z.literal(""));
const textSchema = z.string();

export const evidenceImageSchema = z
  .object({
    fileName: z.string().min(1),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    dataUrl: z.string().startsWith("data:image/")
  })
  .strict();

export const expenseWorkItemDraftSchema = z
  .object({
    id: z.string().min(1),
    workDate: draftDateSchema,
    subject: textSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    location: textSchema,
    travelFrom: textSchema,
    travelTo: textSchema,
    totalKilometers: optionalAmountSchema,
    fare: optionalAmountSchema,
    accommodation: optionalAmountSchema,
    perDiem: optionalAmountSchema,
    entertainment: optionalAmountSchema,
    otherExpense: optionalAmountSchema,
    evidenceImage: evidenceImageSchema.nullable()
  })
  .strip();

export const expenseRequestDraftDataSchema = z
  .object({
    requesterKey: textSchema,
    documentDate: draftDateSchema,
    workItems: z.array(expenseWorkItemDraftSchema).min(1)
  })
  .strict();

export const expenseWorkItemSchema = expenseWorkItemDraftSchema.superRefine(
  (item, ctx) => {
    if (!item.workDate) {
      ctx.addIssue({
        code: "custom",
        path: ["workDate"],
        message: "กรุณาเลือกวันที่ปฏิบัติงาน"
      });
    }

    if (!item.subject.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["subject"],
        message: "กรุณากรอกหัวข้องาน"
      });
    }

    if (item.startTime && item.endTime && item.startTime > item.endTime) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "เวลาเริ่มต้นต้องไม่ช้ากว่าเวลาสิ้นสุด"
      });
    }

    if (!item.evidenceImage) {
      ctx.addIssue({
        code: "custom",
        path: ["evidenceImage"],
        message: "กรุณาแนบรูปหลักฐาน 1 รูป"
      });
    }
  }
);

export const expenseRequestFormSchema = expenseRequestDraftDataSchema
  .extend({
    requesterKey: z.string().min(1, "กรุณาเลือกผู้ขอเบิก"),
    documentDate: draftDateSchema,
    workItems: z.array(expenseWorkItemSchema).min(1, "กรุณาเพิ่มรายการงาน")
  })
  .superRefine((form, ctx) => {
    if (!form.documentDate) {
      ctx.addIssue({
        code: "custom",
        path: ["documentDate"],
        message: "กรุณาเลือกวันที่เอกสาร"
      });
    }
  });

export const storedExpenseRequestDraftSchema = z
  .object({
    version: z.literal(1),
    savedAt: z.string().datetime(),
    data: expenseRequestDraftDataSchema
  })
  .strict();

export type ExpenseRequestFormInput = z.infer<typeof expenseRequestFormSchema>;
