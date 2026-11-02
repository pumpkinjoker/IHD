/** Shared conversation rules for the simulator and the future LINE adapter. */
export type IntakeStep = "idle" | "photo" | "subject" | "location" | "review" | "date" | "amount" | "dateMonth" | "dateYear" | "startTime" | "endTime";

export type IntakeDraft = {
  startTime?: string;
  endTime?: string;
  kind?: "accommodation";
  accommodation?: number;
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
  | { type: "startAccommodation" }
  | { type: "cancel" }
  | { type: "confirm" }
  | { type: "editMenu" }
  | { type: "resume" }
  | { type: "edit"; field: "photo" | "subject" | "location" | "date" | "amount" | "dateMonth" | "dateYear" | "day" | "startTime" | "endTime" }
  | { type: "image"; imageId: string }
  | { type: "text"; text: string }
  | { type: "unsupported" };

export type IntakeButton = { label: string; data: string };
export type IntakeReply = {
  text: string; buttons: IntakeButton[];
  table?: { title: string; subtitle: string; rows: { date: string; subject: string; location: string; amount: string }[]; total: string; showTotal?: boolean };
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

export function normalizeWorkTime(value: string): string | null {
  const match = /^(\d{1,2})(?:[.:](\d{2}))?$/.exec(value.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2] ?? 0) > 59) return null;
  return `${match[1].padStart(2, "0")}:${match[2] ?? "00"}`;
}

function validWorkDate(value: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= today;
}

