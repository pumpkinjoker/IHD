import { describe, expect, it } from "vitest";
import {
  bangkokDate, INITIAL_INTAKE_STATE, parseIntakePostback, transitionIntake,
  type IntakeAction, type IntakeState
} from "@/lib/line/intake";

const now = new Date("2026-10-26T18:30:00Z");
function run(actions: IntakeAction[]) {
  let state: IntakeState = INITIAL_INTAKE_STATE;
  let result = transitionIntake(state, { type: "unsupported" }, now);
  for (const action of actions) {
    result = transitionIntake(state, action, now);
    state = result.state;
  }
  return result;
}
const completed: IntakeAction[] = [
  { type: "start" }, { type: "image", imageId: "line-image-1" },
  { type: "text", text: "ถ่ายทำหน้างาน" }, { type: "text", text: "บางนา" }
];

describe("LINE work entry conversation", () => {
  it("uses the Bangkok calendar date across UTC midnight boundaries", () => {
    expect(bangkokDate(now)).toBe("2026-10-27");
    expect(bangkokDate(new Date("2026-12-31T18:00:00Z"))).toBe("2027-01-01");
  });
  it("requires photo, subject and location in that order and saves only after confirmation", () => {
    const review = run(completed);
    expect(review.state.step).toBe("review");
    expect(review.entry).toBeUndefined();
    const confirmed = transitionIntake(review.state, { type: "confirm" }, now);
    expect(confirmed.entry).toEqual({ workDate: "2026-10-27", imageId: "line-image-1", subject: "ถ่ายทำหน้างาน", location: "บางนา" });
    expect(confirmed.state.step).toBe("idle");
    expect(transitionIntake(confirmed.state, { type: "confirm" }, now).entry).toBeUndefined();
  });
  it("does not replace the first photo with an accidental second image", () => {
    const result = run([...completed.slice(0, 2), { type: "image", imageId: "second-image" }]);
    expect(result.state.step).toBe("subject");
    expect(result.state.draft?.imageId).toBe("line-image-1");
  });
  it("requires an image before text and never confirms an incomplete entry", () => {
    expect(run([{ type: "start" }, { type: "text", text: "หัวข้อ" }]).state.step).toBe("photo");
    expect(run([{ type: "start" }, { type: "confirm" }]).entry).toBeUndefined();
    expect(run([{ type: "start" }, { type: "image", imageId: " " }]).state.step).toBe("photo");
  });
  it("rejects blank and overly long subject or location", () => {
    for (const text of ["  ", "ก".repeat(301)]) {
      expect(run([...completed.slice(0, 2), { type: "text", text }]).state.step).toBe("subject");
      expect(run([...completed.slice(0, 3), { type: "text", text }]).state.step).toBe("location");
    }
  });
  it("does not treat a title that resembles a command as a command", () => {
    expect(run([...completed.slice(0, 2), { type: "text", text: "ยกเลิก" }]).state.draft?.subject).toBe("ยกเลิก");
  });
  it("requires explicit cancellation before starting over", () => {
    const state = run(completed).state;
    expect(transitionIntake(state, { type: "start" }, now).state).toEqual(state);
    const cancelled = transitionIntake(state, { type: "cancel" }, now);
    expect(cancelled.state).toEqual(INITIAL_INTAKE_STATE);
    expect(cancelled.entry).toBeUndefined();
  });
  it("edits one field without clearing the other fields", () => {
    const result = run([...completed, { type: "edit", field: "subject" }, { type: "text", text: "หัวข้อใหม่" }]);
    expect(result.state.step).toBe("review");
    expect(result.state.draft).toMatchObject({ subject: "หัวข้อใหม่", location: "บางนา", imageId: "line-image-1" });
    const photo = transitionIntake(result.state, { type: "edit", field: "photo" }, now);
    const replaced = transitionIntake(photo.state, { type: "image", imageId: "new-photo" }, now);
    expect(replaced.state.step).toBe("review");
    expect(replaced.state.draft?.imageId).toBe("new-photo");
  });
  it("accepts day-only edits in the original month and rejects invalid, future or cross-month dates", () => {
    const state = run([...completed, { type: "edit", field: "date" }]).state;
    for (const text of ["0", "32", "28", "2026-02-28", "2026-02-30", "2026-13-01", "2026-10-28", "27/10/2569", ""]) {
      expect(transitionIntake(state, { type: "text", text }, now).state.step).toBe("date");
    }
    expect(transitionIntake(state, { type: "text", text: "25" }, now).state.draft?.workDate).toBe("2026-10-25");
    expect(transitionIntake(state, { type: "text", text: "3" }, now).state.draft?.workDate).toBe("2026-10-03");
  });
  it("keeps independent employees' conversation state isolated", () => {
    const first = run(completed).state;
    const second = run([{ type: "start" }]).state;
    transitionIntake(second, { type: "cancel" }, now);
    expect(first.draft?.subject).toBe("ถ่ายทำหน้างาน");
    expect(second.step).toBe("photo");
  });
  it("only accepts known postback commands", () => {
    expect(parseIntakePostback("intake:edit:date")).toEqual({ type: "edit", field: "date" });
    expect(parseIntakePostback("intake:delete-all")).toEqual({ type: "unsupported" });
  });
});
