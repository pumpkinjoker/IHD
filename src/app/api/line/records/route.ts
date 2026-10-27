import { allowsLocalTest } from "@/lib/line/local-test-access";
import { LocalLineStore } from "@/lib/line/local-database";
import { validMonth } from "@/lib/line/records";
import { configuredLineStore, configuredEvidenceArchive } from "@/lib/line/config";
import { EvidenceExpiredError } from "@/lib/line/supabase-archive";
import { bangkokDate } from "@/lib/line/intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!allowsLocalTest(request)) return new Response(null, { status: 404 });
  const params = new URL(request.url).searchParams;
  const month = params.get("month") || bangkokDate(new Date()).slice(0, 7);
  if (month && !validMonth(month)) return Response.json({ error: "เดือนต้องเป็น YYYY-MM" }, { status: 400 });
  try {
    const store = configuredLineStore();
    if (params.get("export") === "1") return store instanceof LocalLineStore
      ? Response.json(await store.exportData(), { headers: { "Cache-Control": "no-store" } })
      : Response.json({ error: "Local export is available only while using the local database" }, { status: 403 });
    const reference = params.get("image");
    if (reference) {
      if (!await store.savedImageExists(reference)) return new Response(null, { status: 404 });
      const media = await configuredEvidenceArchive().readEvidence(reference);
      return new Response(media.bytes, { headers: { "Content-Type": media.mimeType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }
    const [entries, employees] = await Promise.all([store.allEntries(month), store.listEmployees()]);
    return Response.json({ month, entries, employees }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof EvidenceExpiredError) return new Response(null, { status: 410 });
    return Response.json({ error: "อ่านรายการไม่สำเร็จ กรุณาลองอีกครั้ง" }, { status: 503 });
  }
}
