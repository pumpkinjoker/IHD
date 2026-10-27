import { createHash } from "node:crypto";
import type { IntakeEmployee } from "@/lib/line/employee-intake";
import { evidenceFileName } from "@/lib/images/evidence-file-name";

type DriveConfig = { clientId: string; clientSecret: string; refreshToken: string; rootFolderId: string };
type DriveFile = { id: string; name: string };
const escapeQuery = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const safeName = (value: string) => value.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 120);

export class GoogleDrive {
  constructor(private config: DriveConfig, private request: typeof fetch = fetch) {}

  private async token() {
    const response = await this.request("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken, grant_type: "refresh_token" }),
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(`Google authorization failed (${response.status})`);
    const data = await response.json() as { access_token?: string };
    if (!data.access_token) throw new Error("Google access token missing");
    return data.access_token;
  }

  private async api(token: string, path: string, init: RequestInit = {}) {
    const response = await this.request(`https://www.googleapis.com/drive/v3/${path}`, {
      ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers }, signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(`Google Drive request failed (${response.status})`);
    return response.json();
  }

  private async folder(token: string, parent: string, name: string) {
    const params = new URLSearchParams({
      q: `'${escapeQuery(parent)}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='${escapeQuery(name)}'`,
      fields: "files(id,name)", pageSize: "100"
    });
    const existing = await this.api(token, `files?${params}`) as { files: DriveFile[] };
    if (existing.files.length > 1) throw new Error("Duplicate Drive folders; resolve before continuing");
    if (existing.files[0]) return existing.files[0].id;
    const created = await this.api(token, "files?fields=id", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parent] })
    }) as DriveFile;
    return created.id;
  }

  private async evidenceFolder(token: string, employee: IntakeEmployee, workDate: string) {
    let folder = await this.folder(token, this.config.rootFolderId, workDate.slice(0, 4));
    folder = await this.folder(token, folder, workDate.slice(0, 7));
    folder = await this.folder(token, folder, safeName(`${employee.employeeId}_${employee.name}`));
    return this.folder(token, folder, "หลักฐาน");
  }

  async placeEvidence(reference: string, employee: IntakeEmployee, workDate: string) {
    if (!/^drive:[A-Za-z0-9_-]+$/.test(reference) || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) throw new Error("Invalid evidence reference");
    const token = await this.token();
    const fileId = reference.slice(6);
    const metadata = await this.api(token, `files/${fileId}?fields=id,name,parents,appProperties`) as DriveFile & { parents: string[]; appProperties?: { ihdMediaKey?: string } };
    const folder = await this.evidenceFolder(token, employee, workDate);
    const params = new URLSearchParams({ fields: "id" });
    if (!metadata.parents.includes(folder)) {
      params.set("addParents", folder);
      params.set("removeParents", metadata.parents.join(","));
    }
    const mimeType = metadata.name.endsWith(".png") ? "image/png" : metadata.name.endsWith(".webp") ? "image/webp" : "image/jpeg";
    const name = evidenceFileName(workDate, mimeType);
    await this.api(token, `files/${fileId}?${params}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name })
    });
  }

  /** Must run under the store's global media lease to avoid parallel folder creation. */
  async saveEvidence(input: { messageId: string; workDate: string; employee: IntakeEmployee; bytes: Uint8Array; mimeType: string }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) throw new Error("Invalid work date");
    const token = await this.token();
    const mediaKey = createHash("sha256").update(input.messageId).digest("hex");
    const params = new URLSearchParams({
      q: `trashed=false and appProperties has { key='ihdMediaKey' and value='${mediaKey}' } and appProperties has { key='ihdRoot' and value='${escapeQuery(this.config.rootFolderId)}' }`,
      fields: "files(id,name)", pageSize: "2"
    });
    const existing = await this.api(token, `files?${params}`) as { files: DriveFile[] };
    if (existing.files.length > 1) throw new Error("Duplicate evidence files need reconciliation");
    if (existing.files[0]) return `drive:${existing.files[0].id}`;
    const folder = await this.folder(token, await this.folder(token, this.config.rootFolderId, ".pending"), mediaKey);
    const boundary = `ihd-${mediaKey}`;
    const metadata = { name: evidenceFileName(input.workDate, input.mimeType), parents: [folder],
      appProperties: { ihdMediaKey: mediaKey, ihdRoot: this.config.rootFolderId } };
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`),
      input.bytes, Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    const response = await this.request("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body, signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`Drive upload failed (${response.status})`);
    const file = await response.json() as DriveFile;
    if (!file.id) throw new Error("Drive upload did not return a file ID");
    return `drive:${file.id}`;
  }
}
