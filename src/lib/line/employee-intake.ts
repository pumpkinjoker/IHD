import {
  INITIAL_INTAKE_STATE, parseIntakePostback, transitionIntake,
  type IntakeAction, type IntakeDraft, type IntakeReply, type IntakeState
} from "./intake";

export type IntakeEmployee = { employeeId: string; name: string; active: boolean };
export type EmployeeLookup = (employeeId: string) => IntakeEmployee | null | Promise<IntakeEmployee | null>;
export type EmployeeIntakeAction = IntakeAction | { type: "confirmEmployee" } | { type: "changeEmployee" };
export type EmployeeIntakeState = {
  employee: IntakeEmployee | null;
  candidate: IntakeEmployee | null;
  onboarding: "idle" | "employeeId" | "confirmation";
  intake: IntakeState;
};
export type EmployeeWorkEntry = IntakeDraft & { imageId: string; employeeId: string; employeeName: string };
export type EmployeeIntakeResult = { state: EmployeeIntakeState; reply: IntakeReply; entry?: EmployeeWorkEntry };

export const INITIAL_EMPLOYEE_INTAKE_STATE: EmployeeIntakeState = {
  employee: null, candidate: null, onboarding: "idle", intake: INITIAL_INTAKE_STATE
};
const cancel = { label: "ยกเลิก", data: "intake:cancel" };
const start = { label: "เพิ่มข้อมูล", data: "intake:start" };
const change = { label: "เปลี่ยนรหัสพนักงาน", data: "employee:change" };

/** Employee ID is a self-declared association, not proof of identity. */
export async function transitionEmployeeIntake(
  current: EmployeeIntakeState,
  action: EmployeeIntakeAction,
  now: Date,
  findEmployee: EmployeeLookup
): Promise<EmployeeIntakeResult> {
  const reply = (text: string, buttons = [cancel], state = current): EmployeeIntakeResult => ({ state, reply: { text, buttons } });
  const askEmployee = (): EmployeeIntakeResult => reply(
    "ใช้งานครั้งแรก กรุณาพิมพ์รหัสพนักงาน 8 หลักครับ",
    [cancel], { ...INITIAL_EMPLOYEE_INTAKE_STATE, onboarding: "employeeId" }
  );

  if (action.type === "cancel" && current.onboarding !== "idle") {
    return reply("ยกเลิกการเลือกรหัสพนักงานแล้วครับ", [start], INITIAL_EMPLOYEE_INTAKE_STATE);
  }
  if (action.type === "changeEmployee") {
    if (current.intake.step !== "idle") return reply("กรุณาบันทึกหรือยกเลิกรายการที่กำลังทำก่อนเปลี่ยนรหัสพนักงานครับ");
    return askEmployee();
  }
  if (!current.employee) {
    if (action.type === "start") {
      if (current.onboarding !== "idle") return reply("กรุณากรอกรหัสพนักงานและเลือกชื่อให้เรียบร้อยก่อนครับ");
      return askEmployee();
    }
    if (action.type === "text") {
      const employeeId = action.text.trim();
      if (!/^\d{8}$/.test(employeeId)) return reply("กรุณาพิมพ์รหัสพนักงานเป็นตัวเลข 8 หลักครับ", [cancel], { ...current, candidate: null, onboarding: "employeeId" });
      const employee = await findEmployee(employeeId);
      if (!employee || !employee.active || employee.employeeId !== employeeId) {
        return reply("ไม่พบรหัสพนักงานที่ใช้งานอยู่ กรุณาตรวจสอบรหัสแล้วลองใหม่ครับ", [cancel], { ...current, candidate: null, onboarding: "employeeId" });
      }
      return reply(
        `รหัส ${employee.employeeId}\nชื่อ ${employee.name}\nใช้ชื่อนี้บันทึกข้อมูลใช่ไหมครับ?`,
        [{ label: "ใช่ เป็นข้อมูลของฉัน", data: "employee:confirm" }, change, cancel],
        { ...current, candidate: employee, onboarding: "confirmation" }
      );
    }
    if (action.type === "confirmEmployee" && current.onboarding === "confirmation" && current.candidate) {
      // Read the directory again so a deactivated or removed employee cannot bind.
      const employee = await findEmployee(current.candidate.employeeId);
      if (!employee?.active || employee.employeeId !== current.candidate.employeeId) return askEmployee();
      const result = transitionIntake(INITIAL_INTAKE_STATE, { type: "start" }, now);
      return {
        state: { employee, candidate: null, onboarding: "idle", intake: result.state },
        reply: { ...result.reply, text: `บันทึกในชื่อ ${employee.name} (${employee.employeeId})\n${result.reply.text}` }
      };
    }
    return current.onboarding === "idle" ? askEmployee() : reply("กรุณาพิมพ์รหัสพนักงาน หรือกดเลือกชื่อที่แสดงอยู่ครับ");
  }

  if (action.type === "confirmEmployee") return reply("เลือกรหัสพนักงานไว้แล้วครับ", [start, change]);
  const imageStartsEntry = action.type === "image" && current.intake.step === "idle";
  // Check active membership at the start and before committing; no OTP is used.
  if (action.type === "start" || action.type === "confirm" || imageStartsEntry) {
    const employee = await findEmployee(current.employee.employeeId);
    if (!employee?.active || employee.employeeId !== current.employee.employeeId) return askEmployee();
  }
  const intake = imageStartsEntry
    ? transitionIntake(INITIAL_INTAKE_STATE, { type: "start" }, now).state
    : current.intake;
  const result = transitionIntake(intake, action, now);
  const replyText = action.type === "start" || imageStartsEntry
    ? `บันทึกในชื่อ ${current.employee.name} (${current.employee.employeeId})\n${result.reply.text}`
    : result.reply.text;
  return {
    state: { ...current, intake: result.state },
    reply: {
      ...result.reply,
      text: result.state.step === "idle" ? `${replyText}\nครั้งต่อไปส่งรูปเพื่อเริ่มรายการใหม่ได้เลยครับ` : replyText,
      buttons: result.state.step === "idle" ? [...result.reply.buttons, change] : result.reply.buttons
    },
    ...(result.entry ? { entry: {
      ...result.entry,
      employeeId: current.employee.employeeId,
      employeeName: current.employee.name
    } } : {})
  };
}

export function parseEmployeeIntakePostback(data: string): EmployeeIntakeAction {
  if (data === "employee:confirm") return { type: "confirmEmployee" };
  if (data === "employee:change") return { type: "changeEmployee" };
  return parseIntakePostback(data);
}
