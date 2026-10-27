"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DocumentPackagePreview } from "@/components/documents/expense-request/document-package-preview";
import { calculateGrandTotal } from "@/lib/calculations/expense";
import { formatMoney } from "@/lib/money/format-money";
import { REPORT_STORAGE_ORIGIN, isReportAsset, monthlyReportSchema, type MonthlyReport } from "@/lib/reports/monthly-report";

export function MonthlyReportView() {
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
      } catch (error) { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : "เปิดรายงานไม่สำเร็จ"); }
    })();
    return () => abort.abort();
  }, []);
  if (!report) return <main className="mx-auto max-w-3xl p-8"><h1 className="text-2xl font-semibold">สรุปยอดเบิกเบี้ยเลี้ยง</h1><p role={error ? "alert" : "status"} className="mt-4">{error || "กำลังเปิดรายงานส่วนตัว…"}</p></main>;
  return <main className="expense-preview-screen monthly-report-screen">
    <section className="no-print mx-auto max-w-4xl space-y-3 px-6 py-6">
      <h1 className="text-2xl font-semibold">{report.title}</h1>
      {report.preview && <p className="font-medium">สรุปช่วงทดสอบ ณ ตอนเรียกดู · ยังไม่ใช่รายงานปิดเดือน</p>}
      <p>{report.requester.name} ({report.requester.employeeId})</p>
      <p>{report.draft.workItems.length} วัน · รวม {formatMoney(calculateGrandTotal(report.draft.workItems))} บาท</p>
      <p className="text-sm">ข้อมูลสรุป ณ วันออกเอกสาร · ลิงก์ส่วนตัวนี้หมดอายุพร้อมรอบล้างข้อมูล กรุณาเก็บ PDF ไว้ก่อนถึงกำหนด</p>
      <Button onClick={async () => {
        setNotice("กำลังเตรียมรูปหลักฐาน…");
        try {
          await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>(".expense-document-stack img")).map((image) => image.decode()));
          await document.fonts.ready;
          setNotice("เลือก Save as PDF ในหน้าต่างพิมพ์เพื่อบันทึกเอกสาร");
          window.print();
        } catch { setNotice("รูปหลักฐานยังไม่ครบ กรุณาลองเปิดรายงานอีกครั้ง"); }
      }}>ดาวน์โหลด PDF / พิมพ์แบบฟอร์ม</Button>
      {notice && <p role="status" className="text-sm">{notice}</p>}
    </section>
    <div className="expense-page-stage"><DocumentPackagePreview draft={report.draft} requesterOverride={report.requester} /></div>
  </main>;
}
