"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent
} from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ImagePlus, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useFieldArray, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { FieldError } from "@/components/ui/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import { calculateExpenseRowTotal, calculateGrandTotal } from "@/lib/calculations/expense";
import { createDefaultExpenseRequestForm, createDefaultExpenseWorkItem } from "@/lib/expense-request/form-defaults";
import { processEvidenceImage } from "@/lib/images/process-evidence-image";
import { findTeamByKey, findTeamByRequesterKey, getRequesterKey, masterData } from "@/lib/master-data";
import { formatMoney } from "@/lib/money/format-money";
import { toThaiBahtText } from "@/lib/money/thai-baht-text";
import { cn } from "@/lib/utils";
import { previousExpenseMonth, isAvailableExpenseMonth } from "@/lib/dates/expense-period";
import { bangkokDate } from "@/lib/line/intake";
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
const CLOUD_SCOPE_KEY = "ihd-expense-cloud-scope";
const SELECTED_MONTH_KEY = "ihd-expense-selected-month";
const isExpenseMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

async function recordsResponse(response: Response) {
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || "โหลดข้อมูลไม่สำเร็จ เว็บอาจยังไม่พร้อมเชื่อมฐานข้อมูล กรุณาลองใหม่หรือติดต่อผู้ดูแล");
  return result;
}

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
  month: string;
  requiresWorkTime: boolean;
};

