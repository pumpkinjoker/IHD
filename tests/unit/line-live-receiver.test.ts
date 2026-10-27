import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createLineReceiver, type ReceiverDependencies } from "@/lib/line/receiver";
import { SupabaseLineStore } from "@/lib/line/store";
import { LineMediaRejected, LineReplyRejected } from "@/lib/line/client";
import type { LineEvent } from "@/lib/line/webhook";
import type { IntakeReply } from "@/lib/line/intake";

let db: PGlite;
let sequence = 0;
const employee = { employeeId: "12345678", name: "ทดสอบ ระบบ", active: true };
const timestamp = Date.parse("2026-10-26T06:00:00Z");
const rpcNames = new Set(["line_begin_event", "line_finish_event", "line_release_event", "line_claim_media", "line_release_media"]);

// Exercise the production REST adapter against actual PostgreSQL functions,
// without an external account or real employee data.
const databaseFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  if (url.pathname.endsWith("/line_work_entries") && init?.method === "GET") {
    if (url.searchParams.has("work_date")) return Response.json((await db.query("select id from public.line_work_entries where employee_id=$1 and work_date=$2::date limit 1", [url.searchParams.get("employee_id")!.slice(3),url.searchParams.get("work_date")!.slice(3)])).rows);
    const month = url.searchParams.get("and")!.match(/work_date.gte.(\d{4}-\d{2})/)![1];
    const result = await db.query(`select data from public.line_work_entries where user_id=$1 and employee_id=$2 and to_char(work_date,'YYYY-MM')=$3
      order by work_date desc,created_at desc,id desc limit $4 offset $5`, [url.searchParams.get("user_id")!.slice(3), url.searchParams.get("employee_id")!.slice(3), month, Number(url.searchParams.get("limit")), Number(url.searchParams.get("offset"))]);
    return Response.json(result.rows);
  }
  if (url.pathname.includes("/rpc/")) {
    const fn = url.pathname.split("/").at(-1)!;
    if (!rpcNames.has(fn)) throw new Error("Unknown RPC");
    const args = Object.values(body).map((value) => value !== null && typeof value === "object" ? JSON.stringify(value) : value);
    const result = await db.query<{ value: unknown }>(`select public.${fn}(${args.map((_, index) => `$${index + 1}`).join(",")}) as value`, args);
    return Response.json(result.rows[0].value ?? null);
  }
  if (url.pathname.endsWith("/line_events")) {
    await db.query("update public.line_events set reply_status=$1 where event_id=$2 and reply_status='pending'", [body.reply_status, url.searchParams.get("event_id")!.slice(3)]);
    return new Response(null, { status: 204 });
  }
  throw new Error("Unexpected database URL");
};
const store = new SupabaseLineStore("https://database.test", "test-server-key", databaseFetch);

function message(type: "text" | "image", text = "", userId = "user-1"): LineEvent {
  const id = `event-${++sequence}`;
  return { type: "message", webhookEventId: id, timestamp: timestamp + sequence, replyToken: `reply-${id}`,
    source: { type: "user", userId }, message: { id: `message-${sequence}`, type, ...(type === "text" ? { text } : {}) } };
}
function postback(data: string, context?: string, userId = "user-1"): LineEvent {
  const event = message("text", "", userId);
  return { ...event, type: "postback", message: undefined, postback: { data: context ? `${data}|${context}` : data } };
}
function harness(summary?: ReceiverDependencies["summary"], summaryLink?: ReceiverDependencies["summaryLink"]) {
  const line = { reply: vi.fn<(token: string, reply: IntakeReply) => Promise<void>>().mockResolvedValue(undefined),
    image: vi.fn().mockResolvedValue({ bytes: new Uint8Array([255, 216, 255]), mimeType: "image/jpeg" }) };
  const drive = { saveEvidence: vi.fn().mockResolvedValue("drive:file-1"), placeEvidence: vi.fn().mockResolvedValue(undefined) };
  const employees = vi.fn((id: string) => id === employee.employeeId ? employee : null);
  const receiver = createLineReceiver({ store, line, archive: drive, employees, summary, summaryLink });
  return { line, drive, receiver, employees };
}
async function register(h: ReturnType<typeof harness>) {
  await h.receiver.receive([postback("intake:start")]);
  const id = message("text", employee.employeeId);
  await h.receiver.receive([id]);
  await h.receiver.receive([postback("employee:confirm", id.webhookEventId)]);
}
async function prepare(h: ReturnType<typeof harness>) {
  await register(h);
  await h.receiver.receive([message("image"), message("text", "ถ่ายทำ"), message("text", "บางนา")]);
  return h.line.reply.mock.calls.at(-1)![1].buttons.find((button) => button.data.startsWith("intake:confirm|"))!.data;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(readFileSync("supabase/migrations/202610260001_line_intake.sql", "utf8"));
  await db.exec("create table public.line_evidence_files(reference text primary key,employee_id text,work_date date,purged_at timestamptz);");
  await db.exec(readFileSync("supabase/migrations/20261027032608_line_supabase_evidence_reference.sql", "utf8"));
}, 30_000);
beforeEach(async () => {
  sequence = 0;
  await db.exec("truncate public.line_work_entries, public.line_events, public.line_sessions, public.line_evidence_files; update public.line_media_lock set lease_token=null, lease_until=null;");
});
afterAll(async () => { await db?.close(); });

