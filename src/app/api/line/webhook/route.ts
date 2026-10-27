import { createLineWebhookHandler } from "@/lib/line/webhook-handler";
import { configuredLineReceiver } from "@/lib/line/config";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  return createLineWebhookHandler({
    channelSecret: process.env.LINE_CHANNEL_SECRET,
    destinationId: process.env.LINE_BOT_USER_ID,
    receiver: configuredLineReceiver()
  })(request);
}
