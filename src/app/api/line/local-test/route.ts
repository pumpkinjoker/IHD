import { randomUUID } from "node:crypto";
import { configuredLineStore, configuredEvidenceArchive } from "@/lib/line/config";
import { allowsLocalTest } from "@/lib/line/local-test-access";
import { createLineReceiver } from "@/lib/line/receiver";
import type { LineEvent } from "@/lib/line/webhook";
import { LineMediaRejected, validateEvidenceBytes } from "@/lib/line/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const testUserId = "local-browser-test-user";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  if (!allowsLocalTest(request)) return new Response(null, { status: 404 });
  try {
    const store = configuredLineStore();
    const reference = new URL(request.url).searchParams.get("image");
    if (reference) {
      if (!await store.ownsImage(testUserId, reference)) return new Response(null, { status: 404 });
      const media = await configuredEvidenceArchive().readEvidence(reference);
      return new Response(media.bytes, { headers: { "Content-Type": media.mimeType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }
    return json(await store.snapshot(testUserId));
  } catch { return json({ error: "อ่านข้อมูลในเครื่องไม่สำเร็จ กรุณาลองอีกครั้งครับ" }, 503); }
}

export async function POST(request: Request) {
  if (!allowsLocalTest(request)) return new Response(null, { status: 404 });
  if (Number(request.headers.get("content-length")) > 9 * 1024 * 1024) return json({ error: "รูปใหญ่เกิน 8 MB ครับ" }, 413);
  let event: LineEvent;
  let media: { bytes: Uint8Array; mimeType: string } | undefined;
  try {
    const form = await request.formData();
    const kind = form.get("kind");
    event = { type: "message", webhookEventId: randomUUID(), timestamp: Date.now(), source: { type: "user", userId: testUserId }, replyToken: "local-test-no-network" };
    if (kind === "postback") {
      const data = form.get("data");
      if (typeof data !== "string" || data.length > 300) return json({ error: "คำสั่งไม่ถูกต้อง" }, 400);
      event = { ...event, type: "postback", postback: { data } };
    } else if (kind === "text") {
      const text = form.get("text");
      if (typeof text !== "string" || !text.trim() || text.length > 300) return json({ error: "กรุณากรอกข้อความ 1–300 ตัวอักษร" }, 400);
      event.message = { id: randomUUID(), type: "text", text };
    } else if (kind === "image") {
      const file = form.get("file");
      if (!(file instanceof File) || file.size > 8 * 1024 * 1024) return json({ error: "กรุณาเลือกรูปขนาดไม่เกิน 8 MB" }, 400);
      const bytes = new Uint8Array(await file.arrayBuffer());
      validateEvidenceBytes(bytes, file.type);
      media = { bytes, mimeType: file.type };
      event.message = { id: randomUUID(), type: "image" };
    } else return json({ error: "คำสั่งไม่ถูกต้อง" }, 400);
  } catch (error) {
    return json({ error: error instanceof LineMediaRejected ? error.message : "ข้อมูลไม่ถูกต้อง กรุณาลองอีกครั้ง" }, 400);
  }
  try {
    const store = configuredLineStore();
    const receiver = createLineReceiver({
      store, archive: configuredEvidenceArchive(),
      employees: (id) => store.findEmployee(id),
      // Exercise the real receiver without making any request to LINE or Google.
      line: { reply: async () => {}, image: async () => { if (!media) throw new Error("No test media"); return media; } }
    });
    await receiver.receive([event]);
    return json(await store.snapshot(testUserId));
  } catch { return json({ error: "บันทึกข้อมูลในเครื่องไม่สำเร็จ กรุณาลองอีกครั้งครับ" }, 503); }
}
