import { toLineMessages } from "./webhook";
import type { IntakeReply } from "./intake";

export class LineReplyRejected extends Error {
  constructor(public status: number) { super(`LINE reply rejected (${status})`); }
}
export class LineMediaRejected extends Error {}

export function validateEvidenceBytes(bytes: Uint8Array, mimeType: string) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) throw new LineMediaRejected("กรุณาส่งรูป JPG, PNG หรือ WebP ครับ");
  if (bytes.length > 8 * 1024 * 1024) throw new LineMediaRejected("รูปใหญ่เกิน 8 MB กรุณาส่งรูปที่เล็กลงครับ");
  const buffer = Buffer.from(bytes);
  const matchesType = mimeType === "image/jpeg" ? buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : mimeType === "image/png" ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  if (!matchesType) throw new LineMediaRejected("ไฟล์รูปไม่ถูกต้อง กรุณาส่งรูปใหม่ครับ");
}

export class LineClient {
  constructor(private accessToken: string, private request: typeof fetch = fetch) {}

  async reply(replyToken: string, reply: IntakeReply) {
    const response = await this.request("https://api.line.me/v2/bot/message/reply", {
      method: "POST", headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ replyToken, messages: toLineMessages(reply) }),
      signal: AbortSignal.timeout(10_000)
    });
    // Never include provider response bodies: they may contain employee data.
    if (!response.ok) throw new LineReplyRejected(response.status);
  }

  async image(messageId: string) {
    if (!/^[A-Za-z0-9_-]+$/.test(messageId)) throw new Error("Invalid LINE message ID");
    const response = await this.request(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }, signal: AbortSignal.timeout(15_000)
    });
    if ([404, 410].includes(response.status)) throw new LineMediaRejected("รูปนี้ไม่พร้อมดาวน์โหลด กรุณาส่งรูปใหม่ครับ");
    if (!response.ok) throw new Error(`LINE media download failed (${response.status})`);
    const mimeType = response.headers.get("content-type")?.split(";")[0].trim();
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType ?? "")) throw new LineMediaRejected("กรุณาส่งรูป JPG, PNG หรือ WebP ครับ");
    if (Number(response.headers.get("content-length")) > 8 * 1024 * 1024) throw new LineMediaRejected("รูปใหญ่เกิน 8 MB กรุณาส่งรูปที่เล็กลงครับ");
    if (!response.body) throw new Error("Empty image response");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8 * 1024 * 1024) throw new LineMediaRejected("รูปใหญ่เกิน 8 MB กรุณาส่งรูปที่เล็กลงครับ");
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const bytes = Buffer.concat(chunks);
    validateEvidenceBytes(bytes, mimeType!);
    return { bytes, mimeType: mimeType! };
  }
}
