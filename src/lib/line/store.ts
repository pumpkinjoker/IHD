import type { EmployeeIntakeState, EmployeeWorkEntry } from "./employee-intake";
import type { IntakeReply } from "./intake";
import type { LineEvent } from "./webhook";
import { RECORD_PAGE_SIZE, type EntryPage } from "./records";
import { INITIAL_EMPLOYEE_INTAKE_STATE, type IntakeEmployee } from "./employee-intake";

export type StoredConversation = { conversation: EmployeeIntakeState; buttonContext: string };
export type EventClaim =
  | { kind: "claimed"; state: StoredConversation | null }
  | { kind: "duplicate"; reply: IntakeReply | null; replyStatus: "pending" | "sent" | "rejected" }
  | { kind: "ignored" }
  | { kind: "busy" };
export interface LineStore {
  begin(event: LineEvent, lease: string): Promise<EventClaim>;
  finish(event: LineEvent, lease: string, state: StoredConversation, entry: EmployeeWorkEntry | undefined, reply: IntakeReply): Promise<void>;
  release(userId: string, lease: string): Promise<void>;
  replyStatus(eventId: string, status: "sent" | "rejected"): Promise<void>;
  claimMedia(lease: string): Promise<boolean>;
  releaseMedia(lease: string): Promise<void>;
  listEntries(userId: string, employeeId: string, month: string, offset: number): Promise<EntryPage>;
  hasEntryForDate(employeeId: string, date: string): Promise<boolean>;
}

