import { expect, it } from "vitest";
import { SupabaseEvidenceArchive, TEST_EVIDENCE_BUCKET, EvidenceExpiredError } from "@/lib/line/supabase-archive";
import { SupabaseLineStore } from "@/lib/line/store";
import { INITIAL_EMPLOYEE_INTAKE_STATE } from "@/lib/line/employee-intake";
import type { LineEvent } from "@/lib/line/webhook";

// Explicit opt-in only: temporary image, manifest and isolated LINE records.
// Removes its own fixtures; never changes employee rows or sends LINE messages.
it.skipIf(process.env.IHD_STORAGE_SMOKE !== "1")("uploads, reads, edits, restores and expires a temporary image in real Supabase Storage", async () => {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const api = async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(`${url}/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) throw new Error(`Smoke request failed (${response.status})`);
    return response;
  };
  const archive = new SupabaseEvidenceArchive(url, key);
  const store = new SupabaseLineStore(url, key);
  const userId = `storage-smoke-${crypto.randomUUID()}`;
  const event: LineEvent = { type: "message", webhookEventId: userId, timestamp: Date.now(), source: { type: "user", userId }, replyToken: "not-sent", message: { id: userId, type: "text", text: "storage smoke" } };
  const employee = { employeeId: "00000000", name: "Storage Smoke Test", active: true };
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64");
  let reference: string | undefined;
  const paths = new Set<string>();
  const finalPath = (date: string) => `${date.slice(0, 4)}/${date.slice(0, 7)}/00000000/evidence/${date.replaceAll("-", "")}.png`;
  try {
    reference = await archive.saveEvidence({ messageId: `storage-smoke-${crypto.randomUUID()}`, workDate: "2026-10-27", employee, bytes: png, mimeType: "image/png" });
    paths.add(`.pending/${reference.slice(9)}/20261027.png`);
    paths.add(finalPath("2026-10-27"));
    await archive.placeEvidence(reference, employee, "2026-10-27");
    expect((await archive.readEvidence(reference)).bytes).toEqual(png);
    const lease = crypto.randomUUID();
    expect((await store.begin(event, lease)).kind).toBe("claimed");
    await store.finish(event, lease, { conversation: { ...INITIAL_EMPLOYEE_INTAKE_STATE, employee }, buttonContext: userId },
      { workDate: "2026-10-27", subject: "Storage smoke", location: "Test", imageId: reference, employeeId: employee.employeeId, employeeName: employee.name }, { text: "test only", buttons: [] });
    expect((await store.employeeEntries(employee.employeeId, "2026-10"))[0].data.imageId).toBe(reference);
    paths.add(finalPath("2026-10-28"));
    const changed = await archive.editEvidence(reference, employee, "2026-10-28", png, "image/png");
    await changed.rollback();
    expect((await archive.readEvidence(reference)).bytes).toEqual(png);
    const rows = await (await api(`rest/v1/line_evidence_files?${new URLSearchParams({ reference: `eq.${reference}`, select: "object_path" })}`)).json();
    expect(rows[0].object_path).toBe(finalPath("2026-10-27"));
    // Dry-run the deployed scheduler without deleting real application data.
    const cleanup = await api("functions/v1/cleanup-test-evidence", "POST", { dryRun: true });
    expect(await cleanup.json()).toMatchObject({ dryRun: true, candidates: 0 });
    await api(`storage/v1/object/${TEST_EVIDENCE_BUCKET}`, "DELETE", { prefixes: [finalPath("2026-10-27")] });
    await api(`rest/v1/line_evidence_files?${new URLSearchParams({ reference: `eq.${reference}` })}`, "PATCH", { purged_at: new Date().toISOString() });
    await expect(archive.readEvidence(reference)).rejects.toBeInstanceOf(EvidenceExpiredError);
    expect((await store.employeeEntries(employee.employeeId, "2026-10"))[0].data.subject).toBe("Storage smoke");
  } finally {
    await api(`rest/v1/line_work_entries?${new URLSearchParams({ user_id: `eq.${userId}` })}`, "DELETE");
    await api(`rest/v1/line_events?${new URLSearchParams({ user_id: `eq.${userId}` })}`, "DELETE");
    await api(`rest/v1/line_sessions?${new URLSearchParams({ user_id: `eq.${userId}` })}`, "DELETE");
    if (paths.size) await api(`storage/v1/object/${TEST_EVIDENCE_BUCKET}`, "DELETE", { prefixes: [...paths] });
    if (reference) await api(`rest/v1/line_evidence_files?${new URLSearchParams({ reference: `eq.${reference}` })}`, "DELETE");
  }
}, 90_000);