describe("real LINE processing with durable SQL transactions", () => {
  it("orders the renamed navigation buttons without changing their actions", async () => {
    const summary = vi.fn<NonNullable<ReceiverDependencies["summary"]>>().mockResolvedValue({ text: "ตาราง", buttons: [{ label: "ลิงก์เอกสารเบิก", data: "summary-link:2026-10" }, { label: "เพิ่มข้อมูล", data: "intake:start" }] });
    const h = harness(summary, vi.fn());
    const confirm = await prepare(h);
    await h.receiver.receive([postback(confirm)]);
    await h.receiver.receive([message("text", "เมนู")]);
    const buttons = h.line.reply.mock.calls.at(-1)![1].buttons;
    expect(buttons.map((button) => button.label)).toEqual(["เพิ่มข้อมูล", "ตารางสรุป", "ลิงก์เอกสารเบิก"]);
    expect(buttons.map((button) => button.data.split("|")[0])).toEqual(["intake:start", "summary:2026-10:0", "summary-link:2026-10"]);
  });
  it("requests an owned summary link without clearing the draft", async () => {
    const link = vi.fn<NonNullable<ReceiverDependencies["summaryLink"]>>().mockResolvedValue({ text: "ลิงก์ส่วนตัว", buttons: [{ label: "กลับรายการที่ค้าง", data: "intake:resume" }] });
    const h = harness(undefined, link);
    await prepare(h);
    await h.receiver.receive([message("text", "ขอลิงก์สรุป")]);
    expect(link).toHaveBeenCalledWith(employee, "2026-10", true);
    const state = (await db.query<{ state: { conversation: { intake: { step: string; draft: { subject: string } } } } }>("select state from public.line_sessions where user_id='user-1'")).rows[0].state;
    expect(state.conversation.intake).toMatchObject({ step: "review", draft: { subject: "ถ่ายทำ" } });
    expect((await db.query("select * from public.line_work_entries")).rows).toHaveLength(0);
  });
  it("opens the test summary from a scoped button without changing an unfinished work item", async () => {
    const summary = vi.fn<NonNullable<ReceiverDependencies["summary"]>>().mockResolvedValue({ text: "สรุปตารางทดสอบ", buttons: [{ label: "กลับรายการที่ค้าง", data: "intake:resume" }] });
    const h = harness(summary);
    await prepare(h);
    await h.receiver.receive([message("text", "เมนู")]);
    const button = h.line.reply.mock.calls.at(-1)![1].buttons.find((button) => button.label === "ตารางสรุป")!;
    await h.receiver.receive([postback(button.data)]);
    expect(summary).toHaveBeenCalledWith(employee, "2026-10", 0, true);
    const session = (await db.query<{ state: { conversation: { intake: { step: string; draft: { subject: string } } } } }>("select state from public.line_sessions where user_id='user-1'")).rows[0];
    expect(session.state.conversation.intake).toMatchObject({ step: "review", draft: { subject: "ถ่ายทำ" } });
    await h.receiver.receive([postback(button.data)]);
    expect(summary).toHaveBeenCalledOnce();
    expect(h.line.reply.mock.calls.at(-1)![1].text).toContain("ขั้นตอนก่อนหน้า");
    expect((await db.query("select * from public.line_work_entries")).rows).toHaveLength(0);
  });
  it("accepts and confirms a Supabase image reference from the real archive contract", async () => {
    const h = harness();
    const reference = `supabase:${"a".repeat(64)}`;
    await db.query("insert into public.line_evidence_files(reference,employee_id,work_date) values($1,$2,'2026-10-26')", [reference, employee.employeeId]);
    h.drive.saveEvidence.mockResolvedValue(reference);
    const confirm = await prepare(h);
    await h.receiver.receive([postback(confirm)]);
    const { rows } = await db.query<{ data: { imageId: string } }>("select data from public.line_work_entries");
    expect(rows[0].data.imageId).toBe(reference);
    expect(h.drive.placeEvidence).toHaveBeenCalledWith(reference, employee, "2026-10-26");
  });
  it("allows only one confirmed job per employee and work date", async () => {
    const h = harness();
    const first = await prepare(h);
    await h.receiver.receive([postback(first)]);
    await h.receiver.receive([message("image"), message("text", "งานซ้ำ"), message("text", "บางนา")]);
    const confirm = h.line.reply.mock.calls.at(-1)![1].buttons.find((button) => button.data.startsWith("intake:confirm|"))!;
    await h.receiver.receive([postback(confirm.data)]);
    expect(h.line.reply.mock.calls.at(-1)![1].text).toContain("หนึ่งงานต่อวัน");
    expect((await db.query("select * from public.line_work_entries")).rows).toHaveLength(1);
  });
  it("shows only confirmed records for the current user and preserves a draft while browsing", async () => {
    const h = harness();
    const confirmData = await prepare(h);
    await h.receiver.receive([message("text", "ดูรายการ")]);
    const empty = h.line.reply.mock.calls.at(-1)![1];
    expect(empty.text).toContain("ยังไม่มีรายการ");
    const resume = empty.buttons.find((button) => button.data.startsWith("intake:resume|"))!;
    await h.receiver.receive([postback(resume.data)]);
    const review = h.line.reply.mock.calls.at(-1)![1];
    expect(review.text).toContain("บางนา");
    expect(review.buttons).toHaveLength(3);
    expect(confirmData).toBeTruthy();
    await h.receiver.receive([postback(review.buttons.find((button) => button.data.startsWith("intake:confirm|"))!.data)]);
    await h.receiver.receive([message("text", "ดูรายการ")]);
    expect(h.line.reply.mock.calls.at(-1)![1].text).toContain("ถ่ายทำ");
    expect((await store.listEntries("user-2", employee.employeeId, "2026-10", 0)).entries).toHaveLength(0);
    expect((await store.listEntries("user-1", "87654321", "2026-10", 0)).entries).toHaveLength(0);
    expect((await store.listEntries("user-1", employee.employeeId, "2026-09", 0)).entries).toHaveLength(0);
    expect((await db.query("select * from public.line_work_entries")).rows).toHaveLength(1);
  });
  it("looks up the first employee-ID message directly and can confirm the returned name", async () => {
    const h = harness();
    const first = message("text", employee.employeeId);
    await h.receiver.receive([first]);
    const reply = h.line.reply.mock.calls.at(-1)![1];
    expect(reply.text).toContain(employee.name);
    const confirm = reply.buttons.find((button) => button.data.startsWith("employee:confirm|"))!;
    expect(confirm).toBeDefined();
    await h.receiver.receive([postback(confirm.data)]);
    expect(h.line.reply.mock.calls.at(-1)![1].text).toContain("ส่งมา 1 รูป");
  });
  it("associates an employee, archives one image, and atomically saves a confirmed entry", async () => {
    const h = harness();
    const data = await prepare(h);
    expect(h.drive.saveEvidence).toHaveBeenCalledTimes(1);
    expect((await db.query("select * from public.line_work_entries")).rows).toHaveLength(0);
    const event = postback(data);
    await h.receiver.receive([event]);
    const entries = await db.query<{ employee_id: string; data: { imageId: string } }>("select * from public.line_work_entries");
    expect(entries.rows).toHaveLength(1);
    expect(entries.rows[0]).toMatchObject({ employee_id: employee.employeeId, data: { imageId: "drive:file-1" } });
    expect(h.drive.placeEvidence).toHaveBeenCalledWith("drive:file-1", employee, "2026-10-26");
    await h.receiver.receive([event]);
    expect((await db.query("select * from public.line_work_entries")).rows).toHaveLength(1);
    expect(h.drive.placeEvidence).toHaveBeenCalledTimes(1);
    await h.receiver.receive([message("image")]);
    expect(h.line.reply.mock.calls.at(-1)![1].text).toContain("งานนี้หัวข้ออะไรครับ?");
  });

  it("downloads before acknowledging a photo and retries a transient archive failure without advancing the conversation", async () => {
    const h = harness();
    await register(h);
    const image = message("image");
    h.drive.saveEvidence.mockRejectedValueOnce(new Error("Drive unavailable"));
    await expect(h.receiver.receive([image])).rejects.toThrow("Drive unavailable");
    const rows = await db.query<{ state: { conversation: { intake: { step: string } } } }>("select state from public.line_sessions");
    expect(rows.rows[0].state.conversation.intake.step).toBe("photo");
    await h.receiver.receive([image]);
    expect(h.line.reply.mock.calls.at(-1)![1].text).toContain("งานนี้หัวข้ออะไรครับ?");
  });

  it("responds to an invalid image without permanently blocking the user's later events", async () => {
    const h = harness();
    await register(h);
    h.line.image.mockRejectedValueOnce(new LineMediaRejected("กรุณาส่งรูปใหม่ครับ"));
    await h.receiver.receive([message("image")]);
    expect(h.line.reply.mock.calls.at(-1)![1].text).toBe("กรุณาส่งรูปใหม่ครับ");
    await h.receiver.receive([message("image")]);
    expect(h.line.reply.mock.calls.at(-1)![1].text).toContain("งานนี้หัวข้ออะไรครับ?");
  });

  it("retries pending replies without applying a confirmed entry twice", async () => {
    const h = harness();
    const data = await prepare(h);
    const event = postback(data);
    h.line.reply.mockRejectedValueOnce(new Error("network timeout"));
    await expect(h.receiver.receive([event])).rejects.toThrow("network timeout");
    await h.receiver.receive([event]);
    expect((await db.query("select * from public.line_work_entries")).rows).toHaveLength(1);
    expect(h.drive.placeEvidence).toHaveBeenCalledTimes(1);
  });

  it("rejects stale confirmation buttons without saving the wrong draft", async () => {
    const h = harness();
    await prepare(h);
    await h.receiver.receive([postback("intake:confirm", "stale-context")]);
    expect((await db.query("select * from public.line_work_entries")).rows).toHaveLength(0);
    expect(h.line.reply.mock.calls.at(-1)![1].text).toContain("ขั้นตอนก่อนหน้า");
  });

  it("serializes users and the shared media archive, then rejects old events", async () => {
    const first = message("text", "hello");
    expect((await store.begin(first, "lease-1")).kind).toBe("claimed");
    expect((await store.begin(message("text", "later"), "lease-2")).kind).toBe("busy");
    expect(await store.claimMedia("media-1")).toBe(true);
    expect(await store.claimMedia("media-2")).toBe(false);
    await store.releaseMedia("wrong-owner");
    expect(await store.claimMedia("media-2")).toBe(false);
    await store.releaseMedia("media-1");
    expect(await store.claimMedia("media-2")).toBe(true);
    await expect(store.finish(first, "wrong-lease", { conversation: { employee: null, candidate: null, onboarding: "idle", intake: { step: "idle", draft: null } }, buttonContext: "x" }, undefined, { text: "x", buttons: [] })).rejects.toThrow();
  });

  it("does not send group data into an employee's records", async () => {
    const h = harness();
    await h.receiver.receive([{ ...message("image"), source: { type: "group", userId: "user-1" } }]);
    expect(h.line.image).not.toHaveBeenCalled();
    expect((await db.query("select * from public.line_events")).rows).toHaveLength(0);
  });

  it("preserves a saved record when LINE rejects an expired reply token", async () => {
    const h = harness();
    const data = await prepare(h);
    h.line.reply.mockRejectedValueOnce(new LineReplyRejected(400));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await h.receiver.receive([postback(data)]);
      expect((await db.query("select * from public.line_work_entries")).rows).toHaveLength(1);
      const result = await db.query<{ reply_status: string }>("select reply_status from public.line_events order by event_timestamp desc limit 1");
      expect(result.rows[0].reply_status).toBe("rejected");
    } finally { warning.mockRestore(); }
  });

  it("denies anonymous reads and invocation of privileged functions", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.line_sessions")).rejects.toThrow();
      await expect(db.query("select public.line_claim_media('attacker')")).rejects.toThrow();
    } finally { await db.exec("reset role"); }
  });
});
