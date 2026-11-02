import { expect, it } from "vitest";
import { INITIAL_INTAKE_STATE, normalizeWorkTime, parseIntakePostback, transitionIntake, type IntakeAction } from "@/lib/line/intake";
import { INITIAL_EMPLOYEE_INTAKE_STATE, transitionEmployeeIntake, type EmployeeIntakeState } from "@/lib/line/employee-intake";
import { reportWorkItem } from "@/lib/reports/monthly-report";

const now = new Date("2026-11-02T02:00:00Z");
it.each([["9", "09:00"], ["09.30", "09:30"], ["18:45", "18:45"], ["24", null], ["9.60", null], ["9 โมง", null]])("normalizes work time %s", (input, expected) => {
  expect(normalizeWorkTime(input)).toBe(expected);
});

it("refreshes an existing LINE member's team and carries Event times into the document", async () => {
  const employee = { employeeId: "12345678", name: "ทดสอบ ระบบ", active: true };
  let state: EmployeeIntakeState = { ...INITIAL_EMPLOYEE_INTAKE_STATE, employee };
  const run = async (action: IntakeAction) => {
    const result = await transitionEmployeeIntake(state, action, now, () => ({ ...employee, team: "Event Activation / Mkt" }));
    state = result.state;
    return result;
  };
  await run({ type: "image", imageId: "drive:photo" });
  await run({ type: "text", text: "งานอีเวนต์" });
  expect((await run({ type: "text", text: "บางนา" })).reply.text).toBe("เริ่มเวลาเท่าไหร่ครับ");
  expect((await run({ type: "text", text: "9.30" })).reply.text).toBe("ถึงเวลาเท่าไหร่ครับ");
  expect((await run({ type: "text", text: "9" })).state.intake.step).toBe("endTime");
  await run({ type: "text", text: "18" });
  const result = await run({ type: "confirm" });
  expect(result.entry).toMatchObject({ startTime: "09:30", endTime: "18:00" });
  expect(reportWorkItem({ id: "entry", data: result.entry! })).toMatchObject({ startTime: "09:30", endTime: "18:00" });
});

it("asks for day only, validates price text, and edits lodging day/month/year separately", () => {
  let state = INITIAL_INTAKE_STATE;
  const run = (action: IntakeAction) => {
    const result = transitionIntake(state, action, now);
    state = result.state;
    return result;
  };
  expect(run({ type: "startAccommodation" }).reply.text).toBe("วันที่เข้าพักวันที่เท่าไหร่ครับ");
  expect(run({ type: "text", text: "2026-11-01" }).state.step).toBe("date");
  expect(run({ type: "text", text: "1" }).reply.text).toBe("ค่าที่พักที่ต้องการเบิกเท่าไหร่ครับ ใส่เฉพาะตัวเลขนะครับ");
  expect(run({ type: "text", text: "1200 บาท" }).reply.text).toBe("เอาแค่ราคาพอครับ ถ้าใส่หน่วยมาด้วยระบบกรอกข้อมูลในช่องไม่ได้จ้า");
  expect(run({ type: "text", text: "1200.50" }).reply.text).not.toContain("ไม่ต้องแนบรูปภาพ");
  const menu = run(parseIntakePostback("intake:edit:date"));
  expect(menu.reply.buttons.map(b => b.label)).toEqual(["แก้วันที่", "แก้เดือน", "แก้ปี", "กลับสรุป"]);
  run(parseIntakePostback("intake:edit:dateMonth"));
  run({ type: "text", text: "10" });
  run(parseIntakePostback("intake:edit:day"));
  run({ type: "text", text: "31" });
  run(parseIntakePostback("intake:edit:dateMonth"));
  expect(run({ type: "text", text: "2" }).state.step).toBe("dateMonth");
  run({ type: "text", text: "10" });
  run(parseIntakePostback("intake:edit:dateYear"));
  run({ type: "text", text: "2568" });
  expect(run({ type: "confirm" }).entry).toMatchObject({ workDate: "2025-10-31", accommodation: 1200.5 });
});


it("edits work month and Buddhist year without changing its times or other data", () => {
  const state = { step: "review" as const, draft: { workDate: "2026-11-01", subject: "งาน Event", location: "บางนา", imageId: "drive:photo", startTime: "09:30", endTime: "18:00" } };
  const menu = transitionIntake(state, { type: "editMenu" }, now, true);
  expect(menu.reply.buttons.map(b => b.data)).toEqual(expect.arrayContaining(["intake:edit:dateMonth", "intake:edit:dateYear"]));
  const month = transitionIntake(state, parseIntakePostback("intake:edit:dateMonth"), now, true);
  const revised = transitionIntake(month.state, { type: "text", text: "10" }, now, true);
  const year = transitionIntake(revised.state, parseIntakePostback("intake:edit:dateYear"), now, true);
  const result = transitionIntake(year.state, { type: "text", text: "2568" }, now, true);
  expect(result.state.draft).toMatchObject({ ...state.draft, workDate: "2025-10-01" });
});
