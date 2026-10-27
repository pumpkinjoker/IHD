"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExpensePreviewToolbar } from "@/components/documents/expense-request/expense-preview-toolbar";
import { DocumentPackagePreview } from "@/components/documents/expense-request/document-package-preview";
import { REPORT_STORAGE_ORIGIN, isReportAsset, monthlyReportSchema, monthlyReportTitle, type MonthlyReport } from "@/lib/reports/monthly-report";

export function MonthlyReportView() {
  const router = useRouter();
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      try {
        let url = decodeURIComponent(window.location.hash.slice(1));
        if (/^[A-Za-z0-9_-]{22}$/.test(url)) {
          const resolved = await fetch(`${REPORT_STORAGE_ORIGIN}/functions/v1/resolve-report-link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: url }), cache: "no-store", referrerPolicy: "no-referrer", signal: abort.signal });
          if (!resolved.ok) throw new Error("ลิงก์ไม่ถูกต้อง หมดอายุ หรือข้อมูลถูกล้างแล้ว");
          url = (await resolved.json()).url;
        }
        if (!isReportAsset(url)) throw new Error("ลิงก์รายงานไม่ถูกต้อง กรุณาเปิดจากข้อความที่บอตส่งให้");
        const response = await fetch(url, { cache: "no-store", referrerPolicy: "no-referrer", signal: abort.signal });
        if (!response.ok) throw new Error("รายงานหมดอายุหรือถูกล้างตามรอบแล้ว");
        const parsed = monthlyReportSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error("ข้อมูลรายงานไม่ครบ กรุณาติดต่อผู้ดูแล");
        if (new Date(parsed.data.expiresAt).getTime() <= Date.now()) throw new Error("รายงานหมดอายุแล้ว");
        setReport(parsed.data);
        document.title = monthlyReportTitle(parsed.data.month);
      } catch (error) { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : "เปิดรายงานไม่สำเร็จ"); }
    })();
    return () => abort.abort();
  }, []);
  if (!report) return <main className="mx-auto max-w-4xl px-6 py-12"><p role={error ? "alert" : "status"} className="text-sm text-muted-foreground">{error || "กำลังโหลดเอกสาร…"}</p></main>;
  return <main className="expense-preview-screen monthly-report-screen">
    <ExpensePreviewToolbar printNotice={notice} onEdit={() => {
      const token = window.location.hash.slice(1);
      if (!/^[A-Za-z0-9_-]{22}$/.test(token)) { setNotice("กรุณาขอลิงก์สรุปใหม่จาก LINE เพื่อแก้ไขเอกสาร"); return; }
      router.push(`/documents/expense-request/new#report=${token}`);
    }} onPrint={async (mode) => {
        setNotice("กำลังเตรียมรูปหลักฐาน…");
        try {
          await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>(".expense-document-stack img")).map((image) => image.decode()));
          await document.fonts.ready;
          setNotice(mode === "download" ? "กำลังเปิดหน้าต่างพิมพ์ กรุณาเลือก Save as PDF เพื่อดาวน์โหลด" : "กำลังเปิดหน้าต่างพิมพ์ กรุณาเลือกเครื่องพิมพ์");
          window.print();
        } catch { setNotice("รูปหลักฐานยังไม่ครบ กรุณาลองเปิดรายงานอีกครั้ง"); }
      }} />
    <div className="expense-page-stage"><DocumentPackagePreview draft={report.draft} requesterOverride={report.requester} /></div>
  </main>;
}