function WorkItemEditor({
  index,
  item,
  canRemove,
  fieldId,
  form,
  onRemove,
  month,
  requiresWorkTime
}: WorkItemEditorProps) {
  const [imageError, setImageError] = useState<string>();
  const [isDraggingEvidence, setIsDraggingEvidence] = useState(false);
  const {
    formState: { errors },
    register,
    setValue
  } = form;
  const itemErrors = errors.workItems?.[index];
  const rowTotal = calculateExpenseRowTotal(item);
  const imageInputId = `evidence-${fieldId}`;
  const workMonth = month;
  const monthEnd = new Date(Date.UTC(Number(workMonth.slice(0, 4)), Number(workMonth.slice(5)), 0)).toISOString().slice(0, 10);

  async function handleEvidenceFile(file: File | null) {
    if (!file || item.evidenceExpired) {
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

  function handleEvidenceChange(fileList: FileList | null) {
    void handleEvidenceFile(fileList?.item(0) ?? null);
  }

  function handleEvidenceDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer.types.includes("Files")) {
      setIsDraggingEvidence(true);
    }
  }

  function handleEvidenceDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingEvidence(false);
    }
  }

  function handleEvidenceDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleEvidenceDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingEvidence(false);

    handleEvidenceChange(event.dataTransfer.files);
  }

  function handleEvidencePaste(event: ClipboardEvent<HTMLDivElement>) {
    const imageFile = Array.from(event.clipboardData.items)
      .find((item) => item.kind === "file" && item.type.startsWith("image/"))
      ?.getAsFile();

    if (!imageFile) {
      return;
    }

    event.preventDefault();
    void handleEvidenceFile(imageFile);
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
                min={`${workMonth}-01`}
                max={monthEnd}
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
                required={requiresWorkTime && !item.accommodationOnly}
                type="time"
                {...register(`workItems.${index}.startTime`)}
                aria-invalid={Boolean(itemErrors?.startTime)}
              />
              <FieldError message={itemErrors?.startTime?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`end-time-${fieldId}`}>เวลาสิ้นสุด</Label>
              <Input
                id={`end-time-${fieldId}`}
                required={requiresWorkTime && !item.accommodationOnly}
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
          <div
            aria-label={`พื้นที่แนบรูปหลักฐานรายการที่ ${index + 1}`}
            className={cn(
              "grid gap-4 rounded-md border border-dashed border-border p-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:grid-cols-[240px_1fr]",
              isDraggingEvidence && "border-primary bg-primary/5"
            )}
            data-testid="evidence-drop-zone"
            onDragEnter={handleEvidenceDragEnter}
            onDragLeave={handleEvidenceDragLeave}
            onDragOver={handleEvidenceDragOver}
            onDrop={handleEvidenceDrop}
            onPaste={handleEvidencePaste}
            tabIndex={0}
          >
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
                  {item.accommodationOnly ? "เบิกค่าที่พัก ไม่ต้องแนบรูปภาพ" : item.evidenceExpired ? "รูปถูกลบเมื่อขึ้นเดือนที่ 3แล้ว" : "ยังไม่มีรูปหลักฐาน"}
                </span>
              )}
            </div>

            <div className="space-y-3">
              <Input
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                id={imageInputId}
                onChange={(event) => {
                  handleEvidenceChange(event.target.files);
                  event.target.value = "";
                }}
                type="file"
              />
              <div className="flex flex-wrap gap-2">
                <Button disabled={item.evidenceExpired || item.accommodationOnly} onClick={() => document.getElementById(imageInputId)?.click()} variant="outline">
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
                คลิกบริเวณนี้แล้ววางรูปด้วย Cmd+V หรือ Ctrl+V ลากไฟล์มาวาง
                หรือเลือกจากเครื่อง รองรับ JPG, PNG และ WebP ขนาดไม่เกิน 8 MB
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ExpenseRequestEntryForm({ teams = masterData.teams }: { teams?: import("@/types/master-data").Team[] }) {
  const router = useRouter();
  const storageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isRestored, setIsRestored] = useState(false);
  const [cloudScope, setCloudScope] = useState<{ employeeId: string; month: string; reportToken?: string } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => bangkokDate(new Date()).slice(0, 7));
  const [pendingMonth, setPendingMonth] = useState<string | null>(null);
  const month = cloudScope?.month ?? selectedMonth;
  const monthLabel = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${month}-01T00:00:00+07:00`));
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudMessage, setCloudMessage] = useState("");
  const [pendingRemove, setPendingRemove] = useState<number | null>(null);
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
    setValue,
  } = form;
  const { append, fields, remove } = useFieldArray({
    control,
    name: "workItems"
  });
  const watchedItems = useWatch({ control, name: "workItems" });
  const watchedForm = useWatch({ control });
  const teamKey = useWatch({ control, name: "teamKey" });
  const requesterKey = useWatch({ control, name: "requesterKey" });
  const selectedTeam = useMemo(() => findTeamByKey(teamKey, teams), [teamKey, teams]);
  const selectedRequester = useMemo(
    () =>
      selectedTeam?.members.find(
        (member) => getRequesterKey(member) === requesterKey
      ) ?? null,
    [requesterKey, selectedTeam]
  );
  const teamOptions = useMemo(
    () =>
      teams.map((team) => ({
        value: team.key,
        label: team.name
      })),
    [teams]
  );
  const requesterOptions = useMemo(
    () =>
      selectedTeam?.members.map((member) => ({
        value: member.employeeId,
        label: member.name,
        keywords: `${member.firstName} ${member.lastName} ${member.employeeId} ${member.email}`
      })) ?? [],
    [selectedTeam]
  );
  const grandTotal = calculateGrandTotal(watchedItems ?? []);

  useEffect(() => {
    const abort = new AbortController();
    const restore = async () => {
      const reportToken = new URLSearchParams(window.location.hash.slice(1)).get("report");
      if (reportToken) {
        setCloudBusy(true);
        setCloudMessage("กำลังเปิดรายการของเอกสาร…");
        try {
          if (!/^[A-Za-z0-9_-]{22}$/.test(reportToken)) throw new Error("ลิงก์แก้ไขเอกสารไม่ถูกต้อง");
          const response = await fetch("/api/expense-records", { headers: { "x-report-token": reportToken }, cache: "no-store", signal: abort.signal });
          const result = await recordsResponse(response);
          const team = findTeamByRequesterKey(result.employeeId, teams);
          if (!team || !/^\d{4}-(0[1-9]|1[0-2])$/.test(result.month) || !Array.isArray(result.items) || result.items.some((item: ExpenseWorkItem) => !item.workDate?.startsWith(`${result.month}-`))) throw new Error("ข้อมูลเอกสารไม่ครบ กรุณาติดต่อผู้ดูแล");
          if (!result.items.length) throw new Error("ไม่พบรายการในเดือนของเอกสาร");
          if (abort.signal.aborted) return;
          reset({ teamKey: team.key, requesterKey: result.employeeId, documentDate: bangkokDate(new Date()), workItems: result.items });
          const scope = { employeeId: result.employeeId, month: result.month, reportToken };
          setCloudScope(scope);
          try { sessionStorage.setItem(CLOUD_SCOPE_KEY, JSON.stringify(scope)); } catch {}
          setCloudMessage(`โหลดแล้ว ${result.items.length} รายการ แก้ไขข้อมูลในฟอร์มด้านล่างได้เลย`);
        } catch (error) {
          if (!abort.signal.aborted) setCloudMessage(error instanceof Error ? error.message : "เปิดเอกสารไม่สำเร็จ");
        } finally {
          if (!abort.signal.aborted) { setCloudBusy(false); setIsRestored(true); }
        }
        return;
      }
      let savedMonth = "";
      try { savedMonth = sessionStorage.getItem(SELECTED_MONTH_KEY) || ""; } catch {}
      if (isExpenseMonth(savedMonth)) setSelectedMonth(savedMonth);
      const storedDraft = readExpenseRequestDraft(teams);
      if (storedDraft) {
        const currentMonth = bangkokDate(new Date()).slice(0, 7);
        let scope: { employeeId: string; month: string; reportToken?: string } | null = null;
        try { scope = JSON.parse(sessionStorage.getItem(CLOUD_SCOPE_KEY) || "null"); } catch {}
        const linked = scope?.employeeId === storedDraft.data.requesterKey && /^[A-Za-z0-9_-]{22}$/.test(scope?.reportToken || "") && /^\d{4}-(0[1-9]|1[0-2])$/.test(scope?.month || "");
        const draftMonth = linked || (scope?.employeeId === storedDraft.data.requesterKey && isAvailableExpenseMonth(scope.month)) ? scope!.month
          : isExpenseMonth(savedMonth) ? savedMonth : storedDraft.data.workItems.find(item => item.workDate)?.workDate.slice(0, 7) || currentMonth;
        setSelectedMonth(draftMonth);
        const workItems = storedDraft.data.workItems.filter((item) => !item.workDate || item.workDate.startsWith(`${draftMonth}-`));
        reset({ ...storedDraft.data, workItems: workItems.length ? workItems : [createDefaultExpenseWorkItem()] });
        if (scope && (linked || isAvailableExpenseMonth(scope.month)) && scope.employeeId === storedDraft.data.requesterKey && scope.month === draftMonth
          && storedDraft.data.workItems.every((item) => (!item.workDate && item.isNew) || item.workDate.startsWith(`${draftMonth}-`))) setCloudScope(scope);
      }
      setIsRestored(true);
    };
    const timer = window.setTimeout(() => { void restore(); }, 0);
    return () => { window.clearTimeout(timer); abort.abort(); };
  }, [reset, teams]);

  useEffect(() => {
    if (!isRestored) {
      return;
    }

    if (storageTimerRef.current) {
      clearTimeout(storageTimerRef.current);
    }

    storageTimerRef.current = setTimeout(() => {
      writeExpenseRequestDraft(getValues());
      try { sessionStorage.setItem(SELECTED_MONTH_KEY, month); } catch {}
    }, 350);

    return () => {
      if (storageTimerRef.current) {
        clearTimeout(storageTimerRef.current);
      }
    };
  }, [getValues, isRestored, watchedForm, month]);

  function handleReset() {
    try { sessionStorage.removeItem(CLOUD_SCOPE_KEY); } catch {}
    window.history.replaceState(null, "", window.location.pathname);
    setCloudScope(null);
    setPendingRemove(null);
    setPendingMonth(null);
    setSelectedMonth(bangkokDate(new Date()).slice(0, 7));
    try { sessionStorage.removeItem(SELECTED_MONTH_KEY); } catch {}
    setCloudMessage("");
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

  function changeMonth(nextMonth: string) {
    const data = { ...getValues(), workItems: [createDefaultExpenseWorkItem()] };
    if (storageTimerRef.current) clearTimeout(storageTimerRef.current);
    setSelectedMonth(nextMonth);
    setCloudScope(null);
    setPendingRemove(null);
    setPendingMonth(null);
    setCloudMessage("");
    reset(data);
    writeExpenseRequestDraft(data);
    try {
      sessionStorage.setItem(SELECTED_MONTH_KEY, nextMonth);
      sessionStorage.removeItem(CLOUD_SCOPE_KEY);
    } catch {}
  }

  function requestMonthChange(nextMonth: string) {
    if (!isExpenseMonth(nextMonth) || nextMonth === month) return;
    const hasWork = Boolean(cloudScope) || getValues().workItems.some(item => item.workDate || item.subject || item.location || item.evidenceImage || item.travelFrom || item.travelTo ||
      item.startTime !== "08:00" || item.endTime !== "17:00" || item.perDiem !== 300 ||
      [item.fare, item.accommodation, item.entertainment, item.otherExpense, item.totalKilometers].some(value => value !== null && value !== 0 && !Number.isNaN(value)));
    if (hasWork) setPendingMonth(nextMonth);
    else changeMonth(nextMonth);
  }

  async function saveCloud(data: ExpenseRequestForm) {
    if (!cloudScope) return true;
    setCloudBusy(true);
    setCloudMessage("กำลังบันทึกการแก้ไข…");
    let saved = 0;
    try {
      if (new Set(data.workItems.map((item) => item.workDate)).size !== data.workItems.length) throw new Error("บันทึกได้วันละหนึ่งงาน กรุณาตรวจสอบวันที่ซ้ำ");
      if ((!cloudScope.reportToken && !isAvailableExpenseMonth(cloudScope.month)) || data.workItems.some((item) => !item.workDate.startsWith(`${cloudScope.month}-`))) throw new Error("วันที่ต้องอยู่ในเดือนของเอกสาร กรุณาเปิดรายการใหม่");
      for (const [index, item] of data.workItems.entries()) {
        const response = await fetch("/api/expense-records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...cloudScope, item, operation: item.isNew ? "create" : "update" }) });
        const result = await recordsResponse(response);
        const savedId = result.id || item.id;
        setValue(`workItems.${index}.id`, savedId);
        setValue(`workItems.${index}.isNew`, false);
        item.id = savedId;
        item.isNew = false;
        saved++;
      }
      writeExpenseRequestDraft(getValues());
      setCloudMessage(`บันทึกแล้ว ${saved} รายการ`);
      return true;
    } catch (error) {
      setCloudMessage(`${saved ? `บันทึกแล้ว ${saved} รายการ — ` : ""}${error instanceof Error ? error.message : "บันทึกไม่สำเร็จ"}`);
      return false;
    } finally { setCloudBusy(false); }
  }

  async function removeWorkItem(index: number) {
    const item = getValues().workItems[index];
    setPendingRemove(null);
    if (cloudScope && !item.isNew) {
      setCloudBusy(true);
      try {
        const response = await fetch("/api/expense-records", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...cloudScope, id: item.id }) });
        await recordsResponse(response);
        setCloudMessage("ลบรายการแล้ว");
      } catch (error) { setCloudMessage(error instanceof Error ? error.message : "ลบไม่สำเร็จ"); return; }
      finally { setCloudBusy(false); }
    }
    if (getValues().workItems.length === 1) setValue("workItems", [{ ...createDefaultExpenseWorkItem(), isNew: Boolean(cloudScope) }]);
    else remove(index);
    writeExpenseRequestDraft(getValues());
  }

  async function loadCloud(previous = false) {
    setPendingRemove(null);
    setCloudBusy(true);
    setCloudMessage("กำลังโหลดรายการ…");
    try {
      const targetMonth = previous ? previousExpenseMonth() : month;
      if (!isAvailableExpenseMonth(targetMonth)) throw new Error("ข้อมูลที่บันทึกไว้เปิดได้เฉพาะเดือนปัจจุบันและเดือนที่แล้ว");
      const response = await fetch(`/api/expense-records?${new URLSearchParams({ employeeId: requesterKey, month: targetMonth })}`, { cache: "no-store" });
      const result = await recordsResponse(response);
      if (!Array.isArray(result.items) || (result.month && result.month !== targetMonth) || result.items.some((item: ExpenseWorkItem) => !item.workDate?.startsWith(`${targetMonth}-`))) throw new Error("ข้อมูลรายการไม่ตรงกับเดือนที่เลือก กรุณาเปิดรายการใหม่");
      const loadedItems = result.items.length ? result.items : [{ ...createDefaultExpenseWorkItem(), isNew: true }];
      const loadedDraft = { ...getValues(), workItems: loadedItems, documentDate: getValues().documentDate || bangkokDate(new Date()) };
      reset(loadedDraft);
      writeExpenseRequestDraft(loadedDraft);
      setSelectedMonth(targetMonth);
      setCloudScope({ employeeId: requesterKey, month: targetMonth });
      try { sessionStorage.setItem(SELECTED_MONTH_KEY, targetMonth); } catch {}
      try { sessionStorage.setItem(CLOUD_SCOPE_KEY, JSON.stringify({ employeeId: requesterKey, month: targetMonth })); } catch {}
      setCloudMessage(`โหลดแล้ว ${result.items.length} รายการ แก้ไขข้อมูลในฟอร์มด้านล่างได้เลย`);
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ"); }
    finally { setCloudBusy(false); }
  }

  async function handleValidSubmit(data: ExpenseRequestForm) {
    if (selectedRequester?.department === "Event Activation / Mkt") {
      let missing = false;
      data.workItems.forEach((item, index) => {
        if (item.accommodationOnly) return;
        for (const field of ["startTime", "endTime"] as const) if (!item[field]) {
          form.setError(`workItems.${index}.${field}`, { message: "กรุณากรอกเวลา" }); missing = true;
        }
      });
      if (missing) return;
    }
    if (data.workItems.some((item) => !item.workDate.startsWith(`${month}-`))) {
      setCloudMessage("วันที่ปฏิบัติงานต้องอยู่ในเดือนของเอกสาร");
      return;
    }
    if (!await saveCloud(data)) return;
    writeExpenseRequestDraft(data);
    router.push("/documents/expense-request/preview");
  }

  return (
    <form
      className="space-y-8"
      onSubmit={handleSubmit(handleValidSubmit, handleInvalidSubmit)}
    >
      <fieldset disabled={cloudBusy} className="min-w-0 space-y-8">
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold">ข้อมูลเอกสาร</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="teamKey">ทีม</Label>
            <input type="hidden" {...register("teamKey")} />
            <SearchableDropdown
              disabled={Boolean(cloudScope)}
              id="teamKey"
              invalid={Boolean(errors.teamKey)}
              onValueChange={(nextTeamKey) => {
                setValue("teamKey", nextTeamKey, {
                  shouldDirty: true,
                  shouldTouch: true,
                  shouldValidate: true
                });
                setValue("requesterKey", "", {
                  shouldDirty: true,
                  shouldValidate: true
                });
              }}
              options={teamOptions}
              placeholder="เลือกทีม"
              value={teamKey}
            />
            <FieldError message={errors.teamKey?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="requesterKey">ผู้ขอเบิก</Label>
            <input type="hidden" {...register("requesterKey")} />
            <SearchableDropdown
              disabled={!selectedTeam || Boolean(cloudScope)}
              emptyMessage="ไม่พบรายชื่อที่ค้นหา"
              id="requesterKey"
              invalid={Boolean(errors.requesterKey)}
              onValueChange={(nextRequesterKey) => {
                setValue("requesterKey", nextRequesterKey, {
                  shouldDirty: true,
                  shouldTouch: true,
                  shouldValidate: true
                });
              }}
              options={requesterOptions}
              placeholder={
                selectedTeam ? "เลือกผู้ขอเบิก" : "กรุณาเลือกทีมก่อน"
              }
              searchable
              searchPlaceholder="ค้นหาชื่อหรือรหัสพนักงาน"
              value={requesterKey}
            />
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

        <div className="mt-5 max-w-xs space-y-2">
          <Label htmlFor="expense-month">เดือนที่ต้องการทำข้อมูล</Label>
          <Input id="expense-month" type="month" value={month} disabled={Boolean(cloudScope?.reportToken)} onChange={event => requestMonthChange(event.target.value)} />
          {cloudScope?.reportToken && <p className="text-sm text-muted-foreground">เอกสารจากลิงก์ LINE ใช้เดือนตามเอกสาร หากต้องการทำเดือนอื่น ให้เลือกเปลี่ยนผู้ขอเบิกก่อน</p>}
        </div>
        {pendingMonth && <div role="alert" className="mt-3 space-y-3 rounded-md border border-border p-4">
          <p>ต้องการเปลี่ยนเป็นเดือน {pendingMonth} หรือไม่? รายการที่กำลังกรอกจะถูกแทนที่ด้วยฟอร์มว่าง กรุณาบันทึกข้อมูลที่ต้องการเก็บก่อน</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => changeMonth(pendingMonth)}>เปลี่ยนเดือนและเริ่มรายการใหม่</Button>
            <Button variant="outline" onClick={() => setPendingMonth(null)}>กรอกเดือนเดิมต่อ</Button>
          </div>
        </div>}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">รายการเดือน{monthLabel}</p>
          <Button disabled={!selectedRequester || !isAvailableExpenseMonth(month) || Boolean(cloudScope)} onClick={() => void loadCloud()} variant="outline">เปิดรายการที่บันทึกไว้</Button>
          <Button disabled={!selectedRequester || Boolean(cloudScope)} onClick={() => void loadCloud(true)} variant="outline">ดึงข้อมูลสรุปเดือนที่แล้ว</Button>
          {cloudScope && <Button variant="ghost" onClick={() => { try { sessionStorage.removeItem(CLOUD_SCOPE_KEY); } catch {} window.history.replaceState(null, "", window.location.pathname); setCloudScope(null); setCloudMessage(""); setValue("workItems", [createDefaultExpenseWorkItem()]); }}>เปลี่ยนผู้ขอเบิก</Button>}
        </div>
        {!isAvailableExpenseMonth(month) && <p className="mt-3 text-sm text-muted-foreground">เดือนนี้กรอกเอกสารใหม่ได้ ส่วนข้อมูลที่บันทึกจาก LINE เปิดได้เฉพาะเดือนปัจจุบันและเดือนที่แล้ว</p>}
        {cloudMessage && <p role="status" className="mt-3 text-sm">{cloudMessage}</p>}

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
                <dt className="text-muted-foreground">ทีม</dt>
                <dd className="font-medium">{selectedRequester.department}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {selectedTeam
                ? "เลือกผู้ขอเบิกเพื่อแสดงข้อมูลพนักงาน"
                : "เลือกทีมก่อน แล้วจึงเลือกผู้ขอเบิก"}
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

        {pendingRemove !== null && <div role="alert" className="space-y-3 rounded-md border border-border p-4">
          <p>ต้องการลบรายการที่ {pendingRemove + 1} ออกจากข้อมูลที่บันทึกไว้หรือไม่?</p>
          <Button variant="destructive" onClick={() => void removeWorkItem(pendingRemove)}>ยืนยันลบรายการ</Button>
          <Button variant="outline" onClick={() => setPendingRemove(null)}>เก็บรายการไว้</Button>
        </div>}
        <div className="space-y-4">
          {fields.map((field, index) => (
            <WorkItemEditor
              canRemove={Boolean(cloudScope) || fields.length > 1}
              fieldId={`work-item-${index + 1}`}
              form={form}
              index={index}
              item={watchedItems?.[index] ?? field}
              month={month}
              requiresWorkTime={selectedRequester?.department === "Event Activation / Mkt"}
              key={field.id}
              onRemove={() => { if (cloudScope && !getValues().workItems[index].isNew) setPendingRemove(index); else void removeWorkItem(index); }}
            />
          ))}
          <div className="flex justify-end">
            <Button onClick={() => append({ ...createDefaultExpenseWorkItem(), isNew: Boolean(cloudScope) })}>
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
        {cloudScope && <Button onClick={handleSubmit((data) => { void saveCloud(data); }, handleInvalidSubmit)} variant="outline">บันทึกการแก้ไข</Button>}
        <Button onClick={handleReset} variant="outline">
          <RotateCcw aria-hidden="true" className="size-4" />
          ล้างข้อมูล
        </Button>
        <Button type="submit">
          <Check aria-hidden="true" className="size-4" />
          ยืนยันและดูตัวอย่าง
        </Button>
      </div>
      </fieldset>
    </form>
  );
}
