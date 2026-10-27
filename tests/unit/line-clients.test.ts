import { describe, expect, it, vi } from "vitest";
import { LineClient, LineMediaRejected, LineReplyRejected } from "@/lib/line/client";
import { GoogleDrive } from "@/lib/google/drive";
import { configuredLineReceiver, missingLineConfiguration } from "@/lib/line/config";

describe("LINE HTTP client", () => {
  it("sends the exact chosen confirmation wording as a supported Flex message", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
    await new LineClient("private-test-token", request).reply("reply-1", {
      text: "ตรวจสอบข้อมูล", buttons: [{ label: "ใช้แล้วข้อมูลถูกต้องเวรี่กู้ด", data: "intake:confirm|event-1" }]
    });
    const body = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(body.messages[0].type).toBe("flex");
    expect(body.messages[0].contents.footer.contents[0].action.label).toBe("ใช้แล้วข้อมูลถูกต้องเวรี่กู้ด");
    expect(String(request.mock.calls[0][0])).not.toContain("private-test-token");
  });
  it("does not return credential-bearing provider error bodies", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("private provider details", { status: 401 }));
    await expect(new LineClient("test", request).reply("reply", { text: "x", buttons: [] })).rejects.toEqual(new LineReplyRejected(401));
  });
  it("accepts a genuine PNG but rejects mislabeled bytes, oversized images and expired media", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(png, { headers: { "content-type": "image/png" } }))
      .mockResolvedValueOnce(new Response("not an image", { headers: { "content-type": "image/png" } }))
      .mockResolvedValueOnce(new Response(png, { headers: { "content-type": "image/png", "content-length": String(9 * 1024 * 1024) } }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const line = new LineClient("test", request);
    expect((await line.image("123")).mimeType).toBe("image/png");
    await expect(line.image("124")).rejects.toBeInstanceOf(LineMediaRejected);
    await expect(line.image("125")).rejects.toBeInstanceOf(LineMediaRejected);
    await expect(line.image("126")).rejects.toBeInstanceOf(LineMediaRejected);
    await expect(line.image("../escape")).rejects.toThrow("Invalid LINE message ID");
  });
});

describe("private Google Drive archive", () => {
  const config = { clientId: "client", clientSecret: "test-secret", refreshToken: "test-refresh", rootFolderId: "root" };
  const employee = { employeeId: "12345678", name: "ทดสอบ", active: true };
  it("creates the year/month/employee folders and uploads privately without changing permissions", async () => {
    let folderNumber = 0;
    const request = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "test-google-token" });
      if (url.pathname.startsWith("/upload/")) return Response.json({ id: "file-1" });
      if (init?.method === "POST") return Response.json({ id: `folder-${++folderNumber}` });
      return Response.json({ files: [] });
    });
    const reference = await new GoogleDrive(config, request).saveEvidence({
      employee, messageId: "123", workDate: "2026-09-30", bytes: new Uint8Array([255, 216, 255]), mimeType: "image/jpeg"
    });
    expect(reference).toBe("drive:file-1");
    const createdFolders = request.mock.calls.filter(([url, init]) => new URL(String(url)).pathname === "/drive/v3/files" && init?.method === "POST")
      .map(([, init]) => JSON.parse(String(init?.body)).name);
    expect(createdFolders[0]).toBe(".pending");
    expect(createdFolders[1]).toMatch(/^[a-f0-9]{64}$/);
    expect(request.mock.calls.some(([url]) => String(url).includes("permissions"))).toBe(false);
    const upload = request.mock.calls.find(([url]) => String(url).includes("/upload/"))!;
    expect(Buffer.from(upload[1]!.body as Uint8Array).toString()).toContain('"parents":["folder-2"]');
  });
  it("reuses the archived message on a retry instead of uploading again", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: "test-token" }))
      .mockResolvedValueOnce(Response.json({ files: [{ id: "existing-file", name: "saved.jpg" }] }));
    const result = await new GoogleDrive(config, request).saveEvidence({ employee, messageId: "123", workDate: "2026-10-26", bytes: new Uint8Array(), mimeType: "image/jpeg" });
    expect(result).toBe("drive:existing-file");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("moves backdated evidence to its work month before entry confirmation", async () => {
    let folderNumber = 0;
    const request = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "test-token" });
      if (init?.method === "PATCH") return Response.json({ id: "file-1" });
      if (url.pathname.endsWith("/file-1")) return Response.json({ id: "file-1", name: "2026-10-26_hash.jpg", parents: ["old-folder"] });
      if (init?.method === "POST") return Response.json({ id: `folder-${++folderNumber}` });
      return Response.json({ files: [] });
    });
    await new GoogleDrive(config, request).placeEvidence("drive:file-1", employee, "2026-09-30");
    const patch = request.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(String(patch[0])).toContain("removeParents=old-folder");
    expect(JSON.parse(String(patch[1]?.body)).name).toBe("20260930.jpg");
  });
});

describe("live feature configuration", () => {
  it("never enables live intake with only a channel secret or a feature flag", () => {
    expect(configuredLineReceiver({ NODE_ENV: "test", LINE_CHANNEL_SECRET: "test", LINE_INTAKE_ENABLED: "true" })).toBeUndefined();
    const missing = missingLineConfiguration({ NODE_ENV: "test", LINE_CHANNEL_SECRET: "must-not-be-returned" });
    expect(missing).toContain("LINE_CHANNEL_ACCESS_TOKEN");
    expect(missing).toContain("GOOGLE_REFRESH_TOKEN");
    expect(missing.join()).not.toContain("must-not-be-returned");
  });
});
