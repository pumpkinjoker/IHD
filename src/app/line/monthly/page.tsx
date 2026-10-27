import type { Metadata } from "next";
import { MonthlyReportView } from "@/components/line/monthly-report-view";
export const metadata: Metadata = { title: "สรุปยอดเบิกค่าใช้จ่าย", referrer: "no-referrer", robots: { index: false, follow: false } };
export default function MonthlyReportPage() { return <MonthlyReportView />; }
