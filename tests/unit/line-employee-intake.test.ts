import { describe, expect, it, vi } from "vitest";
import {
  INITIAL_EMPLOYEE_INTAKE_STATE, transitionEmployeeIntake, parseEmployeeIntakePostback,
  type EmployeeIntakeAction, type EmployeeIntakeState, type IntakeEmployee
} from "@/lib/line/employee-intake";

const now = new Date("2026-10-26T06:00:00Z");
const employee: IntakeEmployee = { employeeId: "12345678", name: "พนักงานทดสอบ", active: true };
const other: IntakeEmployee = { employeeId: "87654321", name: "พนักงานคนที่สอง", active: true };
const find = (id: string) => [employee, other].find((item) => item.employeeId === id) ?? null;
const register: EmployeeIntakeAction[] = [{ type: "start" }, { type: "text", text: employee.employeeId }, { type: "confirmEmployee" }];
const work: EmployeeIntakeAction[] = [{ type: "image", imageId: "image-1" }, { type: "text", text: "หัวข้องาน" }, { type: "text", text: "สถานที่" }];
async function run(actions: EmployeeIntakeAction[], lookup = find) {
  let state: EmployeeIntakeState = INITIAL_EMPLOYEE_INTAKE_STATE;
  let result = { state, reply: { text: "", buttons: [] } } as Awaited<ReturnType<typeof transitionEmployeeIntake>>;
  for (const action of actions) {
    result = await transitionEmployeeIntake(state, action, now, lookup);
    state = result.state;
  }
  return result;
}

