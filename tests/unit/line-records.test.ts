import { describe, expect, it } from "vitest";
import { parseRecordCommand, parseRecordPostback, recordReply } from "@/lib/line/records";
import { INITIAL_INTAKE_STATE, transitionIntake } from "@/lib/line/intake";
import { toLineMessage } from "@/lib/line/webhook";

describe("compact review and record lookup", () => {
  it("keeps three review actions and puts edit choices in a separate menu", () => {
    const state = { step: "review" as const, draft: { workDate: "2026-10-26", imageId: "test-image", subject: "งาน", location: "บางนา" } };
    const review = transitionIntake(state, { type: "resume" }, new Date());
    expect(review.reply.buttons.map((button) => button.label)).toEqual(["ใช้แล้วข้อมูลถูกต้องเวรี่กู้ด", "แก้ไข", "ยกเลิก"]);
    const menu = transitionIntake(state, { type: "editMenu" }, new Date());
    expect(menu.reply.buttons).toHaveLength(5);
    expect(menu.state).toEqual(state);
    const message = toLineMessage({ ...review.reply, buttons: review.reply.buttons.map((button) => ({ ...button, data: `${button.data}|context` })) });
    expect(message.type).toBe("flex");
    if (message.type !== "flex") throw new Error("Expected Flex");
    if (!message.contents.footer) throw new Error("Expected review footer");
    expect(message.contents.size).toBe("mega");
    expect(message.contents.footer.contents).toHaveLength(2);
    expect(message.contents.footer.contents[0]).toMatchObject({ style: "primary", height: "sm" });
    expect(transitionIntake(INITIAL_INTAKE_STATE, { type: "editMenu" }, new Date()).entry).toBeUndefined();
  });
  it("supports the current month and an explicit past month without treating ordinary titles as queries", () => {
    expect(parseRecordCommand("ดูรายการ", "2026-10")).toEqual({ month: "2026-10", offset: 0 });
    expect(parseRecordCommand("ดูรายการ 2026-09", "2026-10")).toEqual({ month: "2026-09", offset: 0 });
    expect(parseRecordCommand("ถ่ายทำรายการ", "2026-10")).toBeNull();
    expect(parseRecordCommand("ดูรายการ 2026-13", "2026-10")).toBeNull();
    expect(parseRecordPostback("records:2026-09:5")).toEqual({ month: "2026-09", offset: 5 });
    expect(parseRecordPostback("records:2026-09:10001")).toBeNull();
    expect(parseRecordPostback("records:2026-13:0")).toBeNull();
  });
  it("offers pagination and a way back to an unfinished draft", () => {
    const reply = recordReply({ entries: [], hasMore: true }, "2026-10", 5, true);
    expect(reply.buttons.map((button) => button.data)).toEqual(["records:2026-10:0", "records:2026-10:10", "intake:resume"]);
  });
});
