import {
  formatLongThaiBuddhistDate
} from "@/lib/dates/date-utils";
import type { ExpenseWorkItem } from "@/types/expense-request";
import type { Approver, TeamMember } from "@/types/master-data";
import { DocumentPage } from "./document-page";

type SupportingEvidencePageProps = {
  approver: Approver;
  isFirstEvidencePage: boolean;
  items: ExpenseWorkItem[];
  pageItemStartIndex: number;
  requester: TeamMember | null;
};

function formatEvidenceTimeRange(startTime: string, endTime: string) {
  const formatTime = (value: string) => value.replace(":", ".");

  if (startTime && endTime) {
    return `${formatTime(startTime)} – ${formatTime(endTime)} น.`;
  }

  return startTime || endTime ? `${formatTime(startTime || endTime)} น.` : "";
}

function CompanyEvidenceHeader() {
  return (
    <header className="supporting-evidence-company-header">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt="TOA logo"
        className="supporting-evidence-logo"
        src="/brand/toa-logo.png"
      />
      <div className="supporting-evidence-company-text">
        <p className="supporting-evidence-company-thai">
          บริษัท ทีโอเอ เพ้นท์ (ประเทศไทย) จำกัด (มหาชน)
        </p>
        <p className="supporting-evidence-company-english">
          TOA PAINT (THAILAND) PUBLIC COMPANY LIMITED
        </p>
      </div>
    </header>
  );
}

function SignerSection({
  approver,
  requester
}: {
  approver: Approver;
  requester: TeamMember | null;
}) {
  return (
    <>
      <div className="supporting-evidence-title-row">
        บันทึกเบี้ยเลี้ยง - การปฏิบัติงานนอกบริษัท
      </div>
      <section className="supporting-evidence-signer-grid">
        <div className="supporting-evidence-signer-cell">
          <p>ผู้ปฏิบัติงาน: {requester?.name ?? ""}</p>
          <p>ตำแหน่ง: {requester?.position ?? ""}</p>
          <p>ฝ่าย/สายงาน: {requester?.department ?? ""}</p>
          <p className="supporting-evidence-signature-row">
            (ลงนาม)<span className="supporting-evidence-dotted-line" />
          </p>
        </div>
        <div className="supporting-evidence-signer-cell">
          <p>ผู้อนุมัติ: {approver.name}</p>
          <p>ตำแหน่ง: {approver.position}</p>
          <p className="supporting-evidence-signer-spacer" aria-hidden="true">
            &nbsp;
          </p>
          <p className="supporting-evidence-signature-row">
            (ลงนาม)<span className="supporting-evidence-dotted-line" />
          </p>
        </div>
      </section>
    </>
  );
}

function EvidenceBlock({
  item,
  itemNumber
}: {
  item: ExpenseWorkItem;
  itemNumber: number;
}) {
  return (
    <section className="supporting-evidence-block">
      <div className="supporting-evidence-date-row">
        {formatLongThaiBuddhistDate(item.workDate)}
      </div>
      <div className="supporting-evidence-info-row">
        <div className="supporting-evidence-info-cell">
          <p>เรื่อง: {item.subject}</p>
          <p>เวลา: {formatEvidenceTimeRange(item.startTime, item.endTime)}</p>
          <p>สถานที่: {item.location}</p>
        </div>
        <div className="supporting-evidence-info-cell">
          <p>รายละเอียด:</p>
          <p>{item.subject || `รายการที่ ${itemNumber}`}</p>
        </div>
      </div>
      <div className="supporting-evidence-image-row">
        {item.evidenceImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`หลักฐานประกอบรายการที่ ${itemNumber}`}
            className="supporting-evidence-image"
            src={item.evidenceImage.dataUrl}
          />
        ) : null}
      </div>
    </section>
  );
}

export function SupportingEvidencePage({
  approver,
  isFirstEvidencePage,
  items,
  pageItemStartIndex,
  requester
}: SupportingEvidencePageProps) {
  return (
    <DocumentPage className="supporting-evidence-page">
      <CompanyEvidenceHeader />
      <div className="supporting-evidence-form">
        {isFirstEvidencePage ? (
          <SignerSection approver={approver} requester={requester} />
        ) : null}
        {items.map((item, index) => (
          <EvidenceBlock
            item={item}
            itemNumber={pageItemStartIndex + index + 1}
            key={item.id}
          />
        ))}
      </div>
    </DocumentPage>
  );
}
