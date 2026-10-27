/** Shared conversation rules for the simulator and the future LINE adapter. */
export type IntakeStep = "idle" | "photo" | "subject" | "location" | "review" | "date";

export type IntakeDraft = {
  workDate: string;
  imageId: string | null;
  subject: string;
  location: string;
};

export type IntakeState = {
  step: IntakeStep;
  draft: IntakeDraft | null;
};

export type IntakeAction =
  | { type: "start" }
  | { type: "cancel" }
  | { type: "confirm" }
  | { type: "editMenu" }
  | { type: "resume" }
  | { type: "edit"; field: "photo" | "subject" | "location" | "date" }
  | { type: "image"; imageId: string }
  | { type: "text"; text: string }
  | { type: "unsupported" };

export type IntakeButton = { label: string; data: string };
export type IntakeReply = {
  text: string; buttons: IntakeButton[];
  table?: { title: string; subtitle: string; rows: { date: string; subject: string; location: string; amount: string }[]; total: string; note: string };
};
export type IntakeResult = {
  state: IntakeState;
  reply: IntakeReply;
  /** Commit this entry durably before delivering the success reply. */
  entry?: IntakeDraft & { imageId: string };
};

export const INITIAL_INTAKE_STATE: IntakeState = { step: "idle", draft: null };
const cancelButton = { label: "ยกเลิก", data: "intake:cancel" };

export function bangkokDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(now);
}

function validWorkDate(value: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= today;
}

function review(draft: IntakeDraft): IntakeReply {
  return {
    text: `ตรวจสอบรายการก่อนบันทึก\nวันที่: ${draft.workDate}\nรูป: 1 รูป\nหัวข้องาน: ${draft.subject}\nสถานที่: ${draft.location}`,
    buttons: [
      { label: "ใช้แล้วข้อมูลถูกต้องเวรี่กู้ด", data: "intake:confirm" },
      { label: "แก้ไข", data: "intake:edit-menu" },
      cancelButton
    ]
  };
}

