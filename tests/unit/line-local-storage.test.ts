import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeLocalDatabase, LocalLineStore } from "@/lib/line/local-database";
import { LocalEvidenceArchive } from "@/lib/line/local-archive";
import { createLineReceiver } from "@/lib/line/receiver";
import { configuredLineReceiver, missingLineConfiguration } from "@/lib/line/config";
import { allowsLocalTest } from "@/lib/line/local-test-access";
import type { LineEvent } from "@/lib/line/webhook";

let root: string;
const employee = { employeeId: "12345678", name: "พนักงาน ทดสอบ", active: true };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=", "base64");
beforeEach(async () => { root = await mkdtemp(path.join(os.tmpdir(), "ihd-local-test-")); });
afterEach(async () => { await closeLocalDatabase(root); await rm(root, { recursive: true, force: true }); vi.unstubAllEnvs(); });

describe("on-disk intake storage", () => {
  it("replaces one photo, renames it to the edited date and can roll back a failed database save", async () => {
    const archive = new LocalEvidenceArchive(path.join(root, "media"));
    const reference = await archive.saveEvidence({ messageId: "web-edit", workDate: "2026-10-26", employee, bytes: png, mimeType: "image/png" });
    await archive.placeEvidence(reference, employee, "2026-10-26");
    const replacement = Buffer.concat([png, Buffer.from("replacement")]);
    const folder = path.join(root, "media/2026/2026-10/12345678_พนักงาน ทดสอบ/หลักฐาน");
    const first = await archive.editEvidence(reference, employee, "2026-10-27", replacement, "image/png");
    expect((await archive.readEvidence(reference)).bytes).toEqual(replacement);
    await first.rollback();
    expect((await archive.readEvidence(reference)).bytes).toEqual(png);
    expect(await readdir(folder)).toEqual(["20261026.png"]);
    const second = await archive.editEvidence(reference, employee, "2026-10-27", replacement, "image/png");
    await second.commit();
    expect(await readdir(folder)).toEqual(["20261027.png"]);
    expect((await archive.readEvidence(reference)).bytes).toEqual(replacement);
    await expect(archive.editEvidence(reference, { ...employee, employeeId: "87654321" }, "2026-10-27", png, "image/png")).rejects.toThrow("Evidence owner mismatch");
  });
  it("persists employee, draft, one entry and image across database close/reopen", async () => {
    let sequence = 0;
    const store = new LocalLineStore(root);
    const archive = new LocalEvidenceArchive(path.join(root, "media"));
    const receiver = createLineReceiver({ store, archive,
      employees: (id) => id === employee.employeeId ? employee : null,
      line: { reply: async () => {}, image: async () => ({ bytes: png, mimeType: "image/png" }) } });
    const event = (text?: string, postback?: string): LineEvent => ({
      type: postback ? "postback" : "message", webhookEventId: `event-${++sequence}`,
      timestamp: Date.parse("2026-10-26T06:00:00Z") + sequence,
      source: { type: "user", userId: "user-1" }, replyToken: `reply-${sequence}`,
      ...(postback ? { postback: { data: postback } } : { message: { id: `message-${sequence}`, type: text === undefined ? "image" : "text", ...(text === undefined ? {} : { text }) } })
    });
    await receiver.receive([event(undefined, "intake:start"), event(employee.employeeId)]);
    const confirm = (await store.snapshot("user-1")).reply.buttons.find((button) => button.data.startsWith("employee:confirm"))!;
    await receiver.receive([event(undefined, confirm.data), event(), event("งานทดสอบ"), event("บางนา")]);
    const draft = await store.snapshot("user-1");
    const reference = draft.state.intake.draft!.imageId!;
    expect(reference).toMatch(/^local:[a-f0-9]{64}$/);
    expect(await store.ownsImage("other-user", reference)).toBe(false);
    expect(await store.ownsImage("user-1", reference)).toBe(true);
    expect((await archive.readEvidence(reference)).bytes).toEqual(png);
    await closeLocalDatabase(root);
    const reopened = new LocalLineStore(root);
    expect((await reopened.snapshot("user-1")).state.intake.step).toBe("review");
    const button = draft.reply.buttons.find((item) => item.data.startsWith("intake:confirm"))!;
    await receiver.receive([event(undefined, button.data)]);
    await closeLocalDatabase(root);
    const restored = await reopened.snapshot("user-1");
    expect(restored.state.employee?.employeeId).toBe(employee.employeeId);
    expect(restored.entries).toHaveLength(1);
    expect(restored.entries[0]).toMatchObject({ employeeId: employee.employeeId, subject: "งานทดสอบ", imageId: reference });
    expect((await new LocalEvidenceArchive(path.join(root, "media")).readEvidence(reference)).bytes).toEqual(png);
  }, 20_000);

  it("deduplicates photos, moves a backdated image, and blocks invalid references", async () => {
    const archive = new LocalEvidenceArchive(path.join(root, "media"));
    const input = { employee, messageId: "same-message", workDate: "2026-10-26", bytes: png, mimeType: "image/png" };
    const reference = await archive.saveEvidence(input);
    expect(await archive.saveEvidence(input)).toBe(reference);
    await archive.placeEvidence(reference, employee, "2026-09-30");
    expect((await archive.readEvidence(reference)).bytes).toEqual(png);
    const firstFolder = path.join(root, "media/2026/2026-09/12345678_พนักงาน ทดสอบ/หลักฐาน");
    const folders = await readdir(firstFolder);
    expect(folders).toHaveLength(1);
    expect(folders[0]).toBe("20260930.png");
    await expect(archive.readEvidence("local:../../.env.local")).rejects.toThrow("Invalid local evidence reference");
    await expect(archive.placeEvidence(reference, { ...employee, employeeId: "87654321" }, "2026-09-30")).rejects.toThrow("Evidence owner mismatch");
    await expect(archive.saveEvidence({ ...input, bytes: Buffer.from("invalid") })).rejects.toThrow();
    expect(await readFile(path.join(firstFolder, folders[0]))).toEqual(png);
    const second = await archive.saveEvidence({ ...input, messageId: "another-message", workDate: "2026-09-30" });
    await archive.placeEvidence(second, employee, "2026-09-30");
    expect(await readdir(firstFolder)).toEqual(["20260930.png"]);
    expect((await archive.readEvidence(reference)).bytes).toEqual(png);
  });

  it("local mode needs no Google/Supabase credentials and is disabled on Vercel", () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: "test", LINE_STORAGE_MODE: "local", LINE_CHANNEL_SECRET: "test", LINE_CHANNEL_ACCESS_TOKEN: "test" };
    expect(missingLineConfiguration(env)).toEqual([]);
    expect(configuredLineReceiver({ ...env, LINE_INTAKE_ENABLED: "true", VERCEL: "1" })).toBeUndefined();
    const hybrid = { ...env, LINE_DATABASE_MODE: "supabase", LINE_MEDIA_MODE: "local", SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-server-key" };
    expect(missingLineConfiguration(hybrid)).toEqual([]);
    expect(configuredLineReceiver({ ...hybrid, LINE_INTAKE_ENABLED: "true", VERCEL: "1" })).toBeUndefined();
    expect(missingLineConfiguration({ ...env, LINE_DATABASE_MODE: "unexpected" })).toContain("LINE_DATABASE_MODE");
    expect(missingLineConfiguration({ ...env, LINE_DATABASE_MODE: "", LINE_MEDIA_MODE: "" })).toEqual([]);
  });

  it("limits the local test API to development and same-origin loopback requests", () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("LINE_STORAGE_MODE", "local"); vi.stubEnv("VERCEL", "");
    expect(allowsLocalTest(new Request("http://127.0.0.1:3000/api/line/local-test"))).toBe(true);
    expect(allowsLocalTest(new Request("http://127.0.0.1:3000/api/line/local-test", { method: "POST", headers: { origin: "https://attacker.test" } }))).toBe(false);
    expect(allowsLocalTest(new Request("http://attacker.test/api/line/local-test"))).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect(allowsLocalTest(new Request("http://127.0.0.1:3000/api/line/local-test"))).toBe(false);
  });
});
