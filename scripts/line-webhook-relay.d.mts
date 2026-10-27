export function handleWebhookRelay(
  request: AsyncIterable<Uint8Array> & { method?: string; url?: string; headers: Record<string, string | string[] | undefined> },
  response: { writeHead(status: number, headers: Record<string, string>): unknown; end(body: string): unknown },
  options: { secret: string; fetch?: typeof fetch }
): Promise<unknown>;
