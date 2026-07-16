import { calculateGrandTotal } from "@/lib/calculations/expense";
import { findRequesterByKey, masterData } from "@/lib/master-data";
import { formatMoney } from "@/lib/money/format-money";
import { toThaiBahtText } from "@/lib/money/thai-baht-text";
import type { ExpenseRequestForm } from "@/types/expense-request";
import { CompanyHeader } from "./company-header";
import { DocumentPage } from "./document-page";
import { EntertainmentSection } from "./entertainment-section";
import { ExpenseHeader } from "./expense-header";
import { ExpenseTable } from "./expense-table";
import { OfficialNotes } from "./official-notes";
import { SignatureSection } from "./signature-section";

type ExpenseRequestDocumentProps = {
  draft: ExpenseRequestForm;
};

export function ExpenseRequestDocument({ draft }: ExpenseRequestDocumentProps) {
  const requester = findRequesterByKey(draft.requesterKey);
  const grandTotal = calculateGrandTotal(draft.workItems);
  const grandTotalText = formatMoney(grandTotal);

  return (
    <DocumentPage>
      <p className="expense-for-payment">สำหรับการเบิกค่าใช้จ่าย</p>
      <CompanyHeader />
      <ExpenseHeader
        amountText={toThaiBahtText(grandTotal)}
        documentDate={draft.documentDate}
        grandTotal={grandTotalText}
        requester={requester}
      />
      <ExpenseTable grandTotal={grandTotalText} workItems={draft.workItems} />
      <EntertainmentSection />
      <OfficialNotes />
      <SignatureSection
        authorizedBy={masterData.approvers.authorizedBy}
        requester={requester}
      />
    </DocumentPage>
  );
}
