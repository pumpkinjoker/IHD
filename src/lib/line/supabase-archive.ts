import { createHash } from "node:crypto";
import { evidenceFileName } from "@/lib/images/evidence-file-name";
import { validateEvidenceBytes } from "./client";
import type { IntakeEmployee } from "./employee-intake";

export const TEST_EVIDENCE_BUCKET = "ihd-evidence-test";
export class EvidenceExpiredError extends Error {}
type EvidenceRecord = { reference: string; employee_id: string; object_path: string; work_date: string; mime_type: string; purged_at: string | null };
const encodedPath = (value: string) => value.split("/").map(encodeURIComponent).join("/");

/** Private test bucket. The browser never receives a service key or public URL. */
export class SupabaseEvidenceArchive {
  constructor(private url: string, private key: string, private request: typeof fetch = fetch) {}
  private async api(path: string, method = "GET", body?: unknown, extra: Record<string, string> = {}) {
    const response = await this.request(`${this.url.replace(/\/$/, "")}/${path}`, {
      method, headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, "Content-Type": "application/json", ...extra },
      body: body === undefined ? undefined : body instanceof Uint8Array ? new Blob([Buffer.from(body)]) : JSON.stringify(body),
      cache: "no-store", signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({})) as { error?: string; code?: string };
      throw new Error(`Evidence storage request failed (${response.status}, ${detail.code || detail.error || "unknown"})`);
    }
    return response;
  }
  private async record(reference: string): Promise<EvidenceRecord> {
    if (!/^supabase:[a-f0-9]{64}$/.test(reference)) throw new Error("Invalid evidence reference");
    const rows = await (await this.api(`rest/v1/line_evidence_files?${new URLSearchParams({ reference: `eq.${reference}`, select: "*", limit: "1" })}`)).json() as EvidenceRecord[];
    if (!rows[0]) throw new Error("Evidence not found");
    return rows[0];
  }
  private async update(record: EvidenceRecord) {
    await this.api(`rest/v1/line_evidence_files?${new URLSearchParams({ reference: `eq.${record.reference}`, employee_id: `eq.${record.employee_id}` })}`, "PATCH", record);
  }
  private object(path: string) { return `storage/v1/object/${TEST_EVIDENCE_BUCKET}/${encodedPath(path)}`; }
  private finalPath(employee: IntakeEmployee, date: string, mimeType: string) {
    if (!/^\d{8}$/.test(employee.employeeId)) throw new Error("Invalid employee");
    // Storage object keys use ASCII; the employee's Thai name remains in the DB.
    return `${date.slice(0, 4)}/${date.slice(0, 7)}/${employee.employeeId}/evidence/${evidenceFileName(date, mimeType)}`;
  }
  private async upload(path: string, bytes: Uint8Array, mimeType: string, replace = false) {
    validateEvidenceBytes(bytes, mimeType);
    await this.api(this.object(path), "POST", bytes, { "Content-Type": mimeType, "x-upsert": String(replace), "cache-control": "no-store" });
  }
  private async remove(path: string) { await this.api(`storage/v1/object/${TEST_EVIDENCE_BUCKET}`, "DELETE", { prefixes: [path] }); }
  async isExpired(reference: string) { return Boolean((await this.record(reference)).purged_at); }
  async saveEvidence(input: { messageId: string; workDate: string; employee: IntakeEmployee; bytes: Uint8Array; mimeType: string }) {
    validateEvidenceBytes(input.bytes, input.mimeType);
    const hash = createHash("sha256").update(input.messageId).digest("hex");
    const reference = `supabase:${hash}`;
    const rows = await (await this.api(`rest/v1/line_evidence_files?${new URLSearchParams({ reference: `eq.${reference}`, select: "*", limit: "1" })}`)).json() as EvidenceRecord[];
    if (rows[0]) {
      if (rows[0].employee_id !== input.employee.employeeId || rows[0].purged_at) throw new Error("Evidence owner mismatch or expired");
      return reference;
    }
    const object_path = `.pending/${hash}/${evidenceFileName(input.workDate, input.mimeType)}`;
    await this.upload(object_path, input.bytes, input.mimeType, true);
    try {
      await this.api("rest/v1/line_evidence_files", "POST", { reference, employee_id: input.employee.employeeId, object_path, work_date: input.workDate, mime_type: input.mimeType });
    } catch (error) {
      // A lost response may follow a successful insert. Never remove its bytes
      // unless a fresh read confirms there is no registry row.
      const registered = await this.record(reference).then(() => true).catch((failure: unknown) => failure instanceof Error && failure.message === "Evidence not found" ? false : true);
      if (!registered) await this.remove(object_path).catch(() => undefined);
      throw error;
    }
    return reference;
  }
  async placeEvidence(reference: string, employee: IntakeEmployee, date: string) {
    const previous = await this.record(reference);
    if (previous.employee_id !== employee.employeeId || previous.purged_at) throw new Error("Evidence owner mismatch or expired");
    const object_path = this.finalPath(employee, date, previous.mime_type);
    if (previous.object_path === object_path) return;
    const move = (sourceKey: string, destinationKey: string) => this.api("storage/v1/object/move", "POST", { bucketId: TEST_EVIDENCE_BUCKET, sourceKey, destinationKey });
    await move(previous.object_path, object_path);
    try { await this.update({ ...previous, object_path, work_date: date }); }
    catch (error) { await move(object_path, previous.object_path); throw error; }
  }
  async readEvidence(reference: string) {
    const record = await this.record(reference);
    if (record.purged_at) throw new EvidenceExpiredError("รูปถูกลบเมื่อขึ้นเดือนที่ 3แล้ว");
    const response = await this.api(this.object(record.object_path));
    return { bytes: Buffer.from(await response.arrayBuffer()), mimeType: record.mime_type };
  }
  async editEvidence(reference: string, employee: IntakeEmployee, date: string, bytes: Uint8Array, mimeType: string) {
    const previous = await this.record(reference);
    if (previous.employee_id !== employee.employeeId || previous.purged_at) throw new Error("Evidence owner mismatch or expired");
    const old = await this.readEvidence(reference);
    const object_path = this.finalPath(employee, date, mimeType);
    const samePath = object_path === previous.object_path;
    await this.upload(object_path, bytes, mimeType, samePath);
    const rollback = async () => {
      if (samePath) await this.upload(previous.object_path, old.bytes, old.mimeType, true);
      await this.update(previous);
      if (!samePath) await this.remove(object_path);
    };
    try { await this.update({ ...previous, object_path, work_date: date, mime_type: mimeType }); }
    catch (error) { await rollback(); throw error; }
    return { rollback, commit: async () => { if (!samePath) await this.remove(previous.object_path); } };
  }
}