export class SupabaseLineStore implements LineStore {
  async employeeEntries(employeeId: string, month: string) {
    const params = new URLSearchParams({ employee_id: `eq.${employeeId}`, select: "id,data",
      and: `(work_date.gte.${month}-01,work_date.lt.${nextMonthStart(month)})`, order: "work_date.asc", limit: "31" });
    return this.call(`line_work_entries?${params}`, undefined, "GET") as Promise<{ id: string; data: EmployeeWorkEntry & { expense?: import("@/types/expense-request").ExpenseWorkItem } }[]>;
  }
  async updateEmployeeEntry(id: string, employeeId: string, previous: EmployeeWorkEntry, data: EmployeeWorkEntry) {
    const params = new URLSearchParams({ id: `eq.${id}`, employee_id: `eq.${employeeId}`, data: `eq.${JSON.stringify(previous)}`, select: "id" });
    const response = await this.request(`${this.url.replace(/\/$/, "")}/rest/v1/line_work_entries?${params}`, {
      method: "PATCH", headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ work_date: data.workDate, data }), signal: AbortSignal.timeout(20_000), cache: "no-store"
    });
    if (!response.ok || (await response.json()).length !== 1) throw new Error("รายการเปลี่ยนไปแล้วหรือวันที่ซ้ำ กรุณาโหลดข้อมูลใหม่");
  }
  async hasEntryForDate(employeeId: string, date: string) {
    const params = new URLSearchParams({ employee_id: `eq.${employeeId}`, work_date: `eq.${date}`, select: "id", limit: "1" });
    return ((await this.call(`line_work_entries?${params}`, undefined, "GET")) as unknown[]).length > 0;
  }
  async listEmployees() {
    const rows = await this.call("ihd_employee_directory?select=employee_id,name,active&active=eq.true&order=name.asc", undefined, "GET") as { employee_id: string; name: string; active: boolean }[];
    return rows.map((row) => ({ employeeId: row.employee_id, name: row.name, active: row.active }));
  }
  constructor(private url: string, private key: string, private request: typeof fetch = fetch) {}
  private async call(path: string, body: unknown, method = "POST") {
    const response = await this.request(`${this.url.replace(/\/$/, "")}/rest/v1/${path}`, {
      method, headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20_000), cache: "no-store"
    });
    if (!response.ok) throw new Error(`Intake database request failed (${response.status})`);
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  }
  async begin(event: LineEvent, lease: string): Promise<EventClaim> {
    return this.call("rpc/line_begin_event", { p_event_id: event.webhookEventId,
      p_user_id: event.source.userId, p_timestamp: event.timestamp, p_lease: lease, p_payload: event });
  }
  async finish(event: LineEvent, lease: string, state: StoredConversation, entry: EmployeeWorkEntry | undefined, reply: IntakeReply) {
    await this.call("rpc/line_finish_event", { p_event_id: event.webhookEventId, p_user_id: event.source.userId,
      p_lease: lease, p_state: state, p_entry: entry ?? null, p_reply: reply });
  }
  async release(userId: string, lease: string) {
    await this.call("rpc/line_release_event", { p_user_id: userId, p_lease: lease });
  }
  async replyStatus(eventId: string, status: "sent" | "rejected") {
    await this.call(`line_events?event_id=eq.${encodeURIComponent(eventId)}&reply_status=eq.pending`, { reply_status: status }, "PATCH");
  }
  async claimMedia(lease: string) { return await this.call("rpc/line_claim_media", { p_lease: lease }) as boolean; }
  async releaseMedia(lease: string) { await this.call("rpc/line_release_media", { p_lease: lease }); }
  async listEntries(userId: string, employeeId: string, month: string, offset: number): Promise<EntryPage> {
    const [year, number] = month.split("-").map(Number);
    const nextMonth = `${number === 12 ? year + 1 : year}-${String(number === 12 ? 1 : number + 1).padStart(2, "0")}-01`;
    const params = new URLSearchParams({ user_id: `eq.${userId}`, employee_id: `eq.${employeeId}`,
      and: `(work_date.gte.${month}-01,work_date.lt.${nextMonth})`, select: "data", order: "work_date.desc,created_at.desc,id.desc", limit: String(RECORD_PAGE_SIZE + 1), offset: String(offset) });
    const rows = await this.call(`line_work_entries?${params}`, undefined, "GET") as { data: EmployeeWorkEntry }[];
    return { entries: rows.slice(0, RECORD_PAGE_SIZE).map((row) => row.data), hasMore: rows.length > RECORD_PAGE_SIZE };
  }
  async findEmployee(employeeId: string): Promise<IntakeEmployee | null> {
    const params = new URLSearchParams({ employee_id: `eq.${employeeId}`, select: "employee_id,name,active", limit: "1" });
    const rows = await this.call(`ihd_employee_directory?${params}`, undefined, "GET") as { employee_id: string; name: string; active: boolean }[];
    return rows[0] ? { employeeId: rows[0].employee_id, name: rows[0].name, active: rows[0].active } : null;
  }
  async allEntries(month?: string) {
    const params = new URLSearchParams({ select: "id,data", order: "work_date.desc,created_at.desc", limit: "500" });
    if (month) params.set("and", `(work_date.gte.${month}-01,work_date.lt.${nextMonthStart(month)})`);
    return this.call(`line_work_entries?${params}`, undefined, "GET") as Promise<{ id: string; data: EmployeeWorkEntry }[]>;
  }
  async savedImageExists(reference: string) {
    const params = new URLSearchParams({ "data->>imageId": `eq.${reference}`, select: "id", limit: "1" });
    return ((await this.call(`line_work_entries?${params}`, undefined, "GET")) as unknown[]).length > 0;
  }
  async snapshot(userId: string) {
    const sessions = await this.call(`line_sessions?${new URLSearchParams({ user_id: `eq.${userId}`, select: "state", limit: "1" })}`, undefined, "GET") as { state: StoredConversation }[];
    const state = sessions[0]?.state;
    const entries = await this.call(`line_work_entries?${new URLSearchParams({ user_id: `eq.${userId}`, select: "data", order: "created_at.asc", limit: "500" })}`, undefined, "GET") as { data: EmployeeWorkEntry }[];
    const replies = state ? await this.call(`line_events?${new URLSearchParams({ event_id: `eq.${state.buttonContext}`, user_id: `eq.${userId}`, status: "eq.done", select: "reply", limit: "1" })}`, undefined, "GET") as { reply: IntakeReply }[] : [];
    return { state: state?.conversation ?? INITIAL_EMPLOYEE_INTAKE_STATE, entries: entries.map((row) => row.data), reply: replies[0]?.reply ?? {
      text: "กดเพิ่มข้อมูลหน้างานเพื่อเริ่มบันทึกครับ", buttons: [{ label: "เพิ่มข้อมูลหน้างาน", data: "intake:start" }]
    } };
  }
  async ownsImage(userId: string, reference: string) {
    const params = new URLSearchParams({ user_id: `eq.${userId}`, "data->>imageId": `eq.${reference}`, select: "id", limit: "1" });
    if (((await this.call(`line_work_entries?${params}`, undefined, "GET")) as unknown[]).length) return true;
    return (await this.snapshot(userId)).state.intake.draft?.imageId === reference;
  }
}

function nextMonthStart(month: string) {
  const [year, number] = month.split("-").map(Number);
  return `${number === 12 ? year + 1 : year}-${String(number === 12 ? 1 : number + 1).padStart(2, "0")}-01`;
}
