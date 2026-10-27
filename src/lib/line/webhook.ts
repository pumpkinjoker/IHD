import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { parseEmployeeIntakePostback, type EmployeeIntakeAction } from "./employee-intake";
import type { IntakeReply } from "./intake";

const sourceSchema = z.object({ type: z.string(), userId: z.string().optional() });
const eventSchema = z.object({
  type: z.string(),
  webhookEventId: z.string().min(1),
  timestamp: z.number().int().nonnegative(),
  source: sourceSchema,
  replyToken: z.string().optional(),
  message: z.object({ id: z.string(), type: z.string(), text: z.string().optional() }).optional(),
  postback: z.object({ data: z.string() }).optional()
});
export const webhookSchema = z.object({ destination: z.string().min(1), events: z.array(eventSchema).max(100) });
export type LineEvent = z.infer<typeof eventSchema>;

export function verifyLineSignature(rawBody: Buffer, signature: string | null, secret: string) {
  if (!signature || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(signature, "base64");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function eventToIntakeAction(event: LineEvent): EmployeeIntakeAction | null {
  // Shared/group chats must never populate an employee's private claim.
  if (event.source.type !== "user" || !event.source.userId) return null;
  if (event.type === "postback" && event.postback) return parseEmployeeIntakePostback(event.postback.data);
  if (event.type !== "message" || !event.message) return null;
  if (event.message.type === "image") return { type: "image", imageId: event.message.id };
  if (event.message.type === "text" && typeof event.message.text === "string") {
    return { type: "text", text: event.message.text };
  }
  return { type: "unsupported" };
}

/** LINE message format; same buttons as the simulator. */
export function toLineMessage(reply: IntakeReply) {
  if (reply.table) {
    const table = reply.table;
    // An invisible larger span reserves ascent/descent inside LINE's text line;
    // visible text stays 12px. Outer box padding alone did not protect marks.
    const text = (value: string, extra: Record<string, unknown> = {}) => {
      const { flex, margin, size = "12px", weight, color, compact = false, ...style } = extra;
      const lineSize = size === "16px" ? "20px" : size === "14px" ? "18px" : "16px";
      const strut = { type: "span", text: "\u200B", size: lineSize };
      return { type: "box", layout: "vertical", paddingTop: compact ? "0px" : "1px", paddingBottom: compact ? "0px" : "1px", ...(flex === undefined ? {} : { flex }), ...(margin === undefined ? {} : { margin }),
        contents: [{ type: "text", size: lineSize, wrap: true, lineSpacing: "4px", ...style, contents: [strut,
          { type: "span", text: value || "—", size, ...(weight === undefined ? {} : { weight }), ...(color === undefined ? {} : { color }) }, strut] }] };
    };
    const column = (value: string, width: string, extra: Record<string, unknown> = {}) => ({ type: "box", layout: "vertical", width, flex: 0, contents: [text(value, extra)] });
    return {
      type: "flex" as const, altText: reply.text.slice(0, 400),
      contents: { type: "bubble", size: "mega", body: { type: "box", layout: "vertical", paddingAll: "16px", spacing: "8px", contents: [
        { type: "box", layout: "vertical", spacing: "2px", contents: [text(table.title, { size: "16px", weight: "bold" }), text(table.subtitle, { color: "#666666" })] },
        { type: "separator" },
        { type: "box", layout: "horizontal", spacing: "sm", margin: "14px", contents: [column("วันที่", "48px", { weight: "bold", wrap: false }), text("รายการ / สถานที่", { flex: 1, weight: "bold", wrap: false }), column("เบิกค่าใช้จ่าย", "96px", { align: "end", weight: "bold", wrap: false })] },
        { type: "box", layout: "vertical", spacing: "16px", margin: "0px", contents: table.rows.map((row) => ({ type: "box", layout: "horizontal", spacing: "sm", contents: [
          column(row.date, "48px", { wrap: false, compact: true }),
          { type: "box", layout: "vertical", flex: 1, spacing: "none", contents: [text(row.subject, { compact: true }), text(row.location, { color: "#777777", compact: true })] },
          column(row.amount, "96px", { align: "end", wrap: false, compact: true })
        ] })) },
        { type: "separator" }, text(`เบิกค่าใช้จ่ายทั้งหมด ${table.total} บาท`, { size: "14px", weight: "bold", margin: "14px", align: "end" })
      ] } },
      ...(reply.buttons.length ? { quickReply: { items: reply.buttons.map((button) => ({ type: "action", action: { type: "postback", label: button.label, data: button.data, displayText: button.label } })) } } : {})
    };
  }
  // Quick reply labels allow 20 characters; Flex buttons allow 40. Preserve the
  // user's chosen long confirmation wording rather than truncating it.
  if (reply.buttons.some((button) => button.label.length > 20)) {
    const primary = reply.buttons.filter((button) => button.data.split("|")[0] === "intake:confirm");
    const secondary = reply.buttons.filter((button) => button.data.split("|")[0] !== "intake:confirm");
    const buttonComponent = (button: { label: string; data: string }, primary = false) => ({
      type: "button", style: primary ? "primary" : "secondary", height: "sm",
      action: { type: "postback", label: button.label, data: button.data, displayText: button.label }
    });
    return {
      type: "flex" as const,
      altText: reply.text.slice(0, 400),
      contents: {
        type: "bubble", size: "mega",
        body: { type: "box", layout: "vertical", paddingAll: "16px", contents: [{ type: "text", text: reply.text, size: "12px", wrap: true, lineSpacing: "10px" }] },
        footer: { type: "box", layout: "vertical", paddingAll: "12px", spacing: "sm", contents: [
          ...primary.map((button) => buttonComponent(button, true)),
          ...(secondary.length ? [{ type: "box", layout: secondary.length <= 2 ? "horizontal" : "vertical", spacing: "sm", contents: secondary.map((button) => buttonComponent(button)) }] : [])
        ] }
      }
    };
  }
  return {
    type: "text" as const,
    text: reply.text,
    ...(reply.buttons.length ? {
      quickReply: { items: reply.buttons.map((button) => ({
        type: "action", action: { type: "postback", label: button.label, data: button.data, displayText: button.label }
      })) }
    } : {})
  };
}