function review(draft: IntakeDraft): IntakeReply {
  return {
    text: draft.kind === "accommodation" ? `ตรวจสอบเบิกค่าที่พัก\nวันที่: ${draft.workDate}\nค่าที่พัก: ${draft.accommodation?.toLocaleString("th-TH")} บาท` : `ตรวจสอบรายการก่อนบันทึก\nวันที่: ${draft.workDate}\nรูป: 1 รูป\nหัวข้องาน: ${draft.subject}\nสถานที่: ${draft.location}${draft.startTime ? `\nเวลา: ${draft.startTime} – ${draft.endTime ?? ""} น.` : ""}`,
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
  now: Date,
  requiresWorkTime = false
): IntakeResult {
  const unchanged = (text: string, buttons: IntakeButton[] = [cancelButton]): IntakeResult => ({
    state: current, reply: { text, buttons }
  });
  if (action.type === "cancel") {
    return { state: INITIAL_INTAKE_STATE, reply: { text: "ยกเลิกรายการแล้ว", buttons: [{ label: "เพิ่มข้อมูล", data: "intake:start" }] } };
  }
  if (action.type === "startAccommodation") {
    if (current.step !== "idle") return unchanged("มีรายการที่กำลังทำอยู่ กรุณาบันทึกหรือยกเลิกก่อนเบิกค่าที่พักครับ");
    return { state: { step: "date", draft: { kind: "accommodation", workDate: bangkokDate(now), imageId: null, subject: "เบิกค่าที่พัก", location: "" } },
      reply: { text: "วันที่เข้าพักวันที่เท่าไหร่ครับ", buttons: [cancelButton] } };
  }
  if (action.type === "start") {
    if (current.step !== "idle") return unchanged("มีรายการที่กำลังทำอยู่ กรุณาทำต่อ หรือกดยกเลิกก่อนเริ่มรายการใหม่");
    return {
      state: { step: "photo", draft: { workDate: bangkokDate(now), imageId: null, subject: "", location: "" } },
      reply: { text: "ถ่ายรูปหรือเลือกรูปหน้างานส่งมา 1 รูปครับ", buttons: [cancelButton] }
    };
  }
  if (!current.draft || current.step === "idle") {
    return unchanged("กดเพิ่มข้อมูลเพื่อเริ่มรายการครับ", [{ label: "เพิ่มข้อมูล", data: "intake:start" }]);
  }
  const draft = { ...current.draft };
  if (action.type === "resume" && current.step === "review") return { state: current, reply: review(draft) };
  if (action.type === "editMenu" && current.step === "review") return {
    state: current,
    reply: { text: "ต้องการแก้ไขส่วนไหนครับ?", buttons: [
      ...(draft.kind === "accommodation" ? [{ label: "แก้ค่าที่พัก", data: "intake:edit:amount" }] : [
      { label: "เปลี่ยนรูป", data: "intake:edit:photo" },
      { label: "แก้หัวข้องาน", data: "intake:edit:subject" },
      { label: "แก้สถานที่", data: "intake:edit:location" },
      ...(requiresWorkTime ? [{ label: "แก้เวลา", data: "intake:edit:startTime" }] : [])]),
      { label: "เปลี่ยนวันที่", data: "intake:edit:date" },
      { label: "กลับสรุป", data: "intake:resume" }
    ] }
  };
  if (action.type === "edit") {
    if (current.step !== "review") return unchanged("กรุณาทำขั้นตอนปัจจุบันให้เสร็จก่อนแก้ไขครับ");
    if (draft.kind === "accommodation" && !["date", "day", "dateMonth", "dateYear", "amount"].includes(action.field)) return unchanged("รายการค่าที่พักแก้ไขวันที่และจำนวนเงินได้ครับ");
    if (draft.kind !== "accommodation" && action.field === "amount") return unchanged("กรุณาแก้ยอดเบี้ยเลี้ยงในเอกสารครับ");
    if (action.field === "date" && draft.kind === "accommodation") return {
      state: current, reply: { text: "ต้องการแก้ไขวันที่ เดือน หรือปีครับ", buttons: [
        { label: "แก้วันที่", data: "intake:edit:day" },
        { label: "แก้เดือน", data: "intake:edit:dateMonth" },
        { label: "แก้ปี", data: "intake:edit:dateYear" },
        { label: "กลับสรุป", data: "intake:resume" }
      ] }
    };
    const prompts = {
      day: "วันที่เข้าพักวันที่เท่าไหร่ครับ",
      dateMonth: "แก้เป็นเดือนอะไรครับ พิมพ์เลขเดือน 1–12",
      dateYear: "แก้เป็นปีอะไรครับ พิมพ์ปี พ.ศ. หรือ ค.ศ.",
      startTime: "เริ่มเวลาเท่าไหร่ครับ",
      endTime: "ถึงเวลาเท่าไหร่ครับ",
      amount: "ค่าที่พักที่ต้องการเบิกเท่าไหร่ครับ ใส่เฉพาะตัวเลขนะครับ",
      photo: "ส่งรูปใหม่ 1 รูปเพื่อแทนรูปเดิมครับ",
      subject: "พิมพ์หัวข้องานใหม่ครับ",
      location: "พิมพ์สถานที่ใหม่ครับ",
      date: draft.kind === "accommodation" ? "วันที่เข้าพักวันที่เท่าไหร่ครับ" : `พิมพ์แค่เลขวันที่ เช่น 25 ครับ ใช้เดือนและปีเดิม (${draft.workDate.slice(0, 7)})`
    };
    return { state: { step: action.field === "day" ? "date" : action.field, draft }, reply: { text: prompts[action.field], buttons: [cancelButton] } };
  }
  if (action.type === "confirm") {
    if (current.step === "review" && draft.kind !== "accommodation" && requiresWorkTime && (!draft.startTime || !draft.endTime)) return {
      state: { step: "startTime", draft }, reply: { text: "เริ่มเวลาเท่าไหร่ครับ", buttons: [cancelButton] }
    };
    if (current.step !== "review" || (draft.kind === "accommodation" ? !draft.accommodation : !draft.imageId || !draft.subject || !draft.location || (requiresWorkTime && (!draft.startTime || !draft.endTime)))) {
      return unchanged("กรุณาส่งรูป หัวข้องาน และสถานที่ให้ครบก่อนยืนยันครับ");
    }
    return {
      state: INITIAL_INTAKE_STATE,
      entry: { ...draft, imageId: draft.imageId ?? "" },
      reply: { text: draft.kind === "accommodation" ? "บันทึกค่าที่พักแล้วครับ" : "บันทึกรายการหน้างานแล้วครับ", buttons: [{ label: "เพิ่มข้อมูล", data: "intake:start" }] }
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
  if (current.step === "startTime" || current.step === "endTime") {
    const time = normalizeWorkTime(value);
    if (!time) return unchanged("กรอกเวลา เช่น 9, 09.30 หรือ 09:30 ครับ");
    if (current.step === "endTime" && draft.startTime && time < draft.startTime) return unchanged("เวลาสิ้นสุดต้องไม่ก่อนเวลาเริ่มต้นครับ");
    if (current.step === "startTime") {
      draft.startTime = time;
      return { state: { step: "endTime", draft }, reply: { text: "ถึงเวลาเท่าไหร่ครับ", buttons: [cancelButton] } };
    }
    draft.endTime = time;
  } else if (current.step === "dateMonth" || current.step === "dateYear") {
    if (!/^\d{1,4}$/.test(value)) return unchanged("กรุณาพิมพ์เป็นตัวเลขครับ");
    const number = Number(value);
    const year = number > 2400 ? number - 543 : number;
    const date = current.step === "dateMonth" ? `${draft.workDate.slice(0, 5)}${String(number).padStart(2, "0")}${draft.workDate.slice(7)}` : `${year}${draft.workDate.slice(4)}`;
    if (!validWorkDate(date, bangkokDate(now))) return unchanged("วันที่ไม่ถูกต้องหรืออยู่ในอนาคตครับ กรุณาตรวจสอบวันที่ เดือน และปี");
    draft.workDate = date;
  } else if (current.step === "date") {
    if (draft.kind === "accommodation" && !/^\d{1,2}$/.test(value)) return unchanged("กรอกเฉพาะเลขวันที่ครับ");
    const month = draft.workDate.slice(0, 7);
    const day = /^\d{1,2}$/.test(value) ? value.padStart(2, "0") : value.startsWith(month + "-") && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(8) : "";
    const date = `${month}-${day}`;
    if (!validWorkDate(date, bangkokDate(now))) return unchanged(draft.kind === "accommodation" ? "วันที่ไม่ถูกต้องหรืออยู่ในอนาคตครับ กรอกเฉพาะเลขวันที่" : "วันที่ไม่ถูกต้องหรืออยู่ในอนาคตครับ พิมพ์แค่เลขวันภายในเดือนเดิม เช่น 25");
    draft.workDate = date;
    if (draft.kind === "accommodation" && !draft.accommodation) return { state: { step: "amount", draft }, reply: { text: "ค่าที่พักที่ต้องการเบิกเท่าไหร่ครับ ใส่เฉพาะตัวเลขนะครับ", buttons: [cancelButton] } };
  } else if (current.step === "amount") {
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) return unchanged("เอาแค่ราคาพอครับ ถ้าใส่หน่วยมาด้วยระบบกรอกข้อมูลในช่องไม่ได้จ้า");
    if (!Number.isFinite(Number(value.replaceAll(",", ""))) || Number(value.replaceAll(",", "")) <= 0) return unchanged("กรุณากรอกค่าที่พักมากกว่า 0 บาท และทศนิยมไม่เกิน 2 ตำแหน่งครับ");
    draft.accommodation = Number(value.replaceAll(",", ""));
  } else {
    if (!value || value.length > 300) return unchanged("กรุณาพิมพ์ข้อมูล 1–300 ตัวอักษรครับ");
    if (current.step === "subject") {
      draft.subject = value;
      if (!draft.location) return { state: { step: "location", draft }, reply: { text: "สถานที่ปฏิบัติงานที่ไหนครับ?", buttons: [cancelButton] } };
    } else {
      draft.location = value;
      if (requiresWorkTime && !draft.startTime) return { state: { step: "startTime", draft }, reply: { text: "เริ่มเวลาเท่าไหร่ครับ", buttons: [cancelButton] } };
    }
  }
  return { state: { step: "review", draft }, reply: review(draft) };
}

/** Commands use postback data so a job title like “ยกเลิก” remains ordinary text. */
export function parseIntakePostback(data: string): IntakeAction {
  switch (data) {
    case "intake:edit:day": return { type: "edit", field: "day" };
    case "intake:edit:dateMonth": return { type: "edit", field: "dateMonth" };
    case "intake:edit:dateYear": return { type: "edit", field: "dateYear" };
    case "intake:edit:startTime": return { type: "edit", field: "startTime" };
    case "intake:edit:endTime": return { type: "edit", field: "endTime" };
    case "intake:accommodation": return { type: "startAccommodation" };
    case "intake:edit:amount": return { type: "edit", field: "amount" };
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
