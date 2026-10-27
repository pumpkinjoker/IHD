import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { localDataRoot } from "./local-database";
import type { IntakeEmployee } from "./employee-intake";
import { validateEvidenceBytes } from "./client";
import { evidenceFileName } from "@/lib/images/evidence-file-name";

type Manifest = { relativePath: string; mimeType: string; employeeId: string };
const referenceKey = (reference: string) => {
  if (!/^local:[a-f0-9]{64}$/.test(reference)) throw new Error("Invalid local evidence reference");
  return reference.slice(6);
};

export class LocalEvidenceArchive {
  async editEvidence(reference: string, employee: IntakeEmployee, date: string, bytes: Uint8Array, mimeType: string) {
    validateEvidenceBytes(bytes, mimeType);
    const key = referenceKey(reference);
    const previous = await this.manifest(key);
    if (!previous || previous.employeeId !== employee.employeeId) throw new Error("Evidence owner mismatch");
    const oldBytes = await readFile(this.file(previous.relativePath));
    const relativePath = this.relativePath(employee, date, mimeType);
    const target = this.file(relativePath);
    if (relativePath !== previous.relativePath) {
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
    } else await this.atomicWrite(target, bytes);
    try { await this.atomicWrite(this.index(key), JSON.stringify({ ...previous, relativePath, mimeType })); }
    catch (error) {
      if (relativePath === previous.relativePath) await this.atomicWrite(target, oldBytes);
      else await unlink(target);
      throw error;
    }
    return {
      rollback: async () => {
        await this.atomicWrite(this.file(previous.relativePath), oldBytes);
        await this.atomicWrite(this.index(key), JSON.stringify(previous));
        if (relativePath !== previous.relativePath) await unlink(target);
      },
      commit: async () => { if (relativePath !== previous.relativePath) await unlink(this.file(previous.relativePath)); }
    };
  }
  constructor(private root = path.join(localDataRoot(), "media")) {}
  private file(relativePath: string) {
    const resolved = path.resolve(/* turbopackIgnore: true */ this.root, relativePath);
    if (!resolved.startsWith(path.resolve(/* turbopackIgnore: true */ this.root) + path.sep)) throw new Error("Invalid evidence path");
    return resolved;
  }
  private async atomicWrite(file: string, bytes: string | Uint8Array) {
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
    await rename(temporary, file);
  }
  private index(key: string) { return this.file(path.join(".index", `${key}.json`)); }
  private async manifest(key: string): Promise<Manifest | null> {
    try {
      const record = JSON.parse(await readFile(this.index(key), "utf8")) as Manifest;
      this.file(record.relativePath);
      return record;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  private relativePath(employee: IntakeEmployee, date: string, mimeType: string) {
    if (!/^\d{8}$/.test(employee.employeeId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid archive metadata");
    const name = employee.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 100);
    return path.join(date.slice(0, 4), date.slice(0, 7), `${employee.employeeId}_${name}`, "หลักฐาน", evidenceFileName(date, mimeType));
  }
  async saveEvidence(input: { messageId: string; workDate: string; employee: IntakeEmployee; bytes: Uint8Array; mimeType: string }) {
    validateEvidenceBytes(input.bytes, input.mimeType);
    const key = createHash("sha256").update(input.messageId).digest("hex");
    const existing = await this.manifest(key);
    if (existing) {
      if (existing.employeeId !== input.employee.employeeId) throw new Error("Image belongs to another employee");
      await stat(this.file(existing.relativePath));
      return `local:${key}`;
    }
    const relativePath = path.join(".pending", key, evidenceFileName(input.workDate, input.mimeType));
    await mkdir(path.dirname(this.file(relativePath)), { recursive: true, mode: 0o700 });
    try { await writeFile(this.file(relativePath), input.bytes, { mode: 0o600, flag: "wx" }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // A previous interrupted save may have written the same message already.
      if (!(await readFile(this.file(relativePath))).equals(Buffer.from(input.bytes))) throw new Error("Evidence conflict");
    }
    await this.atomicWrite(this.index(key), JSON.stringify({ relativePath, mimeType: input.mimeType, employeeId: input.employee.employeeId }));
    return `local:${key}`;
  }
  async placeEvidence(reference: string, employee: IntakeEmployee, date: string) {
    const key = referenceKey(reference);
    const record = await this.manifest(key);
    if (!record || record.employeeId !== employee.employeeId) throw new Error("Evidence owner mismatch");
    const relativePath = this.relativePath(employee, date, record.mimeType);
    if (relativePath !== record.relativePath) {
      const target = this.file(relativePath);
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      try { await copyFile(this.file(record.relativePath), target, constants.COPYFILE_EXCL); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (!(await readFile(target)).equals(await readFile(this.file(record.relativePath)))) throw new Error("Evidence conflict");
      }
      // Publish the new reference before removing the old file. Interrupted
      // renames may leave a spare copy, but never an unreadable evidence link.
      await this.atomicWrite(this.index(key), JSON.stringify({ ...record, relativePath }));
      await unlink(this.file(record.relativePath));
    } else { await stat(this.file(relativePath)); }
  }
  async readEvidence(reference: string) {
    const record = await this.manifest(referenceKey(reference));
    if (!record) throw new Error("Evidence not found");
    return { bytes: await readFile(this.file(record.relativePath)), mimeType: record.mimeType };
  }
}
