import { DocumentTypeCard } from "@/components/app/document-type-card";

export default function Home() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <section className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">In House Production</p>
          <h1 className="text-3xl font-semibold tracking-normal text-foreground">
            เลือกประเภทเอกสาร
          </h1>
        </div>

        <div className="grid max-w-xl gap-4">
          <DocumentTypeCard
            href="/documents/expense-request/new"
            subtitle="Expense Request"
            title="เอกสารเบิกเงิน"
          />
        </div>
      </section>
    </main>
  );
}
