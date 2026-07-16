import { ExpenseRequestEntryForm } from "@/components/forms/expense-request/expense-request-entry-form";

export default function NewExpenseRequestPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 space-y-2">
        <p className="text-sm font-medium text-primary">เอกสารเบิกเงิน</p>
        <h1 className="text-3xl font-semibold tracking-normal">
          กรอกข้อมูล Expense Request
        </h1>
      </div>
      <ExpenseRequestEntryForm />
    </main>
  );
}
