import type { Metadata } from "next";
import { MonthlyReportView } from "@/components/line/monthly-report-view";
export const metadata: Metadata = { title: "สรุปยอดเบิกเบี้ยเลี้ยง", referrer: "no-referrer", robots: { index: false, follow: false } };
export default function MonthlyReportPage() { return <MonthlyReportView />; }
