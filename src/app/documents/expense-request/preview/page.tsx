import { ExpenseRequestPreview } from "@/components/documents/expense-request/expense-request-preview";

import { loadExpenseTeams } from "@/lib/expense-request/directory.server";

export const dynamic = "force-dynamic";

export default async function ExpenseRequestPreviewPage() {
  let teams;
  try { teams = await loadExpenseTeams(); }
  catch { return <main className="mx-auto max-w-6xl px-6 py-8"><p role="alert">โหลดรายชื่อพนักงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p></main>; }
  return <ExpenseRequestPreview teams={teams} />;
}
