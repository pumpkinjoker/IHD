import { paginateEvidenceItems } from "@/lib/expense-request/evidence-pagination";
import { findRequesterByKey, masterData } from "@/lib/master-data";
import type { ExpenseRequestForm } from "@/types/expense-request";
import type { TeamMember } from "@/types/master-data";
import { ExpenseRequestDocument } from "./expense-request-document";
import { SupportingEvidencePage } from "./supporting-evidence-page";

type DocumentPackagePreviewProps = {
  draft: ExpenseRequestForm;
  requesterOverride?: TeamMember;
};

export function DocumentPackagePreview({ draft, requesterOverride }: DocumentPackagePreviewProps) {
  const requester = requesterOverride ?? findRequesterByKey(draft.requesterKey);
  const evidencePages = paginateEvidenceItems(draft.workItems);
  const evidencePageItemStartIndexes = evidencePages.map((_, index) =>
    evidencePages
      .slice(0, index)
      .reduce((total, pageItems) => total + pageItems.length, 0)
  );

  return (
    <div className="expense-document-stack">
      <section className="expense-page-shell">
        <p className="expense-page-caption no-print">Page 1 · Expense Request</p>
        <ExpenseRequestDocument draft={draft} requesterOverride={requesterOverride} />
      </section>

      {evidencePages.map((items, index) => (
        <section
          className="expense-page-shell"
          key={`supporting-evidence-${index}`}
        >
          <p className="expense-page-caption no-print">
            Page {index + 2} · Supporting Evidence
          </p>
          <SupportingEvidencePage
            approver={masterData.approvers.authorizedBy}
            isFirstEvidencePage={index === 0}
            items={items}
            pageItemStartIndex={evidencePageItemStartIndexes[index]}
            requester={requester}
          />
        </section>
      ))}
    </div>
  );
}
