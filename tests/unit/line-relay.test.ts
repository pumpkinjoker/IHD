import { createHmac } from "node:crypto";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { handleWebhookRelay } from "../../scripts/line-webhook-relay.mjs";

const secret = "test-relay-secret";
function request(body: string, url = "/api/line/webhook", method = "POST", signed = true) {
  return Object.assign(Readable.from([Buffer.from(body)]), {
    url, method, headers: signed ? { "x-line-signature": createHmac("sha256", secret).update(body).digest("base64") } : {}
  });
}
function response() { return { writeHead: vi.fn(), end: vi.fn() }; }

describe("LINE-only public relay", () => {
  it("does not expose the app, local test API, files or query-string paths", async () => {
    const fetch = vi.fn();
    for (const url of ["/", "/line/local-test", "/api/line/local-test", "/.env.local", "/api/line/webhook?extra=true"]) {
      const result = response();
      await handleWebhookRelay(request("{}", url), result, { secret, fetch });
      expect(result.writeHead.mock.calls[0][0]).toBe(404);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requires a valid signature and forwards the identical original bytes", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    const invalid = response();
    await handleWebhookRelay(request("{}", undefined, undefined, false), invalid, { secret, fetch });
    expect(invalid.writeHead.mock.calls[0][0]).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    const body = '{ "destination": "bot", "events": [] }';
    const valid = response();
    await handleWebhookRelay(request(body), valid, { secret, fetch });
    expect(valid.writeHead.mock.calls[0][0]).toBe(200);
    expect(fetch.mock.calls[0][1].body.toString()).toBe(body);
    expect(fetch.mock.calls[0][0]).toBe("http://127.0.0.1:3000/api/line/webhook");
  });
  it("limits payload size and hides upstream response bodies", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("private employee data", { status: 503 }));
    const large = response();
    await handleWebhookRelay(request("x".repeat(1024 * 1024 + 1)), large, { secret, fetch });
    expect(large.writeHead.mock.calls[0][0]).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
    const failure = response();
    await handleWebhookRelay(request("{}"), failure, { secret, fetch });
    expect(failure.writeHead.mock.calls[0][0]).toBe(503);
    expect(failure.end.mock.calls[0][0]).not.toContain("private employee data");
  });
});
