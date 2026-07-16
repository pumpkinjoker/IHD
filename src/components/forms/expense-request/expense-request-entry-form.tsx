"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ImagePlus, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useFieldArray, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { FieldError } from "@/components/ui/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { calculateExpenseRowTotal, calculateGrandTotal } from "@/lib/calculations/expense";
import { createDefaultExpenseRequestForm, createDefaultExpenseWorkItem } from "@/lib/expense-request/form-defaults";
import { processEvidenceImage } from "@/lib/images/process-evidence-image";
import { findRequesterByKey, masterData } from "@/lib/master-data";
import { formatMoney } from "@/lib/money/format-money";
import { toThaiBahtText } from "@/lib/money/thai-baht-text";
import {
  clearExpenseRequestDraft,
  readExpenseRequestDraft,
  writeExpenseRequestDraft
} from "@/lib/storage/expense-request-session-storage";
import { expenseRequestFormSchema } from "@/schemas/expense-request-form.schema";
import type { ExpenseRequestForm, ExpenseWorkItem } from "@/types/expense-request";

const amountInputOptions = {
  setValueAs: (value: string) => (value === "" ? null : Number(value))
};

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "message" in error) {
    const message = error.message;

    return typeof message === "string" ? message : undefined;
  }

  return undefined;
}

type WorkItemEditorProps = {
  index: number;
  item: ExpenseWorkItem;
  canRemove: boolean;
  fieldId: string;
  form: UseFormReturn<ExpenseRequestForm>;
  onRemove: () => void;
};

