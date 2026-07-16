export type EvidenceImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export type EvidenceImage = {
  fileName: string;
  mimeType: EvidenceImageMimeType;
  dataUrl: string;
};

export type ExpenseWorkItem = {
  id: string;
  workDate: string;
  subject: string;
  startTime: string;
  endTime: string;
  location: string;
  travelFrom: string;
  travelTo: string;
  totalKilometers: number | null;
  fare: number | null;
  accommodation: number | null;
  perDiem: number | null;
  entertainment: number | null;
  otherExpense: number | null;
  evidenceImage: EvidenceImage | null;
};

export type ExpenseRequestForm = {
  requesterKey: string;
  documentDate: string;
  workItems: ExpenseWorkItem[];
};

export type StoredExpenseRequestDraft = {
  version: 1;
  savedAt: string;
  data: ExpenseRequestForm;
};
