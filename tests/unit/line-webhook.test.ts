import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createLineWebhookHandler } from "@/lib/line/webhook-handler";
import { eventToIntakeAction, toLineMessage, verifyLineSignature, type LineEvent } from "@/lib/line/webhook";

const secret = "test-secret-only";
function signedRequest(body: string) {
  return new Request("http://localhost/api/line/webhook", {
    method: "POST", body,
    headers: { "x-line-signature": createHmac("sha256", secret).update(body).digest("base64") }
  });
}
const event: LineEvent = {
  type: "message", webhookEventId: "event-1", timestamp: 1793030400000,
  source: { type: "user", userId: "user-1" }, replyToken: "test-reply",
  message: { id: "image-1", type: "image" }
};
const payload = JSON.stringify({ destination: "bot-1", events: [event] });

describe("LINE webhook boundary", () => {
  it("verifies original bytes and rejects modified or malformed signatures", () => {
    const raw = Buffer.from(payload);
    const signature = createHmac("sha256", secret).update(raw).digest("base64");
    expect(verifyLineSignature(raw, signature, secret)).toBe(true);
    expect(verifyLineSignature(Buffer.from(`${payload} `), signature, secret)).toBe(false);
    for (const bad of [null, "", "a", "!".repeat(44), signature.slice(1)]) {
      expect(verifyLineSignature(raw, bad, secret)).toBe(false);
    }
  });
  it("fails closed before credentials or durable storage are connected", async () => {
    expect((await createLineWebhookHandler({})(signedRequest(payload))).status).toBe(503);
    expect((await createLineWebhookHandler({ channelSecret: secret })(signedRequest(payload))).status).toBe(503);
  });
  it("allows LINE's empty-event verification once the secret is set", async () => {
    const response = await createLineWebhookHandler({ channelSecret: secret })(signedRequest(JSON.stringify({ destination: "bot-1", events: [] })));
    expect(response.status).toBe(200);
  });
  it("never passes invalid signatures, JSON, schemas or destinations to storage", async () => {
    const receive = vi.fn();
    const handler = createLineWebhookHandler({ channelSecret: secret, destinationId: "bot-1", receiver: { receive } });
    expect((await handler(new Request("http://localhost", { method: "POST", body: payload }))).status).toBe(401);
    expect((await handler(signedRequest("{"))).status).toBe(400);
    expect((await handler(signedRequest('{"events":[]}'))).status).toBe(400);
    expect((await handler(signedRequest('{"destination":"another-bot","events":[]}'))).status).toBe(403);
    expect(receive).not.toHaveBeenCalled();
  });
  it("acknowledges only after the receiver completes durable acceptance", async () => {
    const receive = vi.fn().mockResolvedValue(undefined);
    const handler = createLineWebhookHandler({ channelSecret: secret, receiver: { receive } });
    expect((await handler(signedRequest(payload))).status).toBe(200);
    expect(receive).toHaveBeenCalledWith([event]);
    receive.mockRejectedValueOnce(new Error("database connection with secret details"));
    const failed = await handler(signedRequest(payload));
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("secret details");
  });
  it("rejects oversized requests", async () => {
    const handler = createLineWebhookHandler({ channelSecret: secret });
    expect((await handler(signedRequest(" ".repeat(1024 * 1024 + 1)))).status).toBe(413);
  });
  it("ignores groups and maps private images, text and postbacks", () => {
    expect(eventToIntakeAction(event)).toEqual({ type: "image", imageId: "image-1" });
    expect(eventToIntakeAction({ ...event, source: { type: "group", userId: "user-1" } })).toBeNull();
    expect(eventToIntakeAction({ ...event, source: { type: "user" } })).toBeNull();
    expect(eventToIntakeAction({ ...event, message: { id: "text-1", type: "text", text: "งานถ่ายทำ" } })).toEqual({ type: "text", text: "งานถ่ายทำ" });
    expect(eventToIntakeAction({ ...event, type: "postback", postback: { data: "intake:start" } })).toEqual({ type: "start" });
    expect(eventToIntakeAction({ ...event, type: "follow" })).toBeNull();
  });
  it("preserves the long confirmation label using a Flex button", () => {
    const message = toLineMessage({ text: "ทดสอบ", buttons: [{ label: "ใช้แล้วข้อมูลถูกต้องเวรี่กู้ด", data: "intake:confirm" }] });
    expect(message.type).toBe("flex");
    if (message.type !== "flex") throw new Error("Expected a Flex message");
    if (!message.contents.footer) throw new Error("Expected review footer");
    expect(message.contents.footer.contents[0]).toMatchObject({ action: { type: "postback", data: "intake:confirm", label: "ใช้แล้วข้อมูลถูกต้องเวรี่กู้ด" } });
  });
});
