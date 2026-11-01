import { ExpenseRequestEntryForm } from "@/components/forms/expense-request/expense-request-entry-form";

import { loadExpenseTeams } from "@/lib/expense-request/directory.server";

export const dynamic = "force-dynamic";

export default async function NewExpenseRequestPage() {
  let teams;
  try { teams = await loadExpenseTeams(); }
  catch { return <main className="mx-auto max-w-6xl px-6 py-8"><p role="alert">โหลดรายชื่อพนักงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p></main>; }
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 space-y-2">
        <p className="text-sm font-medium text-primary">เอกสารเบิกเงิน</p>
        <h1 className="text-3xl font-semibold tracking-normal">
          กรอกข้อมูล Expense Request
        </h1>
      </div>
      <ExpenseRequestEntryForm teams={teams} />
    </main>
  );
}