function WorkItemEditor({
  index,
  item,
  canRemove,
  fieldId,
  form,
  onRemove
}: WorkItemEditorProps) {
  const [imageError, setImageError] = useState<string>();
  const {
    formState: { errors },
    register,
    setValue
  } = form;
  const itemErrors = errors.workItems?.[index];
  const rowTotal = calculateExpenseRowTotal(item);
  const imageInputId = `evidence-${fieldId}`;

  async function handleEvidenceChange(fileList: FileList | null) {
    const file = fileList?.item(0);

    if (!file) {
      return;
    }

    try {
      setImageError(undefined);
      const processedImage = await processEvidenceImage(file);
      setValue(`workItems.${index}.evidenceImage`, processedImage, {
        shouldDirty: true,
        shouldValidate: true
      });
    } catch (error) {
      setImageError(
        error instanceof Error ? error.message : "ไม่สามารถประมวลผลรูปภาพได้"
      );
    }
  }

  function removeEvidence() {
    setValue(`workItems.${index}.evidenceImage`, null, {
      shouldDirty: true,
      shouldValidate: true
    });
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">รายการที่ {index + 1}</h3>
        <Button
          aria-label={`ลบรายการที่ ${index + 1}`}
          disabled={!canRemove}
          onClick={onRemove}
          variant="outline"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          ลบรายการ
        </Button>
      </div>

      <div className="mt-5 grid gap-5">
        <div>
          <h4 className="mb-3 text-base font-semibold">ข้อมูลงาน</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`work-date-${fieldId}`}>วันที่ปฏิบัติงาน</Label>
              <Input
                id={`work-date-${fieldId}`}
                type="date"
                {...register(`workItems.${index}.workDate`)}
                aria-invalid={Boolean(itemErrors?.workDate)}
              />
              <FieldError message={itemErrors?.workDate?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`subject-${fieldId}`}>หัวข้องาน</Label>
              <Input
                id={`subject-${fieldId}`}
                {...register(`workItems.${index}.subject`)}
                aria-invalid={Boolean(itemErrors?.subject)}
              />
              <FieldError message={itemErrors?.subject?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`start-time-${fieldId}`}>เวลาเริ่มต้น</Label>
              <Input
                id={`start-time-${fieldId}`}
                type="time"
                {...register(`workItems.${index}.startTime`)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`end-time-${fieldId}`}>เวลาสิ้นสุด</Label>
              <Input
                id={`end-time-${fieldId}`}
                type="time"
                {...register(`workItems.${index}.endTime`)}
                aria-invalid={Boolean(itemErrors?.endTime)}
              />
              <FieldError message={itemErrors?.endTime?.message} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={`location-${fieldId}`}>สถานที่</Label>
              <Input
                id={`location-${fieldId}`}
                {...register(`workItems.${index}.location`)}
              />
            </div>

          </div>
        </div>

        <div>
          <h4 className="mb-3 text-base font-semibold">ค่าใช้จ่าย</h4>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor={`travel-from-${fieldId}`}>เดินทางจาก</Label>
              <Input
                id={`travel-from-${fieldId}`}
                {...register(`workItems.${index}.travelFrom`)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`travel-to-${fieldId}`}>เดินทางถึง</Label>
              <Input
                id={`travel-to-${fieldId}`}
                {...register(`workItems.${index}.travelTo`)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`total-km-${fieldId}`}>จำนวนกิโลเมตร</Label>
              <Input
                id={`total-km-${fieldId}`}
                className="decimal-input"
                inputMode="decimal"
                min="0"
                step="0.01"
                type="number"
                {...register(`workItems.${index}.totalKilometers`, amountInputOptions)}
                aria-invalid={Boolean(itemErrors?.totalKilometers)}
              />
              <FieldError message={itemErrors?.totalKilometers?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`fare-${fieldId}`}>ค่าโดยสาร</Label>
              <Input
                id={`fare-${fieldId}`}
                className="decimal-input"
                inputMode="decimal"
                min="0"
                step="0.01"
                type="number"
                {...register(`workItems.${index}.fare`, amountInputOptions)}
                aria-invalid={Boolean(itemErrors?.fare)}
              />
              <FieldError message={itemErrors?.fare?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`accommodation-${fieldId}`}>ค่าที่พัก</Label>
              <Input
                id={`accommodation-${fieldId}`}
                className="decimal-input"
                inputMode="decimal"
                min="0"
                step="0.01"
                type="number"
                {...register(`workItems.${index}.accommodation`, amountInputOptions)}
                aria-invalid={Boolean(itemErrors?.accommodation)}
              />
              <FieldError message={itemErrors?.accommodation?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`per-diem-${fieldId}`}>ค่าเบี้ยเลี้ยง</Label>
              <Input
                id={`per-diem-${fieldId}`}
                className="decimal-input"
                inputMode="decimal"
                min="0"
                step="0.01"
                type="number"
                {...register(`workItems.${index}.perDiem`, amountInputOptions)}
                aria-invalid={Boolean(itemErrors?.perDiem)}
              />
              <FieldError message={itemErrors?.perDiem?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`entertainment-${fieldId}`}>ค่ารับรอง</Label>
              <Input
                id={`entertainment-${fieldId}`}
                className="decimal-input"
                inputMode="decimal"
                min="0"
                step="0.01"
                type="number"
                {...register(`workItems.${index}.entertainment`, amountInputOptions)}
                aria-invalid={Boolean(itemErrors?.entertainment)}
              />
              <FieldError message={itemErrors?.entertainment?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`other-expense-${fieldId}`}>ค่าใช้จ่ายอื่น ๆ</Label>
              <Input
                id={`other-expense-${fieldId}`}
                className="decimal-input"
                inputMode="decimal"
                min="0"
                step="0.01"
                type="number"
                {...register(`workItems.${index}.otherExpense`, amountInputOptions)}
                aria-invalid={Boolean(itemErrors?.otherExpense)}
              />
              <FieldError message={itemErrors?.otherExpense?.message} />
            </div>

            <div className="space-y-2">
              <Label>รวมรายการนี้</Label>
              <div className="flex h-10 items-center rounded-md border border-border bg-muted px-3 text-sm font-semibold">
                {formatMoney(rowTotal)}
              </div>
            </div>
          </div>
        </div>

        <div>
          <h4 className="mb-3 text-base font-semibold">หลักฐานประกอบ</h4>
          <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            <div className="flex h-44 items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted">
              {item.evidenceImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={`หลักฐานรายการที่ ${index + 1}`}
                  className="h-full w-full object-contain"
                  src={item.evidenceImage.dataUrl}
                />
              ) : (
                <span className="px-4 text-center text-sm text-muted-foreground">
                  ยังไม่มีรูปหลักฐาน
                </span>
              )}
            </div>

            <div className="space-y-3">
              <Input
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                id={imageInputId}
                onChange={(event) => {
                  void handleEvidenceChange(event.target.files);
                  event.target.value = "";
                }}
                type="file"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => document.getElementById(imageInputId)?.click()} variant="outline">
                  <ImagePlus aria-hidden="true" className="size-4" />
                  {item.evidenceImage ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
                </Button>
                <Button
                  disabled={!item.evidenceImage}
                  onClick={removeEvidence}
                  variant="ghost"
                >
                  <X aria-hidden="true" className="size-4" />
                  ลบรูป
                </Button>
              </div>
              {item.evidenceImage ? (
                <p className="text-sm text-muted-foreground">
                  ไฟล์: {item.evidenceImage.fileName}
                </p>
              ) : null}
              <FieldError
                message={
                  imageError ?? getErrorMessage(itemErrors?.evidenceImage)
                }
              />
              <p className="text-sm text-muted-foreground">
                รองรับ JPG, PNG และ WebP ขนาดไม่เกิน 8 MB
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ExpenseRequestEntryForm() {
  const router = useRouter();
  const storageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isRestored, setIsRestored] = useState(false);
  const form = useForm<ExpenseRequestForm>({
    resolver: zodResolver(expenseRequestFormSchema),
    defaultValues: createDefaultExpenseRequestForm(),
    shouldFocusError: true
  });
  const {
    control,
    formState: { errors },
    getValues,
    handleSubmit,
    register,
    reset,
  } = form;
  const { append, fields, remove } = useFieldArray({
    control,
    name: "workItems"
  });
  const watchedItems = useWatch({ control, name: "workItems" });
  const watchedForm = useWatch({ control });
  const requesterKey = useWatch({ control, name: "requesterKey" });
  const selectedRequester = useMemo(
    () => findRequesterByKey(requesterKey),
    [requesterKey]
  );
  const grandTotal = calculateGrandTotal(watchedItems ?? []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedDraft = readExpenseRequestDraft();

      if (storedDraft) {
        reset(storedDraft.data);
      }

      setIsRestored(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [reset]);

  useEffect(() => {
    if (!isRestored) {
      return;
    }

    if (storageTimerRef.current) {
      clearTimeout(storageTimerRef.current);
    }

    storageTimerRef.current = setTimeout(() => {
      writeExpenseRequestDraft(getValues());
    }, 350);

    return () => {
      if (storageTimerRef.current) {
        clearTimeout(storageTimerRef.current);
      }
    };
  }, [getValues, isRestored, watchedForm]);

  function handleReset() {
    clearExpenseRequestDraft();
    reset(createDefaultExpenseRequestForm());
  }

  function handleInvalidSubmit() {
    requestAnimationFrame(() => {
      const invalidElement = document.querySelector<HTMLElement>(
        "[aria-invalid='true']"
      );

      invalidElement?.scrollIntoView({ block: "center", behavior: "smooth" });
      invalidElement?.focus();
    });
  }

  function handleValidSubmit(data: ExpenseRequestForm) {
    writeExpenseRequestDraft(data);
    router.push("/documents/expense-request/preview");
  }

  return (
    <form
      className="space-y-8"
      onSubmit={handleSubmit(handleValidSubmit, handleInvalidSubmit)}
    >
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold">ข้อมูลเอกสาร</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="requesterKey">ผู้ขอเบิก</Label>
            <Select
              id="requesterKey"
              {...register("requesterKey")}
              aria-invalid={Boolean(errors.requesterKey)}
            >
              <option value="">เลือกผู้ขอเบิก</option>
              {masterData.team.map((member) => (
                <option key={member.employeeId} value={member.employeeId}>
                  {member.name}
                </option>
              ))}
            </Select>
            <FieldError message={errors.requesterKey?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="documentDate">วันที่เอกสาร</Label>
            <Input
              id="documentDate"
              type="date"
              {...register("documentDate")}
              aria-invalid={Boolean(errors.documentDate)}
            />
            <FieldError message={errors.documentDate?.message} />
          </div>
        </div>

        <div className="mt-5 rounded-md border border-border bg-muted p-4">
          <h3 className="font-semibold">ข้อมูลผู้ขอเบิก</h3>
          {selectedRequester ? (
            <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">ชื่อ</dt>
                <dd className="font-medium">{selectedRequester.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">รหัสพนักงาน</dt>
                <dd className="font-medium">{selectedRequester.employeeId}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">อีเมล</dt>
                <dd className="font-medium">{selectedRequester.email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">ตำแหน่ง</dt>
                <dd className="font-medium">{selectedRequester.position}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">แผนก</dt>
                <dd className="font-medium">{selectedRequester.department}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              เลือกผู้ขอเบิกเพื่อแสดงข้อมูลพนักงาน
            </p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <div>
            <h2 className="text-xl font-semibold">รายการงานและค่าใช้จ่าย</h2>
            <p className="text-sm text-muted-foreground">
              เพิ่มรายการงานและแนบรูปหลักฐาน 1 รูปต่อรายการ
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {fields.map((field, index) => (
            <WorkItemEditor
              canRemove={fields.length > 1}
              fieldId={field.id}
              form={form}
              index={index}
              item={watchedItems?.[index] ?? field}
              key={field.id}
              onRemove={() => remove(index)}
            />
          ))}
          <div className="flex justify-end">
            <Button onClick={() => append(createDefaultExpenseWorkItem())}>
              <Plus aria-hidden="true" className="size-4" />
              เพิ่มรายการงาน
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold">สรุปค่าใช้จ่าย</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">ยอดรวมทั้งหมด</dt>
            <dd className="text-2xl font-semibold">{formatMoney(grandTotal)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">จำนวนเงินเป็นตัวอักษร</dt>
            <dd className="text-lg font-semibold">{toThaiBahtText(grandTotal)}</dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-wrap justify-end gap-3">
        <Button onClick={handleReset} variant="outline">
          <RotateCcw aria-hidden="true" className="size-4" />
          ล้างข้อมูล
        </Button>
        <Button type="submit">
          <Check aria-hidden="true" className="size-4" />
          ยืนยันและดูตัวอย่าง
        </Button>
      </div>
    </form>
  );
}