describe("employee ID association without OTP", () => {
  it("asks for the employee ID before accepting a photo", async () => {
    const result = await run([{ type: "start" }, { type: "image", imageId: "ignored" }]);
    expect(result.state.onboarding).toBe("employeeId");
    expect(result.state.intake.step).toBe("idle");
    expect(result.entry).toBeUndefined();
  });
  it("looks up an exact ID and requires name confirmation before starting intake", async () => {
    const candidate = await run(register.slice(0, 2));
    expect(candidate.state.employee).toBeNull();
    expect(candidate.state.candidate).toEqual(employee);
    expect(candidate.reply.text).toContain(employee.name);
    const linked = await run(register);
    expect(linked.state.employee).toEqual(employee);
    expect(linked.state.intake.step).toBe("photo");
  });
  it("rejects malformed, unknown and inactive employee IDs", async () => {
    for (const id of ["abc", "123", "00000000"]) {
      const result = await run([{ type: "start" }, { type: "text", text: id }]);
      expect(result.state.employee).toBeNull();
      expect(result.state.candidate).toBeNull();
    }
    const inactive = await run(register, () => ({ ...employee, active: false }));
    expect(inactive.state.employee).toBeNull();
  });
  it("clears a previous candidate when a replacement ID is invalid", async () => {
    const result = await run([...register.slice(0, 2), { type: "text", text: "bad" }, { type: "confirmEmployee" }]);
    expect(result.state.employee).toBeNull();
    expect(result.state.candidate).toBeNull();
  });
  it("does not associate an employee who was removed before confirmation", async () => {
    const candidate = await run(register.slice(0, 2));
    const result = await transitionEmployeeIntake(candidate.state, { type: "confirmEmployee" }, now, () => null);
    expect(result.state.employee).toBeNull();
    expect(result.state.onboarding).toBe("employeeId");
  });
  it("stamps the confirmed employee on entries and remembers it for the next job", async () => {
    const saved = await run([...register, ...work, { type: "confirm" }]);
    expect(saved.entry).toMatchObject({ employeeId: employee.employeeId, employeeName: employee.name });
    expect(saved.state.employee).toEqual(employee);
    const next = await transitionEmployeeIntake(saved.state, { type: "start" }, now, find);
    expect(next.state.intake.step).toBe("photo");
    expect(next.reply.text).toContain(employee.name);
    const duplicate = await transitionEmployeeIntake(saved.state, { type: "confirm" }, now, find);
    expect(duplicate.entry).toBeUndefined();
  });
  it("keeps the employee when cancelling a job but does not create an entry", async () => {
    const result = await run([...register, ...work, { type: "cancel" }]);
    expect(result.state.employee).toEqual(employee);
    expect(result.state.intake.step).toBe("idle");
    expect(result.entry).toBeUndefined();
  });
  it("does not change employee during an unfinished job", async () => {
    const result = await run([...register, ...work, { type: "changeEmployee" }]);
    expect(result.state.employee).toEqual(employee);
    expect(result.state.intake.step).toBe("review");
  });
  it("allows changing employee between jobs without changing earlier entries", async () => {
    const first = await run([...register, ...work, { type: "confirm" }]);
    const changing = await transitionEmployeeIntake(first.state, { type: "changeEmployee" }, now, find);
    const candidate = await transitionEmployeeIntake(changing.state, { type: "text", text: other.employeeId }, now, find);
    const result = await transitionEmployeeIntake(candidate.state, { type: "confirmEmployee" }, now, find);
    expect(result.state.employee).toEqual(other);
    expect(first.entry?.employeeId).toBe(employee.employeeId);
  });
  it("refuses to save when an employee is no longer active", async () => {
    const review = await run([...register, ...work]);
    const result = await transitionEmployeeIntake(review.state, { type: "confirm" }, now, () => null);
    expect(result.entry).toBeUndefined();
    expect(result.state.employee).toBeNull();
  });
  it("keeps separate user sessions independent", async () => {
    const first = await run(register);
    const second = await run([{ type: "start" }, { type: "text", text: other.employeeId }, { type: "confirmEmployee" }]);
    expect(first.state.employee).toEqual(employee);
    expect(second.state.employee).toEqual(other);
  });
  it("uses only known account postbacks and does not look up users for unrelated messages", async () => {
    expect(parseEmployeeIntakePostback("employee:confirm")).toEqual({ type: "confirmEmployee" });
    expect(parseEmployeeIntakePostback("employee:change")).toEqual({ type: "changeEmployee" });
    const lookup = vi.fn(find);
    await transitionEmployeeIntake(INITIAL_EMPLOYEE_INTAKE_STATE, { type: "text", text: "สวัสดี" }, now, lookup);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("accepts an employee ID as the first message without requiring Start", async () => {
    const result = await run([{ type: "text", text: employee.employeeId }]);
    expect(result.state.onboarding).toBe("confirmation");
    expect(result.state.candidate).toEqual(employee);
    expect(result.reply.text).toContain(employee.name);
    const linked = await transitionEmployeeIntake(result.state, { type: "confirmEmployee" }, now, find);
    expect(linked.state.employee).toEqual(employee);
    expect(linked.state.intake.step).toBe("photo");
  });

  it("starts a new entry directly from a photo after completing the previous job", async () => {
    const first = await run([...register, ...work, { type: "confirm" }]);
    const second = await transitionEmployeeIntake(first.state, { type: "image", imageId: "second-photo" }, now, find);
    expect(second.state.intake.step).toBe("subject");
    expect(second.state.intake.draft).toEqual({ workDate: "2026-10-26", imageId: "second-photo", subject: "", location: "" });
    expect(second.reply.text).toContain("งานนี้หัวข้ออะไรครับ?");
    expect(second.reply.text).toContain(employee.name);
    expect(second.entry).toBeUndefined();
    expect(first.entry?.imageId).toBe("image-1");
  });

  it("can start from a photo after cancellation but never replaces an unfinished entry", async () => {
    const cancelled = await run([...register, { type: "cancel" }]);
    const next = await transitionEmployeeIntake(cancelled.state, { type: "image", imageId: "new-photo" }, now, find);
    const extra = await transitionEmployeeIntake(next.state, { type: "image", imageId: "unwanted-photo" }, now, find);
    expect(extra.state.intake.step).toBe("subject");
    expect(extra.state.intake.draft?.imageId).toBe("new-photo");
    expect(extra.entry).toBeUndefined();
  });

  it("rechecks active employee status when a photo starts a new entry", async () => {
    const saved = await run([...register, ...work, { type: "confirm" }]);
    const result = await transitionEmployeeIntake(saved.state, { type: "image", imageId: "new-photo" }, now, () => null);
    expect(result.state.employee).toBeNull();
    expect(result.state.intake.draft).toBeNull();
    expect(result.state.onboarding).toBe("employeeId");
  });
});