export function transitionIntake(
  current: IntakeState,
  action: IntakeAction,
  now: Date
): IntakeResult {
  const unchanged = (text: string, buttons: IntakeButton[] = [cancelButton]): IntakeResult => ({
    state: current, reply: { text, buttons }
  });
  if (action.type === "cancel") {
    return { state: INITIAL_INTAKE_STATE, reply: { text: "ยกเลิกรายการแล้ว", buttons: [{ label: "เพิ่มข้อมูลหน้างาน", data: "intake:start" }] } };
  }
  if (action.type === "start") {
    if (current.step !== "idle") return unchanged("มีรายการที่กำลังทำอยู่ กรุณาทำต่อ หรือกดยกเลิกก่อนเริ่มรายการใหม่");
    return {
      state: { step: "photo", draft: { workDate: bangkokDate(now), imageId: null, subject: "", location: "" } },
      reply: { text: "ถ่ายรูปหรือเลือกรูปหน้างานส่งมา 1 รูปครับ", buttons: [cancelButton] }
    };
  }
  if (!current.draft || current.step === "idle") {
    return unchanged("กดเพิ่มข้อมูลหน้างานเพื่อเริ่มรายการครับ", [{ label: "เพิ่มข้อมูลหน้างาน", data: "intake:start" }]);
  }
  const draft = { ...current.draft };
  if (action.type === "resume" && current.step === "review") return { state: current, reply: review(draft) };
  if (action.type === "editMenu" && current.step === "review") return {
    state: current,
    reply: { text: "ต้องการแก้ไขส่วนไหนครับ?", buttons: [
      { label: "เปลี่ยนรูป", data: "intake:edit:photo" },
      { label: "แก้หัวข้องาน", data: "intake:edit:subject" },
      { label: "แก้สถานที่", data: "intake:edit:location" },
      { label: "เปลี่ยนวันที่", data: "intake:edit:date" },
      { label: "กลับสรุป", data: "intake:resume" }
    ] }
  };
  if (action.type === "edit") {
    if (current.step !== "review") return unchanged("กรุณาทำขั้นตอนปัจจุบันให้เสร็จก่อนแก้ไขครับ");
    const prompts = {
      photo: "ส่งรูปใหม่ 1 รูปเพื่อแทนรูปเดิมครับ",
      subject: "พิมพ์หัวข้องานใหม่ครับ",
      location: "พิมพ์สถานที่ใหม่ครับ",
      date: `พิมพ์แค่เลขวันที่ เช่น 25 ครับ ใช้เดือนและปีเดิม (${draft.workDate.slice(0, 7)})`
    };
    return { state: { step: action.field, draft }, reply: { text: prompts[action.field], buttons: [cancelButton] } };
  }
  if (action.type === "confirm") {
    if (current.step !== "review" || !draft.imageId || !draft.subject || !draft.location) {
      return unchanged("กรุณาส่งรูป หัวข้องาน และสถานที่ให้ครบก่อนยืนยันครับ");
    }
    return {
      state: INITIAL_INTAKE_STATE,
      entry: { ...draft, imageId: draft.imageId },
      reply: { text: "บันทึกรายการหน้างานแล้วครับ", buttons: [{ label: "เพิ่มข้อมูลหน้างาน", data: "intake:start" }] }
    };
  }
  if (action.type === "image") {
    if (current.step !== "photo") return unchanged("รายการนี้ใช้รูปเดียว หากต้องการเปลี่ยนรูป ให้กดเปลี่ยนรูปในหน้าสรุปครับ");
    if (!action.imageId.trim()) return unchanged("รับรูปไม่สำเร็จ กรุณาส่งรูปใหม่ครับ");
    draft.imageId = action.imageId;
    if (draft.subject && draft.location) return { state: { step: "review", draft }, reply: review(draft) };
    return { state: { step: "subject", draft }, reply: { text: "งานนี้หัวข้ออะไรครับ?", buttons: [cancelButton] } };
  }
  if (action.type !== "text") return unchanged("ขั้นตอนนี้รับรูปหรือข้อความตามที่บอตถามครับ");
  const value = action.text.trim();
  if (current.step === "photo") return unchanged("กรุณาส่งรูปหน้างาน 1 รูปก่อนครับ");
  if (current.step === "review") return { state: current, reply: review(draft) };
  if (current.step === "date") {
    const month = draft.workDate.slice(0, 7);
    const day = /^\d{1,2}$/.test(value) ? value.padStart(2, "0") : value.startsWith(month + "-") && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(8) : "";
    const date = `${month}-${day}`;
    if (!day || !validWorkDate(date, bangkokDate(now))) return unchanged("วันที่ไม่ถูกต้องหรืออยู่ในอนาคตครับ พิมพ์แค่เลขวันภายในเดือนเดิม เช่น 25");
    draft.workDate = date;
  } else {
    if (!value || value.length > 300) return unchanged("กรุณาพิมพ์ข้อมูล 1–300 ตัวอักษรครับ");
    if (current.step === "subject") {
      draft.subject = value;
      if (!draft.location) return { state: { step: "location", draft }, reply: { text: "สถานที่ปฏิบัติงานที่ไหนครับ?", buttons: [cancelButton] } };
    } else {
      draft.location = value;
    }
  }
  return { state: { step: "review", draft }, reply: review(draft) };
}

/** Commands use postback data so a job title like “ยกเลิก” remains ordinary text. */
export function parseIntakePostback(data: string): IntakeAction {
  switch (data) {
    case "intake:start": return { type: "start" };
    case "intake:cancel": return { type: "cancel" };
    case "intake:confirm": return { type: "confirm" };
    case "intake:edit-menu": return { type: "editMenu" };
    case "intake:resume": return { type: "resume" };
    case "intake:edit:photo": return { type: "edit", field: "photo" };
    case "intake:edit:subject": return { type: "edit", field: "subject" };
    case "intake:edit:location": return { type: "edit", field: "location" };
    case "intake:edit:date": return { type: "edit", field: "date" };
    default: return { type: "unsupported" };
  }
}
