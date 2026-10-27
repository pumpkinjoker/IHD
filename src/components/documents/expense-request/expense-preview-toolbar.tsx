"use client";

import { ArrowLeft, Download, FilePlus2, Pencil, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExpensePreviewToolbar({
  onBack,
  onCreateNew,
  onEdit,
  onPrint,
  printNotice
}: {
  onBack?: () => void;
  onCreateNew?: () => void;
  onEdit?: () => void;
  onPrint: (mode: "download" | "print") => void;
  printNotice?: string;
}) {
  return (
    <div className="expense-floating-toolbar-wrap no-print">
      <div className="expense-floating-toolbar">
        {onEdit && <Button onClick={onEdit} size="sm" variant="outline"><Pencil aria-hidden="true" className="size-4" />แก้ไขเอกสาร</Button>}
        {onBack && <Button onClick={onBack} size="sm" variant="outline">
          <ArrowLeft aria-hidden="true" className="size-4" />
          ย้อนกลับ
        </Button>}
        <Button onClick={() => onPrint("download")} size="sm" variant="outline">
          <Download aria-hidden="true" className="size-4" />
          ดาวน์โหลด PDF
        </Button>
        <Button onClick={() => onPrint("print")} size="sm" variant="outline">
          <Printer aria-hidden="true" className="size-4" />
          พิมพ์เอกสาร
        </Button>
        {onCreateNew && <Button onClick={onCreateNew} size="sm" variant="secondary">
          <FilePlus2 aria-hidden="true" className="size-4" />
          สร้างใหม่
        </Button>}
      </div>
      {printNotice ? (
        <p className="expense-print-notice" role="status">
          {printNotice}
        </p>
      ) : null}
    </div>
  );
}
