import { verifyLineSignature, webhookSchema, type LineEvent } from "./webhook";

export type DurableLineReceiver = {
  /** Resolve only after events are durably saved; deduplicate by webhookEventId.
   * The implementation must queue media downloads immediately, serialize each
   * user's conversation and load the saved employee-ID association before intake.
   */
  receive: (events: LineEvent[]) => Promise<void>;
};

export function createLineWebhookHandler(config: {
  channelSecret?: string;
  destinationId?: string;
  receiver?: DurableLineReceiver;
}) {
  return async (request: Request): Promise<Response> => {
    if (!config.channelSecret) return Response.json({ error: "LINE is not configured" }, { status: 503 });
    // Read the original bytes once; do not parse or reserialize before HMAC.
    const rawBody = Buffer.from(await request.arrayBuffer());
    if (rawBody.length > 1024 * 1024) return Response.json({ error: "Payload too large" }, { status: 413 });
    if (!verifyLineSignature(rawBody, request.headers.get("x-line-signature"), config.channelSecret)) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }
    let decoded: unknown;
    try { decoded = JSON.parse(rawBody.toString("utf8")); }
    catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
    const parsed = webhookSchema.safeParse(decoded);
    if (!parsed.success) return Response.json({ error: "Invalid webhook" }, { status: 400 });
    if (config.destinationId && parsed.data.destination !== config.destinationId) {
      return Response.json({ error: "Unexpected destination" }, { status: 403 });
    }
    // LINE Developers' Verify button sends an empty events array.
    if (!parsed.data.events.length) return Response.json({ ok: true });
    // Never acknowledge real employee data until durable persistence is wired.
    if (!config.receiver) return Response.json({ error: "Intake storage is not connected" }, { status: 503 });
    try { await config.receiver.receive(parsed.data.events); }
    catch { return Response.json({ error: "Could not accept events" }, { status: 503 }); }
    return Response.json({ ok: true });
  };
}
