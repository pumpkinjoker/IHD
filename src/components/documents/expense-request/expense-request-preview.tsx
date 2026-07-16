"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, FilePlus2, Printer } from "lucide-react";
import { DocumentPackagePreview } from "@/components/documents/expense-request/document-package-preview";
import { Button } from "@/components/ui/button";
import {
  clearExpenseRequestDraft,
  readExpenseRequestDraft
} from "@/lib/storage/expense-request-session-storage";
import type { ExpenseRequestForm } from "@/types/expense-request";

function FloatingToolbar({
  onBack,
  onCreateNew,
  onPrint,
  printNotice
}: {
  onBack: () => void;
  onCreateNew: () => void;
  onPrint: (mode: "download" | "print") => void;
  printNotice?: string;
}) {
  return (
    <div className="expense-floating-toolbar-wrap no-print">
      <div className="expense-floating-toolbar">
        <Button onClick={onBack} size="sm" variant="outline">
          <ArrowLeft aria-hidden="true" className="size-4" />
          ย้อนกลับ
        </Button>
        <Button onClick={() => onPrint("download")} size="sm" variant="outline">
          <Download aria-hidden="true" className="size-4" />
          ดาวน์โหลด PDF
        </Button>
        <Button onClick={() => onPrint("print")} size="sm" variant="outline">
          <Printer aria-hidden="true" className="size-4" />
          พิมพ์เอกสาร
        </Button>
        <Button onClick={onCreateNew} size="sm" variant="secondary">
          <FilePlus2 aria-hidden="true" className="size-4" />
          สร้างใหม่
        </Button>
      </div>
      {printNotice ? (
        <p className="expense-print-notice" role="status">
          {printNotice}
        </p>
      ) : null}
    </div>
  );
}

function CenteredDocumentContainer({ draft }: { draft: ExpenseRequestForm }) {
  return (
    <div className="expense-page-stage">
      <DocumentPackagePreview draft={draft} />
    </div>
  );
}

function PreviewLayout({ draft }: { draft: ExpenseRequestForm }) {
  const router = useRouter();
  const [printNotice, setPrintNotice] = useState<string>();

  function handleCreateNew() {
    clearExpenseRequestDraft();
    router.push("/");
  }

  function handlePrint(mode: "download" | "print") {
    setPrintNotice(
      mode === "download"
        ? "กำลังเปิดหน้าต่างพิมพ์ กรุณาเลือก Save as PDF เพื่อดาวน์โหลด"
        : "กำลังเปิดหน้าต่างพิมพ์ กรุณาเลือกเครื่องพิมพ์"
    );

    window.setTimeout(() => {
      window.print();
    }, 50);
  }

  return (
    <main className="expense-preview-screen">
      <FloatingToolbar
        onBack={() => router.push("/documents/expense-request/new")}
        onCreateNew={handleCreateNew}
        onPrint={handlePrint}
        printNotice={printNotice}
      />
      <CenteredDocumentContainer draft={draft} />
    </main>
  );
}

export function ExpenseRequestPreview() {
  const router = useRouter();
  const [draft, setDraft] = useState<ExpenseRequestForm | null | undefined>(
    undefined
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDraft(readExpenseRequestDraft()?.data ?? null);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  if (draft === undefined) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <p className="text-sm text-muted-foreground">กำลังโหลดข้อมูล...</p>
      </main>
    );
  }

  if (!draft) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">ไม่พบข้อมูลร่างเอกสาร</h1>
          <p className="mt-2 text-muted-foreground">
            กรุณากลับไปกรอกข้อมูลเอกสารเบิกเงินใหม่อีกครั้ง
          </p>
          <Button
            className="mt-5"
            onClick={() => router.push("/documents/expense-request/new")}
          >
            กลับไปกรอกข้อมูล
          </Button>
        </section>
      </main>
    );
  }

  return <PreviewLayout draft={draft} />;
}
