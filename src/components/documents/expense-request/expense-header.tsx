import { formatShortThaiBuddhistDate } from "@/lib/dates/date-utils";
import type { TeamMember } from "@/types/master-data";

type ExpenseHeaderProps = {
  requester: TeamMember | null;
  documentDate: string;
  grandTotal: string;
  amountText: string;
};

function LineField({
  label,
  sublabel,
  value,
  className
}: {
  label: string;
  sublabel?: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="expense-line-field">
        <span className="expense-line-label">
          {label}
          {sublabel ? (
            <>
              <br />
              <span>{sublabel}</span>
            </>
          ) : null}
        </span>
        <span className="expense-line-value">{value}</span>
      </div>
    </div>
  );
}

export function ExpenseHeader({
  requester,
  documentDate,
  grandTotal,
  amountText
}: ExpenseHeaderProps) {
  return (
    <section className="expense-header-grid">
      <LineField
        className="expense-date-field"
        label="วันที่เบิก"
        sublabel="(Date)"
        value={formatShortThaiBuddhistDate(documentDate)}
      />
      <LineField
        className="expense-payee-field"
        label="จ่าย"
        sublabel="(Pay to)"
        value={requester?.name ?? ""}
      />
      <LineField
        className="expense-employee-field"
        label="รหัสพนักงาน"
        sublabel="(ID Employee)"
        value={requester?.employeeId ?? ""}
      />
      <LineField
        className="expense-department-field"
        label="ฝ่าย"
        sublabel="(Department)"
        value={requester?.department ?? ""}
      />
      <LineField
        className="expense-total-field"
        label="จำนวนเงิน"
        sublabel="(Total Amount)"
        value={`${grandTotal} บาท`}
      />
      <LineField
        className="expense-words-field"
        label="จำนวนเงินรวมเป็นตัวอักษร"
        sublabel="(Total Amount in words)"
        value={amountText}
      />
      <LineField
        className="expense-email-field"
        label="E-mail"
        value={requester?.email ?? ""}
      />
    </section>
  );
}
