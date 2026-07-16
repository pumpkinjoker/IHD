import type { Approver, TeamMember } from "@/types/master-data";

type SignatureSectionProps = {
  requester: TeamMember | null;
  authorizedBy: Approver;
};

function SignatureBlock({
  name,
  position,
  label,
  sublabel
}: {
  name: string;
  position: string;
  label: string;
  sublabel: string;
}) {
  return (
    <section className="expense-signature-block">
      <div className="expense-signature-line" />
      <p className="expense-signature-name">( {name} )</p>
      <p className="expense-signature-label">
        {label} ({sublabel})
      </p>
      <div className="expense-position-row">
        <span>ตำแหน่ง</span>
        <span className="expense-position-line">{position}</span>
      </div>
      <p className="expense-position-label">(Position)</p>
    </section>
  );
}

function ReviewerSignatureBlock() {
  return (
    <section className="expense-signature-block">
      <div className="expense-signature-line" />
      <p className="expense-signature-name">
        <span className="expense-handwritten-name">
          <span>(</span>
          <span className="expense-handwritten-name-space" />
          <span>)</span>
        </span>
      </p>
      <p className="expense-signature-label">ผู้ตรวจสอบ (Reviewed by)</p>
      <div className="expense-position-row">
        <span>ตำแหน่ง</span>
        <span className="expense-position-line">ฝ่ายบัญชีทั่วไป</span>
      </div>
      <p className="expense-position-label">(Position)</p>
    </section>
  );
}

export function SignatureSection({
  requester,
  authorizedBy
}: SignatureSectionProps) {
  const requesterPosition = requester
    ? `${requester.position} , ${requester.department}`
    : "";

  return (
    <section className="expense-signature-section">
      <SignatureBlock
        label="ผู้ขอเบิก"
        name={requester?.name ?? ""}
        position={requesterPosition}
        sublabel="Requested by"
      />
      <SignatureBlock
        label="ผู้อนุมัติ"
        name={authorizedBy.name}
        position={authorizedBy.position}
        sublabel="Authorized by"
      />
      <ReviewerSignatureBlock />
    </section>
  );
}
